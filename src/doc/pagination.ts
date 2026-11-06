/**
 * Page packing for 版式预览, following dompdf's own measured geometry.
 *
 * dompdf does not re-render the document for every page. It walks the laid-out
 * DOM once, shifts content down when a block must stay together or a forced
 * page break appears, and then assigns every measured line box to a page band
 * of `contentHeightPx`. This module mirrors that pass exactly enough to answer
 * one question: where does each page start in the *original* flow?
 *
 * Coordinates are CSS px in the export clone's content column. Page `i` is the
 * slice `[pageStarts[i], pageStarts[i + 1])`; the final page is open-ended.
 * The preview clips a translated copy of the same HTML to that slice, so it
 * never re-runs line breaking or lays the document out again.
 *
 * `contentHeightPx` already has header/footer bands removed by the caller.
 * dompdf reserves that height on every page, including a cover page whose
 * bands are not drawn, so the packer never enlarges page 1 for `cover`; the
 * preview only hides the bands while keeping the same slice.
 *
 * Keeping this pure is deliberate: the integration test compares its page
 * count with a real exported PDF for every fixture. If dompdf's rules change,
 * that test fails before the preview can drift.
 */

export type PaginationLine = {
  readonly y: number;
  readonly h: number;
};

export type PaginationNode = {
  /** 0 = element box, 1 = text run, 2 = image/raster box. */
  readonly kind: 0 | 1 | 2;
  /** Node index of the parent, or -1 for the root. */
  readonly parent: number;
  readonly y: number;
  readonly h: number;
  readonly divisionDisable: boolean;
  readonly pageBreak: boolean;
  readonly overflowHidden: boolean;
  readonly lines?: readonly PaginationLine[];
};

export type PaginationInput = {
  /** Nodes in dompdf's pre-order snapshot order. */
  readonly nodes: readonly PaginationNode[];
  /** One page's printable height after margins and header/footer bands. */
  readonly contentHeightPx: number;
};

export type PaginationResult = {
  readonly pageCount: number;
  /** Original-flow y where each page begins; `pageStarts[0]` is 0. */
  readonly pageStarts: readonly number[];
  /**
   * Blank space inserted at the top of a page when a page boundary lands in a
   * gap that dompdf inserted to align a later directive. Zero for most pages.
   */
  readonly pageTopBlankPx: readonly number[];
};

type MutableLine = {
  y: number;
  h: number;
  readonly originY: number;
  page: number;
};

type MutableNode = {
  readonly kind: 0 | 1 | 2;
  readonly parent: number;
  y: number;
  h: number;
  readonly originY: number;
  readonly divisionDisable: boolean;
  readonly pageBreak: boolean;
  readonly overflowHidden: boolean;
  readonly lines: MutableLine[];
  subtreeEnd: number;
};

type InsertedGap = {
  /** Original-flow y of the content the gap was inserted before. */
  readonly at: number;
  readonly size: number;
};

const EPSILON = 0.5;
const BOTTOM_EPSILON = 1e-3;
const MAX_DIRECTIVE_PASSES = 20;

/**
 * Pack a measured document into pages. Mirrors `assign_pages()` in dompdf's
 * Rust paginator: two directive passes (keep-together, forced breaks) followed
 * by one line pass, then height expansion for ancestors. Like dompdf, a
 * `divisionDisable` block is kept together only when it fits inside one page;
 * a taller block is allowed to split rather than leaving a half-empty page.
 */
export function paginateSnapshot(input: PaginationInput): PaginationResult {
  const height = input.contentHeightPx;
  if (!Number.isFinite(height) || height <= 0 || input.nodes.length === 0) {
    return {
      pageCount: 1,
      pageStarts: [0],
      pageTopBlankPx: [0],
    };
  }

  const nodes = toMutableNodes(input.nodes);
  if (nodes.length === 0) {
    return {
      pageCount: 1,
      pageStarts: [0],
      pageTopBlankPx: [0],
    };
  }

  const gaps: InsertedGap[] = [];
  applyBreakDirectives(nodes, height, gaps);
  assignLines(nodes, height, gaps);
  expandBoxHeights(nodes);

  let maxPage = 0;
  for (const node of nodes) {
    const page = Math.floor(
      (node.y + node.h - BOTTOM_EPSILON) / height,
    );
    if (page > maxPage) maxPage = page;
    for (const line of node.lines) {
      if (line.page > maxPage) maxPage = line.page;
    }
  }

  // Line gaps are discovered after directive gaps, so the list is not in
  // original y order yet. Insertions commute; sorting recovers the cumulative
  // shift map used to invert page boundaries.
  gaps.sort((left, right) => left.at - right.at);

  const pageCount = maxPage + 1;
  const pageStarts: number[] = [0];
  const pageTopBlankPx: number[] = [0];
  for (let page = 1; page < pageCount; page += 1) {
    const origin = originalStartOf(page * height, gaps);
    pageStarts.push(origin.start);
    pageTopBlankPx.push(origin.topBlank);
  }

  return { pageCount, pageStarts, pageTopBlankPx };
}

