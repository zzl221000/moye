import { createEffect, createSignal } from "solid-js";
import { estimatePageCount } from "../doc/page-estimate";
import { A4_PREVIEW } from "../doc/paper";
import type { ExportDocument } from "../doc/render";

type PreviewPaneProps = {
  document: ExportDocument;
  onPageEstimate: (pages: number) => void;
};

/**
 * 版式预览: a continuous A4-width sheet. The HTML comes from the same
 * `renderExportDocument` result the export uses; only the on-screen zoom is
 * preview-specific, and it never touches the export clone.
 */
export default function PreviewPane(props: PreviewPaneProps) {
  const [stack, setStack] = createSignal<HTMLDivElement>();
  const [content, setContent] = createSignal<HTMLDivElement>();
  const [zoom, setZoom] = createSignal(1);

  createEffect(
    () => stack(),
    (element) => {
      if (!element) return;

      const fit = (): void => {
        const available = element.clientWidth;
        if (available <= 0) return;
        const next = Math.min(1, Math.max(0.2, available / A4_PREVIEW.widthPx));
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
    () => ({ element: content(), document: props.document, scale: zoom() }),
    ({ element, scale }) => {
      if (!element) {
        props.onPageEstimate(0);
        return;
      }

      const measure = (): void => {
        const height = element.getBoundingClientRect().height;
        const layoutHeight = scale > 0 ? height / scale : height;
        props.onPageEstimate(estimatePageCount(layoutHeight));
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
          style={{
            background: props.document.background,
            "--moye-preview-zoom": String(zoom()),
          }}
        >
          <div
            class="preview-paper__content"
            ref={(element) => setContent(element)}
            innerHTML={props.document.html}
          />
        </div>
      </div>
    </section>
  );
}
