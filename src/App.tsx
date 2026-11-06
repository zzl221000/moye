import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { exportDocumentToPdf } from "./doc/export";
import {
  browserOptionsStorage,
  exportSettingsFor,
  readOptions,
  renderOptionsFor,
  writeOptions,
  type DocumentOptions,
} from "./doc/options";
import { pageContentHeight, paperMetrics } from "./doc/paper";
import { renderExportDocument } from "./doc/render";
import {
  browserSplitStorage,
  clampSplit,
  readSplit,
  SPLIT_PERCENT_MAX,
  SPLIT_PERCENT_MIN,
  SPLIT_STEP,
  writeSplit,
} from "./shell/split";
import { countCharacters } from "./writing/count";
import { browserDraftStorage, readDraft } from "./writing/draft";
import { FALLBACK_FILE_NAME } from "./writing/filename";
import type { WritingSession, WritingState } from "./writing/session";
import PreviewPane from "./shell/PreviewPane";
import SettingsPanel, { type ThemeChoice } from "./shell/SettingsPanel";
import StatusBar from "./shell/StatusBar";
import TopBar from "./shell/TopBar";
import WritingPane from "./shell/WritingPane";

const INITIAL_STATE: WritingState = {
  name: FALLBACK_FILE_NAME,
  saveState: "idle",
  markdown: "",
  hasDocument: false,
};

/** Preview refresh delay after a keystroke, in milliseconds. */
export const PREVIEW_DEBOUNCE_MS = 150;

/** One actionable sentence; the technical cause stays in the console. */
const EXPORT_FAILURE_MESSAGE = "导出失败，请重试";

function initialWritingState(): WritingState {
  const draft = readDraft(browserDraftStorage());
  if (!draft) return INITIAL_STATE;
  return {
    name: draft.name,
    saveState: "saved",
    markdown: draft.content,
    hasDocument: true,
  };
}

/** Document themes ship in the frozen `themes.js` table. */
function readThemeChoices(): ThemeChoice[] {
  const themes = globalThis.MOYE_THEMES ?? {};
  return Object.entries(themes).map(([id, theme]) => ({
    id,
    label: theme.label ?? id,
  }));
}

type SplitDrag = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startSplit: number;
  /** Width the two panes share, excluding the separator itself. */
  readonly span: number;
};

