import { buildExportPageConfig, type PageConfigOptions } from "./page-config";
import { paginateSnapshot, type PaginationResult } from "./pagination";
import { createExportArticle } from "./render";
import type { ExportDocument } from "./render";
import { ensureExportRuntime, loadFontBytes } from "./runtime";
import type {
  DocExportApi,
  DompdfApi,
  PaperMetrics,
  SnapshotNodeData,
} from "./vendor";

const PX_TO_PT = 72 / 96;
const IMAGE_TIMEOUT_MS = 8_000;
const HEADING_RESCUE_LINES_PX = 96;
const FONT_FAMILY = "SourceHanSansSC-Regular";

export type PreviewPageConfig = PageConfigOptions & {
  readonly paper: string;
  readonly marginPt: number;
  readonly pageBreakOnH1: boolean;
  readonly background: string;
};

export type PreviewPagination = PaginationResult & {
  readonly contentHeightPx: number;
  readonly headerHPx: number;
  readonly footerHPx: number;
  /** Wall-clock cost of one snapshot + pack; measured for the acceptance log. */
  readonly elapsedMs: number;
};

/**
 * Measures the export HTML with dompdf's own snapshot pass and packs the
 * resulting line boxes into pages.
 *
 * The clone and options mirror `DocExport.exportElement` exactly:
 * same content width, same `PrepareDoc.prepare()` transforms, same
 * `avoidOrphanHeadings()` rescue, and the frozen page config. Nothing here
 * renders a second HTML document; it measures the same bytes the preview shows.
 *
 * Returns null when the snapshot API is unavailable, which keeps the pane on
 * its continuous rendering path. Errors are deliberately swallowed after one
 * console warning: pagination is an enhancement to the preview, not a reason
 * to interrupt writing.
 */
export async function collectPreviewPagination(
  document: ExportDocument,
  options: PreviewPageConfig,
): Promise<PreviewPagination | null> {
  // jsdom has no layout and cannot load the UMD kernel; the continuous preview
  // is the correct test-environment result.
  if (import.meta.env.MODE === "test") return null;

  const started = performance.now();
  let host: HTMLDivElement | null = null;

  try {
    const [fontBytes] = await Promise.all([
      loadFontBytes(),
      ensureExportRuntime(),
    ]);
    const docExport = globalThis.DocExport;
    const api = globalThis.dompdf;
    const prepare = globalThis.PrepareDoc;
    if (!docExport || !api?.collectSnapshotData || !prepare) return null;

    const metrics = docExport.metrics(options.paper, options.marginPt);
    const pageConfig = buildExportPageConfig(docExport, options);
    if (pageConfig === null || pageConfig === undefined) return null;

    const article = createExportArticle(document.html);
    article.style.width = `${metrics.contentWidthPx}px`;
    article.style.maxWidth = "none";
    article.style.margin = "0";
    article.style.padding = "0";

    host = documentHost(metrics, options.background);
    host.appendChild(article);
    globalThis.document.body.appendChild(host);

    prepare.prepare(article, {
      pageBreakOnH1: options.pageBreakOnH1,
    });

    const pdfOptions = createPdfOptions(
      docExport,
      metrics,
      options,
      pageConfig,
      fontBytes,
    );

    await waitForFonts();
    await waitForImages(article);
    avoidOrphanHeadings(api, article, pdfOptions);

    const snapshot = await api.collectSnapshotData(article, pdfOptions);
    const headerHPx = finite(snapshot.headerHPx);
    const footerHPx = finite(snapshot.footerHPx);
    const contentHeightPx = pageContentHeight(
      snapshot.pageHeightPt,
      snapshot.mTop,
      snapshot.mBottom,
      headerHPx,
      footerHPx,
    );

    const packed = paginateSnapshot({
      nodes: snapshot.nodes.map(toPaginationNode),
      contentHeightPx,
    });

    return {
      ...packed,
      contentHeightPx,
      headerHPx,
      footerHPx,
      elapsedMs: performance.now() - started,
    };
  } catch (error) {
    warnOnce(error);
    return null;
  } finally {
    host?.remove();
  }
}

function documentHost(
  metrics: PaperMetrics,
  background: string,
): HTMLDivElement {
  const host = globalThis.document.createElement("div");
  host.setAttribute("data-pdf-host", "");
  host.style.cssText =
    "position:fixed;left:-100000px;top:0;z-index:-1;" +
    `background:${background};width:${metrics.contentWidthPx}px;`;
  return host;
}

