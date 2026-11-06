import { createMsfeEditor, type MsfeEditor } from "@quirekit/msfe-core";
import { StarterKit } from "@quirekit/msfe-starter-kit";
import {
  browserDraftStorage,
  readDraft,
  writeDraft,
  type Draft,
  type DraftStorage,
} from "./draft";
import {
  chooseSaveTarget,
  detectFileAccess,
  isAbortError,
  isFileHandle,
  openFilePicker,
  saveFilePicker,
  type FileAccessSupport,
  type WritableFileHandle,
} from "./file-access";
import {
  FALLBACK_FILE_NAME,
  isMarkdownFile,
  normalizeFileName,
  normalizeLineEndings,
} from "./filename";
import {
  buildCodeBlockInsertion,
  buildTableInsertion,
  imageMimeType,
  MAX_INLINE_IMAGE_BYTES,
  planImageInsertion,
  PLACEHOLDER_IMAGE,
  type ImageInsertion,
  type InsertionContext,
  type InsertionPlan,
} from "./insert";
import { SAMPLE_MARKDOWN } from "./sample";

export type SaveState = "idle" | "saved" | "dirty" | "error";

export interface WritingState {
  /** Display name of the current document. */
  readonly name: string;
  /** File/draft status shown by the shell. */
  readonly saveState: SaveState;
  /** Last serialized Markdown, refreshed on the draft debounce and on save. */
  readonly markdown: string;
  /** False only before a draft is restored or a document is opened. */
  readonly hasDocument: boolean;
}

export interface WritingSessionOptions {
  readonly host: HTMLElement;
  readonly onState: (state: WritingState) => void;
  /** Defaults to localStorage; pass null to disable drafts. */
  readonly storage?: DraftStorage | null;
}

/** Debounce for automatic draft writes, in milliseconds. */
export const DRAFT_DEBOUNCE_MS = 600;

const OPEN_FILE_TYPES: FilePickerOptions = {
  multiple: false,
  types: [
    {
      description: "Markdown",
      accept: {
        "text/markdown": [".md", ".markdown"],
        "text/plain": [".txt"],
      },
    },
  ],
};

const SAVE_FILE_TYPES: SaveFilePickerOptions = {
  suggestedName: FALLBACK_FILE_NAME,
  types: OPEN_FILE_TYPES.types ?? [],
};

const IMAGE_FILE_TYPES: FilePickerOptions = {
  multiple: false,
  types: [
    {
      description: "图片",
      accept: {
        "image/png": [".png"],
        "image/jpeg": [".jpg", ".jpeg"],
        "image/gif": [".gif"],
        "image/webp": [".webp"],
      },
    },
  ],
};

/**
 * Owns one MSFE editor, the document's file handle and its local draft.
 * Markdown is read from `editor.getMarkdown()`; no parallel rich-text state
 * is kept here.
 */
export class WritingSession {
  private readonly options: WritingSessionOptions;
  private readonly storage: DraftStorage | null;
  private readonly support: FileAccessSupport;
  private readonly fileInput: HTMLInputElement;
  private readonly disposers: Array<() => void> = [];

  private editor: MsfeEditor | null = null;
  private unsubscribe: (() => void) | null = null;
  private handle: WritableFileHandle | null = null;
  private name = FALLBACK_FILE_NAME;
  private markdown = "";
  private saveState: SaveState = "idle";
  private hasDocument = false;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private draftWriteFailed = false;
  private busy = false;
  private imageBusy = false;
  private destroyed = false;
  private documentSequence = 0;

  constructor(options: WritingSessionOptions) {
    this.options = options;
    this.storage =
      options.storage === undefined ? browserDraftStorage() : options.storage;
    this.support = detectFileAccess(window);
    this.fileInput = this.createFileInput();

    const draft = readDraft(this.storage);
    if (draft) {
      const content = normalizeLineEndings(draft.content);
      if (this.mount(content)) {
        this.name = normalizeFileName(draft.name);
        this.markdown = content;
        this.saveState = "saved";
        this.hasDocument = true;
      }
    }

    this.installWindowListeners();
    this.installTestHook();
    this.emit();
  }

  /** Opens the OS picker, falling back to a hidden file input. */
  async open(): Promise<void> {
    if (this.busy || this.destroyed) return;
    const picker = openFilePicker(window, OPEN_FILE_TYPES);
    if (picker) {
      this.busy = true;
      try {
        const handles = await picker;
        if (this.destroyed) return;
        const handle = handles[0];
        if (handle) {
          try {
            await this.loadFromHandle(handle);
          } catch (error) {
            console.error("[moye] 读取文件失败", error);
          }
        }
        return;
      } catch (error) {
        if (isAbortError(error)) return;
        console.error("[moye] 打开文件失败，改用文件选择框", error);
      } finally {
        this.busy = false;
      }
    }
    this.fileInput.value = "";
    this.fileInput.click();
  }

