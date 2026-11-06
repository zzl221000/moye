import { isSafeDestination } from "@quirekit/msfe-core";
import { createEffect, createSignal, Show } from "solid-js";
import type { WritingSession } from "../writing/session";
import { CodeBlockIcon, ImageIcon, LinkIcon, TableIcon } from "./icons";

export interface InsertBarProps {
  /** Reads the mounted session lazily; it is created after the first render. */
  readonly session: () => WritingSession | null;
}

export default function InsertBar(props: InsertBarProps) {
  const [linkOpen, setLinkOpen] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [linkError, setLinkError] = createSignal<string | null>(null);

  let dialog: HTMLDialogElement | undefined;
  let linkButton: HTMLButtonElement | undefined;
  let urlInput: HTMLInputElement | undefined;

  createEffect(
    () => linkOpen(),
    (open) => {
      if (!open) {
        if (dialog?.open) dialog.close();
        return;
      }
      if (!dialog?.open) {
        try {
          dialog?.showModal();
        } catch (error) {
          console.error("[moye] 无法打开链接对话框", error);
        }
      }
      queueMicrotask(() => {
        urlInput?.focus();
        urlInput?.select();
      });
    },
  );

  function openLinkPrompt(): void {
    setUrl("");
    setLinkError(null);
    setLinkOpen(true);
  }

  function closeLinkPrompt(returnTo: "trigger" | "editor"): void {
    if (dialog?.open) dialog.close();
    setLinkOpen(false);
    setLinkError(null);
    queueMicrotask(() => {
      if (returnTo === "trigger") linkButton?.focus();
      else props.session()?.focus();
    });
  }

  function failLink(message: string): void {
    setLinkError(message);
    queueMicrotask(() => {
      urlInput?.focus();
      urlInput?.select();
    });
  }

  function submitLink(event: SubmitEvent): void {
    event.preventDefault();
    const value = url().trim();
    if (value.length === 0) {
      failLink("请输入链接地址");
      return;
    }
    if (!isSafeDestination(value)) {
      failLink("请输入有效的链接地址");
      return;
    }
    const session = props.session();
    if (!session || !session.insertLink(value)) {
      failLink("插入失败，请重试");
      return;
    }
    closeLinkPrompt("editor");
  }

  return (
    <>
      <div class="writing-bar" role="toolbar" aria-label="插入">
        <button
          class="icon-btn"
          type="button"
          aria-label="插入链接"
          title="插入链接"
          aria-haspopup="dialog"
          aria-controls="insert-link-dialog"
          aria-expanded={linkOpen() ? "true" : "false"}
          ref={(button) => {
            linkButton = button;
          }}
          onClick={openLinkPrompt}
        >
          <LinkIcon />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="插入图片"
          title="插入图片"
          onClick={() => {
            void props.session()?.insertImage();
          }}
        >
          <ImageIcon />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="插入表格"
          title="插入表格"
          onClick={() => {
            props.session()?.insertTable();
          }}
        >
          <TableIcon />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="插入代码块"
          title="插入代码块"
          onClick={() => {
            props.session()?.insertCodeBlock();
          }}
        >
          <CodeBlockIcon />
        </button>
      </div>

      <dialog
        class="insert-dialog"
        id="insert-link-dialog"
        aria-label="插入链接"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          closeLinkPrompt("trigger");
        }}
        onClick={(event) => {
          if (event.target === dialog) closeLinkPrompt("trigger");
        }}
      >
        <form class="insert-dialog__form" onSubmit={submitLink}>
          <label class="insert-dialog__label" for="insert-link-url">
            链接地址
          </label>
          <input
            id="insert-link-url"
            class="insert-dialog__input"
            ref={urlInput}
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck={false}
            placeholder="https://example.com"
            aria-invalid={linkError() ? "true" : "false"}
            aria-describedby={linkError() ? "insert-link-error" : undefined}
            value={url()}
            onInput={(event) => {
              setUrl(event.currentTarget.value);
              if (linkError()) setLinkError(null);
            }}
          />
          <Show when={linkError()}>
            <p class="insert-dialog__error" id="insert-link-error" role="alert">
              {linkError()}
            </p>
          </Show>
          <div class="insert-dialog__actions">
            <button
              class="btn"
              type="button"
              onClick={() => closeLinkPrompt("trigger")}
            >
              取消
            </button>
            <button class="btn btn--primary" type="submit">
              插入
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
