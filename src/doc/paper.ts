/**
 * Paper geometry for the 版式预览.
 *
 * These numbers mirror `PAPERS` and `metrics()` in the frozen `export-doc.js`:
 * the preview must measure the same sheet the export hands to dompdf, but it
 * must not depend on the export kernel being loaded. Keep the two tables in
 * sync when a paper format is added.
 */

export const PAPER_KINDS = ["a4", "a4-landscape", "letter"] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

export type PageMetrics = {
  widthPt: number;
  heightPt: number;
  marginPt: number;
  marginPx: number;
  widthPx: number;
  heightPx: number;
  contentWidthPx: number;
  headerHeight: number;
  footerHeight: number;
};

const PT_TO_PX = 96 / 72;

/** Frozen band heights from `export-doc.js`. */
export const PAGE_HEADER_HEIGHT = 34;
export const PAGE_FOOTER_HEIGHT = 28;

const PAPERS: Readonly<
  Record<PaperKind, { readonly widthPt: number; readonly heightPt: number }>
> = {
  a4: { widthPt: 595.5, heightPt: 842.25 },
  "a4-landscape": { widthPt: 842.25, heightPt: 595.5 },
  letter: { widthPt: 612, heightPt: 792 },
};

export function isPaperKind(value: unknown): value is PaperKind {
  return (
    typeof value === "string" &&
    (PAPER_KINDS as readonly string[]).includes(value)
  );
}

/** Margins offered by the panel, in PDF points. */
export const MARGIN_VALUES = ["36", "18", "0"] as const;
export type MarginValue = (typeof MARGIN_VALUES)[number];

export function isMarginValue(value: unknown): value is MarginValue {
  return (
    typeof value === "string" &&
    (MARGIN_VALUES as readonly string[]).includes(value)
  );
}

/** Same result as `DocExport.metrics(paper, margin)` for a known paper. */
export function paperMetrics(paper: PaperKind, marginPt: number): PageMetrics {
  const spec = PAPERS[paper];
  const margin = Number.isFinite(marginPt) ? Math.max(0, marginPt) : 0;
  return {
    widthPt: spec.widthPt,
    heightPt: spec.heightPt,
    marginPt: margin,
    marginPx: margin * PT_TO_PX,
    widthPx: Math.round(spec.widthPt * PT_TO_PX),
    heightPx: Math.round(spec.heightPt * PT_TO_PX),
    contentWidthPx: Math.round((spec.widthPt - margin * 2) * PT_TO_PX),
    headerHeight: PAGE_HEADER_HEIGHT,
    footerHeight: PAGE_FOOTER_HEIGHT,
  };
}

/** One page's printable height, optionally excluding header/footer bands. */
export function pageContentHeight(
  metrics: PageMetrics,
  hasBands: boolean,
): number {
  const bands = hasBands ? metrics.headerHeight + metrics.footerHeight : 0;
  return Math.max(1, metrics.heightPx - metrics.marginPx * 2 - bands);
}

/** The default sheet: A4 with the standard 36pt margin. */
export const A4_PREVIEW = paperMetrics("a4", 36);