  /** Writes to the current handle, or asks where to save, or downloads. */
  async save(): Promise<void> {
    if (!this.editor || this.busy || this.destroyed) return;
    const markdown = this.editor.getMarkdown();
    const target = chooseSaveTarget(this.handle, this.support);
    if (target === "handle") {
      await this.writeToCurrentHandle(markdown);
      return;
    }
    if (target === "picker") {
      await this.writeWithPicker(markdown);
      return;
    }
    this.download(markdown);
  }

  /** Always asks for a destination, then downloads when no save picker exists. */
  async saveAs(): Promise<void> {
    if (!this.editor || this.busy || this.destroyed) return;
    await this.writeWithPicker(this.editor.getMarkdown());
  }

  /** Replaces the document with the bundled sample. */
  loadSample(): void {
    if (this.destroyed) return;
    this.loadDocument(SAMPLE_MARKDOWN, "示例文档.md", null);
  }

  /** Wraps the selection, or the URL when nothing is selected, in a link. */
  insertLink(url: string): boolean {
    const editor = this.editor;
    if (!editor || this.destroyed) return false;
    const inserted = editor.commands.insertLink(url);
    if (inserted) editor.focus();
    return inserted;
  }

  /**
   * Inserts `![alt](src)`. A local image is embedded as a data URL when the
   * browser picker is available and the file fits the inline limit; otherwise
   * the Markdown gets a placeholder path. Nothing is uploaded.
   */
  async insertImage(): Promise<void> {
    if (!this.editor || this.destroyed || this.imageBusy) return;
    let picker: Promise<FileSystemFileHandle[]> | null;
    try {
      picker = openFilePicker(window, IMAGE_FILE_TYPES);
    } catch (error) {
      console.error("[moye] 无法打开图片选择器", error);
      this.insertImageMarkdown(planImageInsertion(PLACEHOLDER_IMAGE, null));
      return;
    }
    if (!picker) {
      this.insertImageMarkdown(
        planImageInsertion(PLACEHOLDER_IMAGE, null),
      );
      return;
    }

    this.imageBusy = true;
    try {
      const handles = await picker;
      const handle = handles[0];
      if (!handle) return;
      const file = await handle.getFile();
      const type = imageMimeType(file.name, file.type);
      if (
        this.destroyed ||
        type === null ||
        file.size <= 0 ||
        file.size > MAX_INLINE_IMAGE_BYTES
      ) {
        this.insertImageMarkdown(planImageInsertion(file, null));
        return;
      }
      const dataUrl = await readImageDataUrl(file);
      if (this.destroyed) return;
      this.insertImageMarkdown(
        planImageInsertion(
          { name: file.name, type: file.type, size: file.size },
          dataUrl,
        ),
      );
    } catch (error) {
      if (isAbortError(error)) return;
      console.error("[moye] 插入图片失败", error);
      this.insertImageMarkdown(planImageInsertion(PLACEHOLDER_IMAGE, null));
    } finally {
      this.imageBusy = false;
    }
  }

  /** Inserts a GFM table template, replacing a non-empty selection. */
  insertTable(): boolean {
    const context = this.insertionContext();
    return context !== null
      ? this.applyInsertion(buildTableInsertion(context))
      : false;
  }

  /** Wraps the selection in a fenced block, or inserts an empty fence. */
  insertCodeBlock(): boolean {
    const context = this.insertionContext();
    return context !== null
      ? this.applyInsertion(buildCodeBlockInsertion(context))
      : false;
  }

  /** Returns keyboard focus to the editor. */
  focus(): void {
    this.editor?.focus();
  }

  /** Flushes the pending draft; safe to call from pagehide/visibilitychange. */
  flushDraft(notify = true): void {
    this.cancelDraftTimer();
    if (!this.editor) return;
    this.markdown = this.editor.getMarkdown();
    this.persistDraft();
    if (notify) this.emit();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.flushDraft(false);
    this.destroyed = true;
    this.cancelDraftTimer();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.editor?.destroy();
    this.editor = null;
    this.fileInput.remove();
    for (const dispose of this.disposers.splice(0)) dispose();
  }

  private mount(markdown: string): boolean {
    try {
      const editor = createMsfeEditor({
        parent: this.options.host,
        documentId: this.nextDocumentId(),
        markdown,
        mode: "live",
        extensions: [StarterKit],
        label: "文档",
        onError: (error) => {
          console.error("[moye] 编辑器错误", error);
        },
      });
      this.editor = editor;
      this.unsubscribe = editor.onChange(() => {
        this.handleSourceChange();
      });
      return true;
    } catch (error) {
      console.error("[moye] 写作面无法挂载", error);
      this.editor = null;
      return false;
    }
  }

