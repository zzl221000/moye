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

export type DocExportApi = {
  metrics(paper: string, marginPt: number): PaperMetrics;
  exportElement(source: HTMLElement, options: DocExportOptions): Promise<Blob>;
  countPages(blob: Blob): Promise<number>;
};

declare global {
  var marked: MarkedApi | undefined;
  var DOMPurify: PurifyApi | undefined;
  var MOYE_THEMES: ThemeTable | undefined;
  var DocExport: DocExportApi | undefined;
}

export {};
