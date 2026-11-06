/**
 * Synced scrolling between 写作面 and 版式预览.
 *
 * The panes hold different content at different widths and zoom levels, so the
 * only stable mapping is the fraction of each scroll range. Writing the
 * target's `scrollTop` fires a scroll event on the target; the echo record lets
 * that event pass without bouncing back to the source.
 */

/** Below this width the panes stack, so linking their scroll would be wrong. */
export const SCROLL_SYNC_MIN_WIDTH_PX = 900;

/** Sub-pixel differences are layout noise, not user scrolling. */
export const SCROLL_SYNC_JITTER_PX = 1.5;

/** A programmatic scroll normally echoes within a frame; drop stale records. */
export const SCROLL_SYNC_ECHO_TIMEOUT_MS = 200;

export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export interface ScrollEcho {
  readonly element: Element;
  readonly expectedTop: number;
}

/** Distance the element can scroll; never negative. */
export function scrollMax(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight);
}

/**
 * Maps a source offset onto the target's range. Returns null when either side
 * has nothing to scroll, so callers never divide by zero.
 */
export function mapScrollTop(
  sourceTop: number,
  sourceMax: number,
  targetMax: number,
): number | null {
  if (
    !Number.isFinite(sourceTop) ||
    !Number.isFinite(sourceMax) ||
    !Number.isFinite(targetMax) ||
    sourceMax <= 0 ||
    targetMax <= 0
  ) {
    return null;
  }
  const ratio = Math.min(1, Math.max(0, sourceTop / sourceMax));
  return ratio * targetMax;
}

/** True when a scroll event is the echo of the value the sync just wrote. */
export function isScrollEcho(
  echo: ScrollEcho | null,
  element: Element,
  scrollTop: number,
): boolean {
  return (
    echo !== null &&
    echo.element === element &&
    Math.abs(scrollTop - echo.expectedTop) < SCROLL_SYNC_JITTER_PX
  );
}

interface ScrollPair {
  readonly source: HTMLElement;
  readonly target: HTMLElement;
}

const WRITING_SCROLLER_SELECTOR = ".cm-scroller";
const WRITING_SURFACE_SELECTOR = ".writing-surface";
const PREVIEW_PANE_SELECTOR = '[data-region="preview"]';

/**
 * Resolves a scroll event into a source/target pair. CodeMirror owns the
 * vertical scroller inside the writing page, while the preview pane scrolls
 * itself; anything else in the workspace is ignored.
 */
function scrollPair(
  workspace: HTMLElement,
  eventTarget: EventTarget | null,
): ScrollPair | null {
  if (!(eventTarget instanceof HTMLElement)) return null;
  if (!workspace.contains(eventTarget)) return null;

  if (eventTarget.closest('[data-region="writing"]')) {
    const isScrollOwner =
      eventTarget.matches(WRITING_SCROLLER_SELECTOR) ||
      eventTarget.matches(WRITING_SURFACE_SELECTOR);
    if (!isScrollOwner) return null;
    const preview = workspace.querySelector<HTMLElement>(PREVIEW_PANE_SELECTOR);
    return preview ? { source: eventTarget, target: preview } : null;
  }

  const preview = eventTarget.closest<HTMLElement>(PREVIEW_PANE_SELECTOR);
  if (preview !== eventTarget) return null;
  const writing = workspace.querySelector<HTMLElement>(
    `[data-region="writing"] ${WRITING_SCROLLER_SELECTOR}`,
  );
  return writing ? { source: eventTarget, target: writing } : null;
}

/**
 * Installs proportional scrolling between the writing surface and the preview.
 *
 * One passive capture listener on the workspace survives the editor mounting
 * after the shell, and rAF collapses a burst of scroll events into one write.
 */
export function installScrollSync(workspace: HTMLElement): () => void {
  if (typeof window.matchMedia !== "function") {
    return () => undefined;
  }

  const media = window.matchMedia(
    `(min-width: ${SCROLL_SYNC_MIN_WIDTH_PX}px)`,
  );
  let frame = 0;
  let pending: ScrollPair | null = null;
  let echo: ScrollEcho | null = null;
  let echoTimer: ReturnType<typeof setTimeout> | null = null;

  const clearEcho = (): void => {
    if (echoTimer !== null) {
      clearTimeout(echoTimer);
      echoTimer = null;
    }
    echo = null;
  };

  const write = (pair: ScrollPair): void => {
    const nextTop = mapScrollTop(
      pair.source.scrollTop,
      scrollMax(pair.source),
      scrollMax(pair.target),
    );
    if (nextTop === null) return;
    if (Math.abs(pair.target.scrollTop - nextTop) < SCROLL_SYNC_JITTER_PX) {
      return;
    }
    clearEcho();
    echo = { element: pair.target, expectedTop: nextTop };
    echoTimer = setTimeout(clearEcho, SCROLL_SYNC_ECHO_TIMEOUT_MS);
    pair.target.scrollTop = nextTop;
  };

  const flush = (): void => {
    frame = 0;
    const pair = pending;
    pending = null;
    if (!pair || !media.matches) return;
    write(pair);
  };

  const handleScroll = (event: Event): void => {
    if (!media.matches) return;
    if (!(event.target instanceof HTMLElement)) return;

    // The pane we just moved fires its own scroll event. Ignore that echo, but
    // a scroll anywhere else is the user taking over.
    if (echo !== null && event.target === echo.element) {
      const isEcho = isScrollEcho(echo, event.target, event.target.scrollTop);
      clearEcho();
      if (isEcho) return;
    }

    const pair = scrollPair(workspace, event.target);
    if (!pair) return;
    pending = pair;
    if (frame === 0) frame = requestAnimationFrame(flush);
  };

  const handleMediaChange = (): void => {
    pending = null;
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    clearEcho();
  };

  workspace.addEventListener("scroll", handleScroll, {
    capture: true,
    passive: true,
  });
  media.addEventListener("change", handleMediaChange);

  return () => {
    workspace.removeEventListener("scroll", handleScroll, true);
    media.removeEventListener("change", handleMediaChange);
    pending = null;
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    clearEcho();
  };
}
