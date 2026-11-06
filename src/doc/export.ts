import type { DocumentExportSettings } from "./options";
import { createExportArticle } from "./render";
import type { ExportDocument } from "./render";
import { ensureExportRuntime, loadFontBytes } from "./runtime";
import type { ExportProgress } from "./vendor";

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
  settings: DocumentExportSettings,
  onProgress?: (progress: ExportProgress) => void,
): Promise<PdfExportResult> {
  const [fontBytes] = await Promise.all([loadFontBytes(), ensureExportRuntime()]);

  const api = globalThis.DocExport;
  if (!api) {
    throw new Error("导出内核未加载");
  }

  const title = settings.headerTitle || document.title || "未命名";
  const article = createExportArticle(document.html);

  let pages = 0;
  const blob = await api.exportElement(article, {
    paper: settings.paper,
    marginPt: settings.marginPt,
    headerTitle: settings.headerTitle,
    pageNumbers: settings.pageNumbers,
    cover: settings.cover,
    pageBreakOnH1: settings.pageBreakOnH1,
    compress: settings.compress,
    background: settings.background,
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
      if (typeof progress.totalPages === "number" && progress.totalPages > 0) {
        pages = progress.totalPages;
      }
      onProgress?.(progress);
    },
  });

  if (pages <= 0) {
    pages = await api.countPages(blob);
  }

  const fileName = pdfFileName(settings.fileName, document.title);
  downloadBlob(blob, fileName);
  return { blob, pages, fileName };
}

/**
 * The PDF keeps the document's normalized name; the first H1 is only a fallback
 * for an empty name. A Markdown suffix becomes `.pdf` instead of being doubled.
 */
export function pdfFileName(name: string, fallbackTitle = ""): string {
  const base = cleanPdfBase(name) || cleanPdfBase(fallbackTitle);
  return `${base || "未命名"}.pdf`;
}

function cleanPdfBase(value: string): string {
  return value
    .trim()
    .replace(/\.(?:md|markdown|txt)$/iu, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .trim();
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