export default function App() {
  const initial = initialWritingState();
  const splitStorage = browserSplitStorage();
  const optionsStorage = browserOptionsStorage();
  const themeChoices = readThemeChoices();
  const initialOptions = readOptions(
    optionsStorage,
    themeChoices.map((theme) => theme.id),
  );

  const [docState, setDocState] = createSignal<WritingState>(initial);
  const [previewMarkdown, setPreviewMarkdown] = createSignal(initial.markdown);
  const [options, setOptions] = createSignal<DocumentOptions>(initialOptions);
  // Solid 2 stages signal writes inside one interaction, so a handler that
  // composes a patch from `options()` can read the previous object. Settings
  // changes are merged here, in order, against the last committed value.
  let currentOptions = initialOptions;
  const renderOptions = createMemo(() => renderOptionsFor(options()));
  const previewDocument = createMemo(() =>
    renderExportDocument(previewMarkdown(), renderOptions()),
  );
  const previewPaper = createMemo(() =>
    paperMetrics(options().paper, Number(options().margin)),
  );
  const previewBackground = () =>
    options().background || previewDocument().background;
  const hasPageBands = createMemo(
    () =>
      Boolean(options().headerTitle.trim() || previewDocument().title) ||
      options().pageNumbers,
  );
  const previewPageHeight = createMemo(() =>
    pageContentHeight(previewPaper(), hasPageBands()),
  );
  const [pages, setPages] = createSignal(0);
  const [split, setSplit] = createSignal(readSplit(splitStorage));
  const [resizing, setResizing] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);
  const [exportError, setExportError] = createSignal<string | null>(null);

  let session: WritingSession | null = null;
  let settingsButton: HTMLButtonElement | null = null;
  let drag: SplitDrag | null = null;

  // The preview follows the document, but not on every keystroke: rendering
  // and sanitizing a long document synchronously would stall typing. Theme and
  // detail CSS are applied immediately because they change no source text.
  createEffect(
    () => ({
      markdown: docState().markdown,
      preview: previewMarkdown(),
    }),
    ({ markdown, preview }) => {
      if (markdown === preview) return;
      const timer = setTimeout(() => {
        setPreviewMarkdown(markdown);
      }, PREVIEW_DEBOUNCE_MS);
      return () => clearTimeout(timer);
    },
  );

  // Keep the resize cursor while a pointer drag is captured by the handle.
  createEffect(
    () => resizing(),
    (active) => {
      document.body.classList.toggle("is-resizing", active);
      return () => document.body.classList.remove("is-resizing");
    },
  );

  function commitSplit(value: number): void {
    const next = clampSplit(value);
    setSplit(next);
    writeSplit(splitStorage, next);
  }

  function handleSplitterKeyDown(event: KeyboardEvent): void {
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = split() - SPLIT_STEP;
        break;
      case "ArrowRight":
        next = split() + SPLIT_STEP;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    commitSplit(next);
  }

  function updateOptions(patch: Partial<DocumentOptions>): void {
    const current = currentOptions;
    let next: DocumentOptions = { ...current, ...patch };
    if (patch.theme !== undefined && patch.theme !== current.theme) {
      const theme = (globalThis.MOYE_THEMES ?? {})[patch.theme];
      if (theme) next = { ...next, background: theme.background };
    }
    currentOptions = next;
    setOptions(next);
    writeOptions(optionsStorage, next);
  }

  function closeSettings(): void {
    setSettingsOpen(false);
  }

  function focusSettingsButton(): void {
    settingsButton?.focus();
  }

  async function handleExport(): Promise<void> {
    if (exporting() || !docState().hasDocument) return;
    setExporting(true);
    setExportError(null);
    try {
      // Export the newest Markdown, not the possibly debounced preview, so a
      // quick Ctrl+Shift+E can never ship the previous keystroke. Theme, paper
      // and layout come from the same settings object the preview uses.
      const document = renderExportDocument(
        docState().markdown,
        renderOptions(),
      );
      await exportDocumentToPdf(
        document,
        exportSettingsFor(options(), document),
      );
    } catch (error) {
      console.error(error);
      setExportError(EXPORT_FAILURE_MESSAGE);
    } finally {
      setExporting(false);
    }
  }

  if (import.meta.env.DEV) {
    const hook: MoyeSettingsHook = {
      getOptions: () => ({ ...options() }),
      getExportSettings: () =>
        exportSettingsFor(options(), previewDocument()),
    };
    window.__moyeSettings = hook;
    onCleanup(() => {
      if (window.__moyeSettings === hook) delete window.__moyeSettings;
    });
  }

  return (
    <>
      <style id="docTheme">{previewDocument().css}</style>

      <div class="app-shell">
        <TopBar
          fileName={docState().name}
          canExport={docState().hasDocument}
          onOpen={() => {
            void session?.open();
          }}
          onSave={() => {
            void session?.save();
          }}
          onExport={() => void handleExport()}
          onSettings={() => setSettingsOpen(true)}
          onSettingsButton={(button) => {
            settingsButton = button;
          }}
          settingsOpen={settingsOpen()}
          exporting={exporting()}
          exportError={exportError()}
        />

        <main
          class={`workspace${resizing() ? " workspace--resizing" : ""}`}
          aria-label="工作区"
          style={{
            "--moye-split-writing": `${split()}fr`,
            "--moye-split-preview": `${1 - split()}fr`,
          }}
        >
          <WritingPane
            hasDocument={docState().hasDocument}
            onState={(state) => {
              setDocState(state);
            }}
            onReady={(created) => {
              session = created;
            }}
          />

          <div
            class="workspace__splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整写作面与版式预览宽度"
            aria-controls="writing-pane preview-pane"
            aria-valuemin={SPLIT_PERCENT_MIN}
            aria-valuemax={SPLIT_PERCENT_MAX}
            aria-valuenow={Math.round(split() * 100)}
            aria-valuetext={`写作面 ${Math.round(split() * 100)}%，版式预览 ${Math.round((1 - split()) * 100)}%`}
            tabindex="0"
            onKeyDown={(event) => handleSplitterKeyDown(event)}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const workspace = event.currentTarget.parentElement;
              if (!workspace) return;
              const span =
                workspace.getBoundingClientRect().width -
                event.currentTarget.getBoundingClientRect().width;
              if (span <= 0) return;
              drag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startSplit: split(),
                span,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              setResizing(true);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              const current = drag;
              if (!current || current.pointerId !== event.pointerId) return;
              const delta = (event.clientX - current.startX) / current.span;
              setSplit(clampSplit(current.startSplit + delta));
            }}
            onPointerUp={(event) => {
              if (!drag || drag.pointerId !== event.pointerId) return;
              drag = null;
              setResizing(false);
              writeSplit(splitStorage, split());
            }}
            onPointerCancel={() => {
              if (!drag) return;
              drag = null;
              setResizing(false);
              writeSplit(splitStorage, split());
            }}
          />

          <PreviewPane
            document={previewDocument()}
            paper={previewPaper()}
            background={previewBackground()}
            pageContentHeightPx={previewPageHeight()}
            h1Break={options().pageBreakOnH1}
            onPageEstimate={(count) => setPages(count)}
          />
        </main>

        <StatusBar
          fileName={docState().name}
          characters={countCharacters(docState().markdown)}
          pages={pages()}
          saveState={docState().saveState}
        />

        <SettingsPanel
          open={settingsOpen()}
          options={options()}
          themes={themeChoices}
          onChange={updateOptions}
          onClose={closeSettings}
          returnFocus={focusSettingsButton}
        />
      </div>
    </>
  );
}