  private handleSourceChange(): void {
    if (this.destroyed) return;
    this.saveState = "dirty";
    this.emit();
    this.scheduleDraft();
  }

  private insertionContext(): InsertionContext | null {
    const editor = this.editor;
    if (!editor || this.destroyed) return null;
    const range = editor.state.selection.main;
    return {
      before: editor.state.sliceDoc(0, range.from),
      after: editor.state.sliceDoc(range.to),
      selected: editor.state.sliceDoc(range.from, range.to),
    };
  }

  /**
   * Applies one insertion plan as an editor command. The plan's selection is
   * relative to the replacement text, so the caret lands where the template
   * expects it after the edit.
   */
  private applyInsertion(plan: InsertionPlan): boolean {
    const editor = this.editor;
    if (!editor || this.destroyed) return false;
    const result = editor.run((state) => {
      const range = state.selection.main;
      const base = range.from;
      return {
        changes: { from: range.from, to: range.to, insert: plan.text },
        selection: {
          anchor: base + plan.selection.from,
          head: base + plan.selection.to,
        },
      };
    });
    if (!result.ok) {
      console.error("[moye] 插入失败", result.reason);
      return false;
    }
    editor.focus();
    return true;
  }

  private insertImageMarkdown(image: ImageInsertion): void {
    const editor = this.editor;
    if (!editor || this.destroyed) return;
    if (!editor.commands.insertImage({ alt: image.alt, url: image.url })) {
      console.error("[moye] 图片 Markdown 插入失败");
      return;
    }
    editor.focus();
  }

