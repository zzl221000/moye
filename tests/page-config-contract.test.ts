import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildExportPageConfig } from "../src/doc/page-config";
import type { DocExportApi } from "../src/doc/vendor";

type PageConfig = {
  excludePages?: number[];
  header?: { content: string; height: number; padding: number[] };
  footer?: { content: string; height: number; padding: number[] };
};

type Kernel = {
  readonly HEADER_HEIGHT: number;
  readonly FOOTER_HEIGHT: number;
  buildPageConfig(
    options: {
      cover?: boolean;
      headerTitle?: string;
      headerColor?: string;
      footerColor?: string;
    },
    hasHeader: boolean,
    hasFooter: boolean,
  ): PageConfig | (() => null);
};

/** `export-doc.js` only needs `window` to install `DocExport`. */
function loadKernel(): Kernel {
  const sandbox: { window?: unknown; DocExport?: Kernel } = {};
  sandbox.window = sandbox;
  createContext(sandbox);
  runInContext(
    readFileSync(resolve(process.cwd(), "export-doc.js"), "utf8"),
    sandbox,
  );
  if (!sandbox.DocExport) throw new Error("export-doc.js 没有导出 DocExport");
  return sandbox.DocExport;
}

describe("page-config contract with export-doc.js", () => {
  const kernel = loadKernel();

  it("delegates to the frozen builder with the export's band switches", () => {
    const config = buildExportPageConfig(kernel as unknown as DocExportApi, {
      cover: false,
      headerTitle: "第一章",
      pageNumbers: true,
      headerColor: "#111111",
      footerColor: "#222222",
    }) as PageConfig;

    expect(config.header?.content).toBe("第一章");
    expect(config.header?.height).toBe(kernel.HEADER_HEIGHT);
    expect(config.footer?.height).toBe(kernel.FOOTER_HEIGHT);
    expect(config.excludePages).toBeUndefined();
  });

  it("excludes the first page only when the cover option is on", () => {
    const config = buildExportPageConfig(kernel as unknown as DocExportApi, {
      cover: true,
      headerTitle: "第一章",
      pageNumbers: true,
      headerColor: "#111111",
      footerColor: "#222222",
    }) as PageConfig;

    expect(config.excludePages).toEqual([1]);
  });

  it("disables both bands with a resolver, not by omitting a height", () => {
    const resolver = buildExportPageConfig(kernel as unknown as DocExportApi, {
      cover: true,
      headerTitle: "",
      pageNumbers: false,
      headerColor: "#111111",
      footerColor: "#222222",
    }) as () => null;

    expect(typeof resolver).toBe("function");
    expect(resolver()).toBeNull();
  });

  it("returns zero-height bands when only one band is enabled", () => {
    const headerOnly = buildExportPageConfig(
      kernel as unknown as DocExportApi,
      {
        cover: false,
        headerTitle: "第一章",
        pageNumbers: false,
        headerColor: "#111111",
        footerColor: "#222222",
      },
    ) as PageConfig;
    const footerOnly = buildExportPageConfig(
      kernel as unknown as DocExportApi,
      {
        cover: false,
        headerTitle: "",
        pageNumbers: true,
        headerColor: "#111111",
        footerColor: "#222222",
      },
    ) as PageConfig;

    expect(headerOnly.header?.height).toBe(kernel.HEADER_HEIGHT);
    expect(headerOnly.footer?.height).toBe(0);
    expect(footerOnly.header?.height).toBe(0);
    expect(footerOnly.footer?.height).toBe(kernel.FOOTER_HEIGHT);
  });
});