function toMutableNodes(input: readonly PaginationNode[]): MutableNode[] {
  const nodes: MutableNode[] = input.map((node) => ({
    kind: node.kind,
    parent: node.parent,
    y: node.y,
    h: node.h,
    originY: node.y,
    divisionDisable: node.divisionDisable,
    pageBreak: node.pageBreak,
    overflowHidden: node.overflowHidden,
    lines: (node.lines ?? []).map((line) => ({
      y: line.y,
      h: line.h,
      originY: line.y,
      page: 0,
    })),
    subtreeEnd: 0,
  }));

  // Pre-order snapshot order makes every subtree a contiguous index range;
  // walking the children once finds the last index of each subtree.
  const children = buildChildren(nodes);
  const end = new Array<number>(nodes.length).fill(-1);
  const visit = (index: number): number => {
    let last = index;
    for (const child of children[index] ?? []) {
      last = Math.max(last, visit(child));
    }
    end[index] = last;
    return last;
  };
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index]!.parent < 0) visit(index);
  }
  for (let index = 0; index < nodes.length; index += 1) {
    nodes[index]!.subtreeEnd = end[index] ?? index;
  }
  return nodes;
}

function buildChildren(nodes: readonly MutableNode[]): number[][] {
  const children: number[][] = Array.from({ length: nodes.length }, () => []);
  nodes.forEach((node, index) => {
    if (node.parent >= 0 && node.parent < nodes.length) {
      children[node.parent]!.push(index);
    }
  });
  return children;
}

function shiftNode(node: MutableNode, gap: number): void {
  node.y += gap;
  for (const line of node.lines) {
    line.y += gap;
  }
}

/** Shift a subtree and every later node, as `shift_flow_tail()` does. */
function shiftFlowTail(nodes: MutableNode[], index: number, gap: number): void {
  for (let cursor = index; cursor < nodes.length; cursor += 1) {
    shiftNode(nodes[cursor]!, gap);
  }
}

function applyBreakDirectives(
  nodes: MutableNode[],
  height: number,
  gaps: InsertedGap[],
): void {
  for (let pass = 0; pass < MAX_DIRECTIVE_PASSES; pass += 1) {
    let moved = false;

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!;

      if (node.divisionDisable && node.kind === 0) {
        let top = node.y;
        let bottom = node.y + node.h;
        for (let cursor = index; cursor <= node.subtreeEnd; cursor += 1) {
          const descendant = nodes[cursor]!;
          top = Math.min(top, descendant.y);
          bottom = Math.max(bottom, descendant.y + descendant.h);
        }

        const topPage = Math.floor(top / height);
        const bottomPage = Math.floor((bottom - BOTTOM_EPSILON) / height);
        if (bottomPage > topPage && bottom - top < height) {
          const target = (topPage + 1) * height;
          const gap = target - top;
          if (gap > EPSILON) {
            shiftFlowTail(nodes, index, gap);
            gaps.push({ at: node.originY, size: gap });
            moved = true;
          }
        }
      }

      if (node.pageBreak) {
        const top = node.y;
        const boundary = Math.floor(top / height) * height;
        if (Math.abs(top - boundary) > EPSILON) {
          const gap = boundary + height - top;
          if (gap > EPSILON) {
            shiftFlowTail(nodes, index, gap);
            gaps.push({ at: node.originY, size: gap });
            moved = true;
          }
        }
      }
    }

    if (!moved) break;
  }
}

function assignLines(
  nodes: MutableNode[],
  height: number,
  gaps: InsertedGap[],
): void {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.kind !== 1) continue;

    for (let lineIndex = 0; lineIndex < node.lines.length; lineIndex += 1) {
      const line = node.lines[lineIndex]!;
      let page = Math.max(0, Math.floor(line.y / height));
      const bandBottom = (page + 1) * height;
      const bottom = line.y + line.h;

      if (bottom > bandBottom && line.h < height) {
        const gap = bandBottom - line.y;
        if (gap > 0) {
          shiftLinesFrom(node, lineIndex, gap);
          for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
            shiftNode(nodes[cursor]!, gap);
          }
          gaps.push({ at: line.originY, size: gap });
        }
        page = Math.max(0, Math.floor(node.lines[lineIndex]!.y / height));
      }

      node.lines[lineIndex]!.page = page;
    }
  }
}

function shiftLinesFrom(node: MutableNode, start: number, gap: number): void {
  for (let index = start; index < node.lines.length; index += 1) {
    node.lines[index]!.y += gap;
  }
  node.h += gap;
}

/** `expand_box_heights_to_fit_children()`: borders follow shifted content. */
function expandBoxHeights(nodes: MutableNode[]): void {
  const children = buildChildren(nodes);
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]!;
    if (node.kind !== 0 || node.overflowHidden) continue;
    const childIds = children[index]!;
    if (childIds.length === 0) continue;

    let bottom = node.y + node.h;
    for (const childIndex of childIds) {
      const child = nodes[childIndex]!;
      bottom = Math.max(bottom, child.y + child.h);
      for (const line of child.lines) {
        bottom = Math.max(bottom, line.y + line.h);
      }
    }
    if (bottom > node.y + node.h) node.h = bottom - node.y;
  }
}

/**
 * Invert the inserted-gap map for a shifted page boundary. A gap always ends
 * exactly on a page boundary (dompdf aligns it there), so the boundary either
 * sits before a gap or at its end.
 */
function originalStartOf(
  shifted: number,
  gaps: readonly InsertedGap[],
): { start: number; topBlank: number } {
  let accumulated = 0;
  for (const gap of gaps) {
    const shiftedStart = gap.at + accumulated;
    if (shifted <= shiftedStart) {
      return { start: shifted - accumulated, topBlank: 0 };
    }
    const shiftedEnd = shiftedStart + gap.size;
    if (shifted < shiftedEnd) {
      return { start: gap.at, topBlank: shiftedEnd - shifted };
    }
    accumulated += gap.size;
  }
  return { start: shifted - accumulated, topBlank: 0 };
}
