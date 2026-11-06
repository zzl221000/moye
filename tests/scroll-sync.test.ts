import { describe, expect, it } from "vitest";
import {
  isScrollEcho,
  mapScrollTop,
  scrollMax,
  SCROLL_SYNC_JITTER_PX,
  type ScrollEcho,
} from "../src/shell/scroll-sync";

describe("synced scrolling", () => {
  it("maps the source fraction onto the target range", () => {
    expect(mapScrollTop(0, 1000, 500)).toBe(0);
    expect(mapScrollTop(250, 1000, 500)).toBe(125);
    expect(mapScrollTop(1000, 1000, 500)).toBe(500);
  });

  it("clamps overscroll and rejects unmappable ranges", () => {
    expect(mapScrollTop(-20, 1000, 500)).toBe(0);
    expect(mapScrollTop(1200, 1000, 500)).toBe(500);
    expect(mapScrollTop(100, 0, 500)).toBeNull();
    expect(mapScrollTop(100, -1, 500)).toBeNull();
    expect(mapScrollTop(100, 1000, 0)).toBeNull();
    expect(mapScrollTop(Number.NaN, 1000, 500)).toBeNull();
    expect(mapScrollTop(100, 1000, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("computes a non-negative scroll range", () => {
    expect(
      scrollMax({ scrollTop: 0, scrollHeight: 1200, clientHeight: 400 }),
    ).toBe(800);
    expect(
      scrollMax({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 }),
    ).toBe(0);
  });

  it("suppresses only the echo of the value the sync wrote", () => {
    const target = document.createElement("div");
    const other = document.createElement("div");
    const echo: ScrollEcho = { element: target, expectedTop: 120 };

    expect(isScrollEcho(echo, target, 120)).toBe(true);
    expect(
      isScrollEcho(echo, target, 120 + SCROLL_SYNC_JITTER_PX - 0.01),
    ).toBe(true);
    expect(isScrollEcho(echo, target, 120 + SCROLL_SYNC_JITTER_PX)).toBe(
      false,
    );
    expect(isScrollEcho(echo, other, 120)).toBe(false);
    expect(isScrollEcho(null, target, 120)).toBe(false);
  });
});
