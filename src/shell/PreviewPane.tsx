import { createEffect, createSignal, For, Show } from "solid-js";
import { estimatePageCount } from "../doc/page-estimate";
import type { PageMetrics, PaperKind } from "../doc/paper";
import type { ExportDocument } from "../doc/render";
import {
  collectPreviewPagination,
  type PreviewPagination,
} from "../doc/snapshot";

/** Repagination is cheap, but not free: 300 ms keeps typing responsive. */
export const PAGINATION_DEBOUNCE_MS = 300;

export type PageCountState = {
  readonly pages: number;
  /** True only while the displayed count comes from a current snapshot. */
  readonly exact: boolean;
};

type PreviewPaneProps = {
  document: ExportDocument;
  paper: PageMetrics;
  paperKind: PaperKind;
  background: string;
  pageContentHeightPx: number;
  h1Break: boolean;
  /** Resolved header title, exactly as the export resolves it. */
  headerTitle: string;
  pageNumbers: boolean;
  cover: boolean;
  onPageState: (state: PageCountState) => void;
};

/**
 * 版式预览: one A4 card per page measured by dompdf's snapshot pass.
 *
 * Every card contains the same export HTML, translated by that page's start
 * offset and clipped to its slice. The document is never re-rendered per page:
 * line breaking and pagination stay in dompdf, and the preview only slices the
 * flow it measured. When the snapshot API is unavailable the pane keeps its
 * old continuous sheet and reports an estimated count with `≈`.
 */
