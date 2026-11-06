import { A4_PREVIEW } from "./paper";

/**
 * Height of the printable column on one A4 sheet at the default 36pt margin.
 * This matches the preview paper's 48px padding.
 */
export const PAGE_CONTENT_HEIGHT_PX =
  A4_PREVIEW.heightPx - A4_PREVIEW.marginPx * 2;

/**
 * Page count estimate for the status bar.
 *
 * The preview is one continuous sheet, so its laid-out content height divided
 * by one page's content height is only an estimate: real pagination belongs to
 * dompdf (docs/adr/0001-export-authority-dompdf.md). The estimate deliberately
 * ignores covering headers/footers and break-avoid rules, and returns 0 for an
 * empty document instead of claiming one blank page.
 */
export function estimatePageCount(
  contentHeightPx: number,
  pageContentHeightPx: number = PAGE_CONTENT_HEIGHT_PX,
): number {
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) return 0;
  if (!Number.isFinite(pageContentHeightPx) || pageContentHeightPx <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(contentHeightPx / pageContentHeightPx));
}
