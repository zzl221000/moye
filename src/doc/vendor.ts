/**
 * Minimal, hand-checked surface of the frozen browser libraries.
 *
 * The app loads the exact `vendor/*.min.js` files the CLI uses; they are UMD
 * builds without type declarations. Only the members the app touches are
 * declared here, so a typo cannot silently fall through an `any`.
 */

export type MarkedOptions = {
  gfm?: boolean;
  breaks?: boolean;
  async?: false;
};

export type MarkedApi = {
  parse(markdown: string, options?: MarkedOptions): string;
};

export type PurifyConfig = {
  USE_PROFILES?: { html?: boolean };
  ADD_ATTR?: string[];
};

export type PurifyApi = {
  sanitize(dirty: string, config?: PurifyConfig): string;
};

export type DocumentTheme = {
  label?: string;
  background: string;
  headerColor: string;
  footerColor: string;
  css: string;
};

export type ThemeTable = Readonly<Record<string, DocumentTheme>>;

export type PaperMetrics = {
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

export type ExportProgress = {
  stage?: string;
  currentPage?: number;
  totalPages?: number;
};

export type DocExportOptions = {
  paper: string;
  marginPt: number;
  headerTitle: string;
  pageNumbers: boolean;
  cover: boolean;
  pageBreakOnH1: boolean;
  compress: boolean;
  background: string;
  headerColor: string;
  footerColor: string;
  fontBytes: Uint8Array;
  metadata: {
    title: string;
    creator: string;
    producer: string;
    keywords: string[];
  };
  onProgress?: (progress: ExportProgress) => void;
};

export type PageConfigInput = {
  cover: boolean;
  headerTitle: string;
  headerColor: string;
  footerColor: string;
};

export type DocExportApi = {
  metrics(paper: string, marginPt: number): PaperMetrics;
  exportElement(source: HTMLElement, options: DocExportOptions): Promise<Blob>;
  countPages(blob: Blob): Promise<number>;
  /** Frozen `buildPageConfig`; the same object the export hands to dompdf. */
  buildPageConfig?(
    options: PageConfigInput,
    hasHeader: boolean,
    hasFooter: boolean,
  ): unknown;
  papers?: Readonly<
    Record<
      string,
      { readonly widthPt: number; readonly heightPt: number; readonly format?: unknown }
    >
  >;
  HEADER_HEIGHT?: number;
  FOOTER_HEIGHT?: number;
};

export type SnapshotLineData = {
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  end: number;
};

export type SnapshotNodeData = {
  id: number;
  parent: number;
  kind: number;
  x: number;
  y: number;
  w: number;
  h: number;
  divisionDisable: boolean;
  pageBreak: boolean;
  overflowHidden: boolean;
  lines?: SnapshotLineData[];
};

export type SnapshotData = {
  pageWidthPt: number;
  pageHeightPt: number;
  mTop: number;
  mRight: number;
  mBottom: number;
  mLeft: number;
  headerHPx: number;
  footerHPx: number;
  nodes: SnapshotNodeData[];
};

export type DompdfApi = {
  collectSnapshotData(
    root: HTMLElement,
    options?: Record<string, unknown>,
  ): Promise<SnapshotData>;
  computePageBreaks(
    root: HTMLElement,
    options?: Record<string, unknown>,
  ): number[];
};

export type PrepareDocApi = {
  prepare(
    root: HTMLElement,
    options?: { pageBreakOnH1?: boolean },
  ): HTMLElement;
};

declare global {
  var marked: MarkedApi | undefined;
  var DOMPurify: PurifyApi | undefined;
  var MOYE_THEMES: ThemeTable | undefined;
  var DocExport: DocExportApi | undefined;
  var dompdf: DompdfApi | undefined;
  var PrepareDoc: PrepareDocApi | undefined;
}

export {};
