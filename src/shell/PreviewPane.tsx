import { createEffect, createSignal, Show } from "solid-js";
import { estimatePageCount } from "../doc/page-estimate";
import type { PageMetrics } from "../doc/paper";
import type { ExportDocument } from "../doc/render";

type PreviewPaneProps = {
  document: ExportDocument;
  paper: PageMetrics;
  background: string;
  pageContentHeightPx: number;
  h1Break: boolean;
  /** Resolved header title, exactly as the export resolves it. */
  headerTitle: string;
  pageNumbers: boolean;
  cover: boolean;
  onPageEstimate: (pages: number) => void;
};

/**
 * 版式预览: a continuous sheet at the selected paper size. The HTML comes from
 * the same `renderExportDocument` result the export uses; only the on-screen
 * zoom is preview-specific, and it never touches the export clone.
 */
export default function PreviewPane(props: PreviewPaneProps) {
  const [stack, setStack] = createSignal<HTMLDivElement>();
  const [content, setContent] = createSignal<HTMLDivElement>();
  const [zoom, setZoom] = createSignal(1);

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

  // The sheet is scaled with CSS zoom, so the content box's client rect is in
  // screen pixels. Dividing by the zoom recovers the layout height that must be
  // compared with one page's printable height in `estimatePageCount`.
  createEffect(
    () => ({
      element: content(),
      document: props.document,
      scale: zoom(),
      pageHeight: props.pageContentHeightPx,
    }),
    ({ element, scale, pageHeight }) => {
      if (!element) {
        props.onPageEstimate(0);
        return;
      }

      const measure = (): void => {
        const height = element.getBoundingClientRect().height;
        const layoutHeight = scale > 0 ? height / scale : height;
        props.onPageEstimate(estimatePageCount(layoutHeight, pageHeight));
      };

      measure();

      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
  );

  return (
    <section
      id="preview-pane"
      class="preview-pane"
      data-region="preview"
      aria-label="版式预览"
    >
      <div class="preview-stack" ref={(element) => setStack(element)}>
        <div
          class="preview-paper"
          data-h1-break={props.h1Break ? "true" : undefined}
          style={{
            background: props.background,
            "--moye-preview-paper-width": `${props.paper.widthPx}px`,
            "--moye-preview-paper-height": `${props.paper.heightPx}px`,
            "--moye-preview-paper-margin": `${props.paper.marginPx}px`,
            "--moye-preview-zoom": String(zoom()),
          }}
        >
          {/*
            The preview is one continuous sheet, so these are the first page's
            bands, not a second pagination model: dompdf still owns every page
            boundary. They mirror the export's resolved title and page-number
            footer, and vanish with the cover option exactly like page 1 does.
          */}
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
            ref={(element) => setContent(element)}
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
        </div>
      </div>
    </section>
  );
}
