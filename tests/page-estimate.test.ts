import { describe, expect, it } from "vitest";
import {
  estimatePageCount,
  PAGE_CONTENT_HEIGHT_PX,
} from "../src/doc/page-estimate";

describe("page estimate", () => {
  it("claims no page for an empty document", () => {
    expect(estimatePageCount(0)).toBe(0);
    expect(estimatePageCount(-10)).toBe(0);
    expect(estimatePageCount(Number.NaN)).toBe(0);
  });

  it("rounds content height up against one printable page", () => {
    expect(PAGE_CONTENT_HEIGHT_PX).toBe(1027);
    expect(estimatePageCount(1)).toBe(1);
    expect(estimatePageCount(PAGE_CONTENT_HEIGHT_PX)).toBe(1);
    expect(estimatePageCount(PAGE_CONTENT_HEIGHT_PX + 1)).toBe(2);
    expect(estimatePageCount(PAGE_CONTENT_HEIGHT_PX * 2)).toBe(2);
    expect(estimatePageCount(PAGE_CONTENT_HEIGHT_PX * 2 + 1)).toBe(3);
  });

  it("accepts an explicit page height and rejects an invalid one", () => {
    expect(estimatePageCount(100, 50)).toBe(2);
    expect(estimatePageCount(100, 0)).toBe(0);
  });
});
