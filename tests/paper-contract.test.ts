import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MARGIN_VALUES,
  PAGE_FOOTER_HEIGHT,
  PAGE_HEADER_HEIGHT,
  PAPER_KINDS,
  paperMetrics,
  type PageMetrics,
} from "../src/doc/paper";

type ExportKernel = {
  readonly HEADER_HEIGHT: number;
  readonly FOOTER_HEIGHT: number;
  readonly papers: Readonly<
    Record<string, { readonly widthPt: number; readonly heightPt: number }>
  >;
  metrics(paper: string, marginPt: number): PageMetrics;
};

/**
 * The frozen `export-doc.js` is browser code, but its top level only builds the
 * `DocExport` table, so a bare `window` object is enough to read the contract.
 */
function loadExportKernel(): ExportKernel {
  const sandbox: { window?: unknown; DocExport?: ExportKernel } = {};
  sandbox.window = sandbox;
  createContext(sandbox);
  runInContext(
    readFileSync(resolve(process.cwd(), "export-doc.js"), "utf8"),
    sandbox,
  );
  if (!sandbox.DocExport) {
    throw new Error("export-doc.js 没有导出 DocExport");
  }
  return sandbox.DocExport;
}

describe("paper contract with export-doc.js", () => {
  const kernel = loadExportKernel();

  it("keeps the same paper table and band heights", () => {
    expect(Object.keys(kernel.papers).sort()).toEqual([...PAPER_KINDS].sort());
    expect(kernel.HEADER_HEIGHT).toBe(PAGE_HEADER_HEIGHT);
    expect(kernel.FOOTER_HEIGHT).toBe(PAGE_FOOTER_HEIGHT);

    for (const paper of PAPER_KINDS) {
      const exported = kernel.papers[paper];
      expect(exported, paper).toBeDefined();
      expect(exported?.widthPt, paper).toBe(paperMetrics(paper, 0).widthPt);
      expect(exported?.heightPt, paper).toBe(paperMetrics(paper, 0).heightPt);
    }
  });

  it("produces identical metrics for every paper and margin", () => {
    for (const paper of PAPER_KINDS) {
      for (const margin of MARGIN_VALUES) {
        expect(paperMetrics(paper, Number(margin))).toEqual(
          kernel.metrics(paper, Number(margin)),
        );
      }
    }
  });
});
