import { createSignal } from "solid-js";
import MIXED_MARKDOWN from "../tests/fixtures/mixed.md?raw";
import { exportDocumentToPdf } from "./doc/export";
import { renderExportDocument } from "./doc/render";
import { browserDraftStorage, readDraft } from "./writing/draft";
import { FALLBACK_FILE_NAME } from "./writing/filename";
import type { WritingSession, WritingState } from "./writing/session";
import PreviewPane from "./shell/PreviewPane";
import StatusBar from "./shell/StatusBar";
import TopBar from "./shell/TopBar";
import WritingPane from "./shell/WritingPane";

const INITIAL_STATE: WritingState = {
  name: FALLBACK_FILE_NAME,
  saveState: "idle",
  markdown: "",
  hasDocument: false,
};

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

export default function App() {
  // Ticket 04: one fixed document, rendered through the shared pure seam.
  const [previewDocument] = createSignal(renderExportDocument(MIXED_MARKDOWN));
  const [exporting, setExporting] = createSignal(false);
  const [exportError, setExportError] = createSignal<string | null>(null);

  const [docState, setDocState] = createSignal<WritingState>(
    initialWritingState(),
  );
  let session: WritingSession | null = null;

  const words = () =>
    Array.from(docState().markdown.replace(/\s/gu, "")).length;

  async function handleExport(): Promise<void> {
    if (exporting()) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportDocumentToPdf(previewDocument());
    } catch (error) {
      console.error(error);
      setExportError(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <style id="docTheme">{previewDocument().css}</style>

      <div class="app-shell">
        <TopBar
          fileName={docState().name}
          onOpen={() => {
            void session?.open();
          }}
          onSave={() => {
            void session?.save();
          }}
          onExport={() => void handleExport()}
          exporting={exporting()}
          exportError={exportError()}
        />

        <main class="workspace" aria-label="工作区">
          <WritingPane
            hasDocument={docState().hasDocument}
            onState={(state) => {
              setDocState(state);
            }}
            onReady={(created) => {
              session = created;
            }}
          />
          <div class="workspace__splitter" aria-hidden="true" />
          <PreviewPane document={previewDocument()} />
        </main>

        <StatusBar
          fileName={docState().name}
          words={words()}
          pages={0}
          saveState={docState().saveState}
        />
      </div>
    </>
  );
}