  private scheduleDraft(): void {
    this.cancelDraftTimer();
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      this.flushDraft();
    }, DRAFT_DEBOUNCE_MS);
  }

  private cancelDraftTimer(): void {
    if (this.draftTimer === null) return;
    clearTimeout(this.draftTimer);
    this.draftTimer = null;
  }

  private persistDraft(): void {
    if (this.draftWriteFailed) return;
    const draft: Draft = {
      name: this.name,
      content: this.markdown,
      at: Date.now(),
    };
    if (!writeDraft(this.storage, draft)) {
      this.draftWriteFailed = true;
    }
  }

  private loadDocument(
    markdown: string,
    name: string,
    handle: WritableFileHandle | null,
  ): boolean {
    const text = normalizeLineEndings(markdown);
    if (this.editor) {
      const result = this.editor.replaceDocument(text, this.nextDocumentId());
      if (!result.ok) {
        console.error("[moye] 无法替换文档", result.reason);
        this.saveState = "error";
        this.emit();
        return false;
      }
    } else if (!this.mount(text)) {
      this.saveState = "error";
      this.emit();
      return false;
    }

    this.handle = handle;
    this.name = normalizeFileName(name);
    this.markdown = text;
    this.hasDocument = true;
    this.saveState = "saved";
    this.cancelDraftTimer();
    this.persistDraft();
    this.emit();
    this.editor?.focus();
    return true;
  }

  private async loadFromHandle(handle: FileSystemFileHandle): Promise<void> {
    const file = await handle.getFile();
    await this.readAndLoad(file, handle);
  }

  private async readAndLoad(
    file: File,
    handle: WritableFileHandle | null,
  ): Promise<void> {
    if (!isMarkdownFile(file.name, file.type)) {
      throw new Error("不是 Markdown 文件");
    }
    const text = await file.text();
    if (this.destroyed) return;
    this.loadDocument(text, file.name, handle);
  }

  private async writeToCurrentHandle(markdown: string): Promise<void> {
    const handle = this.handle;
    if (!handle) return;
    this.busy = true;
    try {
      if (!(await this.ensureWritePermission(handle))) {
        throw new Error("没有写入权限");
      }
      if (this.destroyed) return;
      await this.writeToHandle(handle, markdown);
      this.completeSave(markdown, normalizeFileName(handle.name));
    } catch (error) {
      this.handleSaveError(error);
    } finally {
      this.busy = false;
    }
  }

  private async writeWithPicker(markdown: string): Promise<void> {
    const picker = saveFilePicker(window, {
      ...SAVE_FILE_TYPES,
      suggestedName: normalizeFileName(this.name),
    });
    if (!picker) {
      this.download(markdown);
      return;
    }
    this.busy = true;
    try {
      const handle = await picker;
      if (this.destroyed) return;
      await this.writeToHandle(handle, markdown);
      this.handle = handle;
      this.completeSave(markdown, normalizeFileName(handle.name));
    } catch (error) {
      this.handleSaveError(error);
    } finally {
      this.busy = false;
    }
  }

  private async ensureWritePermission(
    handle: WritableFileHandle,
  ): Promise<boolean> {
    const { queryPermission, requestPermission } = handle;
    if (typeof queryPermission !== "function") return true;
    const descriptor: FileSystemHandlePermissionDescriptor = {
      mode: "readwrite",
    };
    if ((await queryPermission.call(handle, descriptor)) === "granted") {
      return true;
    }
    if (typeof requestPermission !== "function") return false;
    return (await requestPermission.call(handle, descriptor)) === "granted";
  }

  private async writeToHandle(
    handle: WritableFileHandle,
    markdown: string,
  ): Promise<void> {
    const writable = await handle.createWritable();
    try {
      await writable.write(markdown);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch (abortError) {
        console.warn("[moye] 写入中止失败", abortError);
      }
      throw error;
    }
  }

  private download(markdown: string): void {
    try {
      const name = normalizeFileName(this.name);
      const blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30_000);
      this.handle = null;
      this.completeSave(markdown, name);
    } catch (error) {
      this.handleSaveError(error);
    }
  }

  private completeSave(markdown: string, name: string): void {
    this.markdown = markdown;
    this.name = name;
    this.saveState = "saved";
    this.cancelDraftTimer();
    this.persistDraft();
    this.emit();
  }

  private handleSaveError(error: unknown): void {
    if (isAbortError(error)) return;
    console.error("[moye] 保存失败", error);
    this.saveState = "error";
    this.emit();
  }

  private createFileInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/markdown,text/plain";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      void this.readAndLoad(file, null).catch((error: unknown) => {
        console.error("[moye] 打开文件失败", error);
      });
    });
    document.body.append(input);
    return input;
  }

  private installWindowListeners(): void {
    this.listen(
      window,
      "keydown",
      (event) => {
        this.onKeyDown(event);
      },
      true,
    );
    this.listen(window, "dragover", (event) => {
      this.onDragOver(event);
    });
    this.listen(window, "drop", (event) => {
      this.onDrop(event);
    });
    this.listen(window, "pagehide", () => {
      this.flushDraft(true);
    });
    this.listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flushDraft(true);
    });
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: (event: Event) => void,
    capture = false,
  ): void {
    target.addEventListener(type, listener, capture);
    this.disposers.push(() => {
      target.removeEventListener(type, listener, capture);
    });
  }

  private onKeyDown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.defaultPrevented || event.isComposing) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s" && event.shiftKey) {
      event.preventDefault();
      void this.saveAs();
    } else if (key === "s") {
      event.preventDefault();
      void this.save();
    } else if (key === "o") {
      event.preventDefault();
      void this.open();
    }
  }

  private onDragOver(event: Event): void {
    if (!(event instanceof DragEvent) || !event.dataTransfer) return;
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  private onDrop(event: Event): void {
    if (!(event instanceof DragEvent) || !event.dataTransfer) return;
    event.preventDefault();
    void this.importDrop(event.dataTransfer);
  }

  private async importDrop(data: DataTransfer): Promise<void> {
    const item = Array.from(data.items).find((entry) => entry.kind === "file");
    if (item?.getAsFileSystemHandle) {
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle && isFileHandle(handle) && isMarkdownFile(handle.name)) {
          await this.loadFromHandle(handle);
          return;
        }
      } catch (error) {
        console.warn("[moye] 无法读取拖入文件的句柄", error);
      }
    }
    const file = Array.from(data.files).find((candidate) =>
      isMarkdownFile(candidate.name, candidate.type),
    );
    if (!file) return;
    try {
      await this.readAndLoad(file, null);
    } catch (error) {
      console.error("[moye] 打开拖入文件失败", error);
    }
  }

  private installTestHook(): void {
    if (!import.meta.env.DEV) return;
    const hook: MoyeSmokeHook = {
      loadSample: () => {
        this.loadSample();
      },
      replace: (markdown: string) => {
        if (!this.editor) return false;
        const text = normalizeLineEndings(markdown);
        const result = this.editor.replaceDocument(
          text,
          this.nextDocumentId(),
        );
        if (!result.ok) return false;
        this.markdown = text;
        this.hasDocument = true;
        this.saveState = "dirty";
        this.emit();
        this.scheduleDraft();
        return true;
      },
      getMarkdown: () => (this.editor ? this.editor.getMarkdown() : null),
      focus: () => {
        this.editor?.focus();
      },
    };
    window.__moye = hook;
    this.disposers.push(() => {
      if (window.__moye === hook) delete window.__moye;
    });
  }

  private nextDocumentId(): string {
    this.documentSequence += 1;
    return `moye-doc-${this.documentSequence}`;
  }

  private emit(): void {
    if (this.destroyed) return;
    this.options.onState({
      name: this.name,
      saveState: this.saveState,
      markdown: this.markdown,
      hasDocument: this.hasDocument,
    });
  }
}

/** @param file - Supported image file. @returns Its `data:` URL. */
function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("图片读取结果不是文本"));
      }
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("图片读取失败"));
    });
    reader.readAsDataURL(file);
  });
}
