import { describe, expect, it } from "vitest";
import {
  paginateSnapshot,
  type PaginationNode,
} from "../src/doc/pagination";

const HEIGHT = 100;

function box(
  y: number,
  h: number,
  options: Partial<PaginationNode> = {},
): PaginationNode {
  return {
    kind: 0,
    parent: -1,
    y,
    h,
    divisionDisable: false,
    pageBreak: false,
    overflowHidden: false,
    ...options,
  };
}

function text(
  parent: number,
  lines: readonly { y: number; h: number }[],
): PaginationNode {
  const top = Math.min(...lines.map((line) => line.y));
  const bottom = Math.max(...lines.map((line) => line.y + line.h));
  return {
    kind: 1,
    parent,
    y: top,
    h: bottom - top,
    divisionDisable: false,
    pageBreak: false,
    overflowHidden: false,
    lines,
  };
}

describe("paginateSnapshot", () => {
  it("returns one page for an empty flow", () => {
    expect(paginateSnapshot({ nodes: [], contentHeightPx: HEIGHT })).toEqual({
      pageCount: 1,
      pageStarts: [0],
      pageTopBlankPx: [0],
    });
  });

  it("moves a line that crosses the band boundary to the next page", () => {
    const nodes = [
      box(0, 108),
      text(0, [
        { y: 0, h: 18 },
        { y: 40, h: 18 },
        { y: 90, h: 18 },
      ]),
    ];

    const result = paginateSnapshot({ nodes, contentHeightPx: HEIGHT });

    expect(result.pageCount).toBe(2);
    expect(result.pageStarts).toEqual([0, 90]);
    expect(result.pageTopBlankPx).toEqual([0, 0]);
  });

  it("keeps a small divisionDisable block together", () => {
    const nodes = [
      box(0, 200),
      text(0, [{ y: 10, h: 18 }]),
      box(50, 70, { parent: 0, divisionDisable: true }),
      text(2, [
        { y: 55, h: 18 },
        { y: 100, h: 18 },
      ]),
      text(0, [{ y: 130, h: 18 }]),
    ];

    const result = paginateSnapshot({ nodes, contentHeightPx: HEIGHT });

    // The block starts at 50 and ends at 120; it moves to the 100 boundary.
    // Page 1 therefore ends at the original 50, and page 2 starts there.
    expect(result.pageStarts[0]).toBe(0);
    expect(result.pageStarts[1]).toBe(50);
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
  });

  it("starts a pageBreak block on the next page boundary", () => {
    const nodes = [
      box(0, 240),
      text(0, [{ y: 0, h: 18 }]),
      box(120, 20, { parent: 0, pageBreak: true }),
      text(0, [{ y: 160, h: 18 }]),
    ];

    const result = paginateSnapshot({ nodes, contentHeightPx: HEIGHT });

    // 120 is already inside page 2, so the forced break moves it to the top of
    // page 3 (200) and page starts are 0, 100, 120.
    expect(result.pageStarts).toEqual([0, 100, 120]);
    expect(result.pageCount).toBe(3);
  });

  it("reports blank space when a page boundary lands in an inserted gap", () => {
    const nodes = [
      box(0, 240),
      text(0, [
        { y: 0, h: 18 },
        { y: 90, h: 18 },
      ]),
      box(150, 20, { parent: 0, pageBreak: true }),
      text(0, [{ y: 180, h: 18 }]),
    ];

    const result = paginateSnapshot({ nodes, contentHeightPx: HEIGHT });

    // The directive gap at 150 was recorded before the line gap at 90. Sorting
    // both by original y puts the 200 boundary 10 px inside the second gap.
    expect(result.pageStarts).toEqual([0, 90, 150]);
    expect(result.pageTopBlankPx).toEqual([0, 0, 10]);
  });

  it("lets a divisionDisable block taller than a page split", () => {
    const nodes = [
      box(0, 340),
      text(0, [{ y: 10, h: 18 }]),
      box(40, 140, { parent: 0, divisionDisable: true }),
      text(2, [
        { y: 45, h: 18 },
        { y: 120, h: 18 },
      ]),
      text(0, [{ y: 200, h: 18 }]),
    ];

    const result = paginateSnapshot({ nodes, contentHeightPx: HEIGHT });

    // The block is taller than one band: dompdf allows it to split rather
    // than leaving a mostly empty page, so no gap is inserted before it.
    expect(result.pageStarts).toEqual([0, 100, 200, 300]);
    expect(result.pageCount).toBe(4);
  });
});