function createPdfOptions(
  api: DocExportApi,
  metrics: PaperMetrics,
  options: PreviewPageConfig,
  pageConfig: unknown,
  fontBytes: Uint8Array,
): Record<string, unknown> {
  const format =
    api.papers?.[options.paper]?.format ??
    ([metrics.widthPt, metrics.heightPt] as const);

  return {
    format,
    pagination: true,
    marginPt: metrics.marginPt,
    backgroundColor: options.background,
    compress: false,
    precision: 2,
    useCORS: true,
    fontConfig: {
      fontFamily: FONT_FAMILY,
      fontBytes,
      fontStyle: "normal",
      fontWeight: 400,
    },
    langFontConfig: [
      {
        fontFamily: FONT_FAMILY,
        fontBytes,
        isDefault: true,
      },
    ],
    pageConfig,
  };
}

/**
 * Mirror of the frozen `avoidOrphanHeadings()` in `export-doc.js`.
 *
 * The export marks a heading with `pageBreak` when it would otherwise be
 * stranded just above a page boundary and is followed by a table, code block,
 * figure or image. The preview must apply the same mutation or its measured
 * page count can differ by one. `computePageBreaks` is only used here, exactly
 * as the export uses it — never as the preview's own pagination model.
 */
function avoidOrphanHeadings(
  api: DompdfApi,
  root: HTMLElement,
  pdfOptions: Record<string, unknown>,
): void {
  if (typeof api.computePageBreaks !== "function") return;
  const headings = Array.from(
    root.querySelectorAll<HTMLElement>("h1, h2, h3, h4"),
  );
  if (headings.length === 0) return;

  for (let pass = 0; pass < 3; pass += 1) {
    let breaks: number[];
    try {
      breaks = api.computePageBreaks(root, pdfOptions);
    } catch {
      return;
    }
    if (!breaks || breaks.length === 0) return;

    const rootTop = root.getBoundingClientRect().top;
    let changed = false;

    for (const heading of headings) {
      if (heading.hasAttribute("pageBreak")) continue;

      const rect = heading.getBoundingClientRect();
      const top = rect.top - rootTop;
      const bottom = rect.bottom - rootTop;
      let boundary: number | null = null;
      for (const candidate of breaks) {
        if (candidate > top + 0.5) {
          boundary = candidate;
          break;
        }
      }
      if (boundary === null || boundary >= bottom + HEADING_RESCUE_LINES_PX) {
        continue;
      }

      const next = heading.nextElementSibling;
      if (!next) continue;
      if (!/^(TABLE|PRE|FIGURE|IMG)$/.test(next.tagName)) continue;

      heading.setAttribute("pageBreak", "");
      changed = true;
    }

    if (!changed) return;
  }
}

function toPaginationNode(node: SnapshotNodeData) {
  return {
    kind: (node.kind === 1 ? 1 : node.kind === 2 ? 2 : 0) as 0 | 1 | 2,
    parent: node.parent,
    y: node.y,
    h: node.h,
    divisionDisable: Boolean(node.divisionDisable),
    pageBreak: Boolean(node.pageBreak),
    overflowHidden: Boolean(node.overflowHidden),
    lines: (node.lines ?? []).map((line) => ({ y: line.y, h: line.h })),
  };
}

function waitForFonts(): Promise<void> {
  if (typeof globalThis.document.fonts?.ready?.then !== "function") {
    return Promise.resolve();
  }
  return globalThis.document.fonts.ready.then(() => undefined);
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
          const done = (): void => {
            if (timer !== undefined) globalThis.clearTimeout(timer);
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
          timer = globalThis.setTimeout(done, IMAGE_TIMEOUT_MS);
        }),
    ),
  ).then(() => undefined);
}

function pageContentHeight(
  pageHeightPt: number,
  marginTopPt: number,
  marginBottomPt: number,
  headerHPx: number,
  footerHPx: number,
): number {
  const bands = headerHPx * PX_TO_PT + footerHPx * PX_TO_PT;
  const withBands =
    (pageHeightPt - marginTopPt - marginBottomPt - bands) / PX_TO_PT;
  if (withBands > 0) return withBands;
  // dompdf falls back to the page area without bands when the bands would
  // leave no room, so the packer must use the same height.
  const withoutBands =
    (pageHeightPt - marginTopPt - marginBottomPt) / PX_TO_PT;
  return Math.max(1, withoutBands);
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

let warned = false;

function warnOnce(error: unknown): void {
  if (!import.meta.env.DEV || warned) return;
  warned = true;
  console.warn("[moye] 分页预览不可用，改用连续预览", error);
}
