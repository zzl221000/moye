/**
 * A4 at 96 dpi with the default 36pt margin. These are the same numbers
 * `DocExport.metrics("a4", 36)` returns; kept here so the preview can size the
 * paper before the export kernel is loaded.
 */
export const A4_PREVIEW = {
  widthPx: 794,
  heightPx: 1123,
  marginPx: 48,
  contentWidthPx: 698,
} as const;
