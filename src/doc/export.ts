import { createExportArticle } from "./render";
import type { ExportDocument } from "./render";
import { ensureExportRuntime, loadFontBytes } from "./runtime";

export type PdfExportResult = {
  blob: Blob;
  pages: number;
  fileName: string;
};

/**
 * Runs the frozen browser pipeline:
 *   shared HTML -> `DocExport.exportElement` (dompdf) -> Blob -> download.
 *
 * The DOM handed over is rebuilt from the seam's string, not the preview node,
 * so the preview's zoom/wrapper cannot influence page measurement.
 */
export async function exportDocumentToPdf(
  document: ExportDocument,
): Promise<PdfExportResult> {
  const [fontBytes] = await Promise.all([loadFontBytes(), ensureExportRuntime()]);

  const api = globalThis.DocExport;
  if (!api) {
    throw new Error("导出内核未加载");
  }

  const title = document.title || "未命名";
  const article = createExportArticle(document.html);

  let pages = 0;
  const blob = await api.exportElement(article, {
    paper: "a4",
    marginPt: 36,
    headerTitle: title,
    pageNumbers: true,
    cover: true,
    pageBreakOnH1: false,
    compress: true,
    background: document.background,
    headerColor: document.headerColor,
    footerColor: document.footerColor,
    fontBytes,
    metadata: {
      title,
      creator: "墨页",
      producer: "dompdf.js",
      keywords: ["Markdown", "PDF"],
    },
    onProgress: (progress) => {
      if (progress.stage === "done" && typeof progress.totalPages === "number") {
        pages = progress.totalPages;
      }
    },
  });

  if (pages <= 0) {
    pages = await api.countPages(blob);
  }

  const fileName = pdfFileName(title);
  downloadBlob(blob, fileName);
  return { blob, pages, fileName };
}

function pdfFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "未命名";
  return `${base}.pdf`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
