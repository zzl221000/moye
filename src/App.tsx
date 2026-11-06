import { createSignal } from "solid-js";
import MIXED_MARKDOWN from "../tests/fixtures/mixed.md?raw";
import { exportDocumentToPdf } from "./doc/export";
import { renderExportDocument } from "./doc/render";
import PreviewPane from "./shell/PreviewPane";
import StatusBar from "./shell/StatusBar";
import TopBar from "./shell/TopBar";
import WritingPane from "./shell/WritingPane";

const SHELL_FILE_NAME = "未命名.md";

export default function App() {
  // Ticket 04: one fixed document, rendered through the shared pure seam.
  const [document] = createSignal(renderExportDocument(MIXED_MARKDOWN));
  const [exporting, setExporting] = createSignal(false);
  const [exportError, setExportError] = createSignal<string | null>(null);

  async function handleExport(): Promise<void> {
    if (exporting()) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportDocumentToPdf(document());
    } catch (error) {
      console.error(error);
      setExportError(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <style id="docTheme">{document().css}</style>

      <div class="app-shell">
        <TopBar
          fileName={SHELL_FILE_NAME}
          onExport={() => void handleExport()}
          exporting={exporting()}
          exportError={exportError()}
        />

        <main class="workspace" aria-label="工作区">
          <WritingPane />
          <div class="workspace__splitter" aria-hidden="true" />
          <PreviewPane document={document()} />
        </main>

        <StatusBar fileName={SHELL_FILE_NAME} words={0} pages={0} saveState="idle" />
      </div>
    </>
  );
}