export default function PreviewPane(props: PreviewPaneProps) {
  const [stack, setStack] = createSignal<HTMLDivElement>();
  const [continuousContent, setContinuousContent] =
    createSignal<HTMLDivElement>();
  const [zoom, setZoom] = createSignal(1);
  const [pages, setPages] = createSignal<PreviewPagination | null>(null);
  const [pending, setPending] = createSignal(true);
  const [continuousEstimate, setContinuousEstimate] = createSignal(0);

  let sequence = 0;
  let initialized = false;

  createEffect(
    () => ({ element: stack(), paperWidth: props.paper.widthPx }),
    ({ element, paperWidth }) => {
      if (!element) return;

      const fit = (): void => {
        const available = element.clientWidth;
        if (available <= 0) return;
        const next = Math.min(1, Math.max(0.2, available / paperWidth));
        setZoom(next);
      };

      fit();

      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(fit);
      observer.observe(element);
      return () => observer.disconnect();
    },
  );

  createEffect(
    () => ({
      document: props.document,
      paper: props.paper,
      paperKind: props.paperKind,
      background: props.background,
      headerTitle: props.headerTitle,
      pageNumbers: props.pageNumbers,
      cover: props.cover,
      h1Break: props.h1Break,
    }),
    (inputs) => {
      const token = ++sequence;
      let cancelled = false;
      setPending(true);

      const delay = initialized ? PAGINATION_DEBOUNCE_MS : 0;
      initialized = true;

      const timer = setTimeout(() => {
        void collectPreviewPagination(inputs.document, {
          paper: inputs.paperKind,
          marginPt: inputs.paper.marginPt,
          headerTitle: inputs.headerTitle,
          pageNumbers: inputs.pageNumbers,
          cover: inputs.cover,
          pageBreakOnH1: inputs.h1Break,
          background: inputs.background,
          headerColor: inputs.document.headerColor,
          footerColor: inputs.document.footerColor,
        }).then((result) => {
          if (cancelled || token !== sequence) return;
          setPending(false);
          setPages(result);
        });
      }, delay);

      return () => {
        cancelled = true;
        clearTimeout(timer);
        if (sequence === token) sequence += 1;
      };
    },
  );

  // Continuous fallback only. The measured height is divided by CSS zoom to
  // recover the layout height, exactly as the pre-pagination preview did.
  createEffect(
    () => ({
      element: continuousContent(),
      scale: zoom(),
      pageHeight: props.pageContentHeightPx,
      active: pages() === null,
    }),
    ({ element, scale, pageHeight, active }) => {
      if (!active) return;
      if (!element) {
        setContinuousEstimate(0);
        return;
      }

      const measure = (): void => {
        const height = element.getBoundingClientRect().height;
        const layoutHeight = scale > 0 ? height / scale : height;
        setContinuousEstimate(estimatePageCount(layoutHeight, pageHeight));
      };

      measure();

      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
  );

  // Report the exact count only while no newer snapshot is outstanding. During
  // a refresh the last exact number is shown with `≈`, matching the fallback.
  createEffect(
    () => ({
      exact: pages(),
      pending: pending(),
      estimate: continuousEstimate(),
    }),
    (state) => {
      if (state.exact && !state.pending) {
        props.onPageState({ pages: state.exact.pageCount, exact: true });
        return;
      }
      props.onPageState({
        pages: state.exact?.pageCount ?? state.estimate,
        exact: false,
      });
    },
  );

  const state = (): string => {
    if (pending()) return pages() === null ? "pending" : "refreshing";
    return pages() === null ? "continuous" : "exact";
  };

  return (
    <section
      id="preview-pane"
      class="preview-pane"
      data-region="preview"
      data-pagination-state={state()}
      data-page-count={pages()?.pageCount}
      data-content-height={pages()?.contentHeightPx}
      data-page-starts={pages()
        ?.pageStarts.map((start) => Math.round(start))
        .join(",")}
      data-pagination-ms={
        pages() === null ? undefined : Math.round(pages()!.elapsedMs)
      }
      aria-label="版式预览"
    >
      <div class="preview-stack" ref={(element) => setStack(element)}>
        <Show
          when={pages()}
          fallback={
            <article
              class="preview-paper preview-paper--continuous"
              data-preview-continuous="true"
              data-h1-break={props.h1Break ? "true" : undefined}
              style={{
                background: props.background,
                "--moye-preview-paper-width": `${props.paper.widthPx}px`,
                "--moye-preview-paper-height": `${props.paper.heightPx}px`,
                "--moye-preview-paper-margin": `${props.paper.marginPx}px`,
                "--moye-preview-zoom": String(zoom()),
              }}
            >
              <Show when={!props.cover && props.headerTitle !== ""}>
                <div
                  class="preview-paper__band preview-paper__band--header"
                  data-preview-band="header"
                  style={{
                    height: `${props.paper.headerHeight}px`,
                    color: props.document.headerColor,
                  }}
                >
                  {props.headerTitle}
                </div>
              </Show>

              <div
                class="preview-paper__content"
                aria-hidden="true"
                ref={(element) => setContinuousContent(element)}
                style={{ width: `${props.paper.contentWidthPx}px` }}
                innerHTML={props.document.html}
              />

              <Show when={!props.cover && props.pageNumbers}>
                <div
                  class="preview-paper__band preview-paper__band--footer"
                  data-preview-band="footer"
                  style={{
                    height: `${props.paper.footerHeight}px`,
                    color: props.document.footerColor,
                  }}
                >
                  第 1 页
                </div>
              </Show>
            </article>
          }
        >
          {(pagination) => (
            <For each={pagination().pageStarts}>
              {(start, index) => {
                const pageNumber = (): number => index() + 1;
                const nextStart = (): number | undefined =>
                  pagination().pageStarts[index() + 1];
                const topBlank = (): number =>
                  pagination().pageTopBlankPx[index()] ?? 0;
                const visibleHeight = (): number => {
                  const next = nextStart();
                  if (next === undefined) return pagination().contentHeightPx;
                  return Math.min(
                    pagination().contentHeightPx,
                    Math.max(1, topBlank() + next - start),
                  );
                };
                const showBands = (): boolean =>
                  !props.cover || pageNumber() > 1;

                return (
                  <article
                    class="preview-paper preview-paper--page"
                    data-preview-page={pageNumber()}
                    data-h1-break={props.h1Break ? "true" : undefined}
                    aria-label={`第 ${pageNumber()} 页`}
                    style={{
                      background: props.background,
                      "--moye-preview-paper-width": `${props.paper.widthPx}px`,
                      "--moye-preview-paper-height": `${props.paper.heightPx}px`,
                      "--moye-preview-paper-margin": `${props.paper.marginPx}px`,
                      "--moye-preview-zoom": String(zoom()),
                    }}
                  >
                    <div
                      class="preview-paper__band-slot"
                      style={{ height: `${pagination().headerHPx}px` }}
                    >
                      <Show when={showBands() && props.headerTitle !== ""}>
                        <div
                          class="preview-paper__band preview-paper__band--header"
                          data-preview-band="header"
                          style={{ color: props.document.headerColor }}
                        >
                          {props.headerTitle}
                        </div>
                      </Show>
                    </div>

                    <div
                      class="preview-page__viewport"
                      style={{ height: `${pagination().contentHeightPx}px` }}
                    >
                      <div
                        class="preview-page__slice"
                        style={{ height: `${visibleHeight()}px` }}
                      >
                        <div
                          class="preview-paper__content"
                          aria-hidden="true"
                          style={{
                            width: `${props.paper.contentWidthPx}px`,
                            transform: `translateY(${topBlank() - start}px)`,
                          }}
                          innerHTML={props.document.html}
                        />
                      </div>
                    </div>

                    <div
                      class="preview-paper__band-slot"
                      style={{ height: `${pagination().footerHPx}px` }}
                    >
                      <Show when={showBands() && props.pageNumbers}>
                        <div
                          class="preview-paper__band preview-paper__band--footer"
                          data-preview-band="footer"
                          style={{ color: props.document.footerColor }}
                        >
                          第 {pageNumber()} 页
                        </div>
                      </Show>
                    </div>
                  </article>
                );
              }}
            </For>
          )}
        </Show>
      </div>
    </section>
  );
}
