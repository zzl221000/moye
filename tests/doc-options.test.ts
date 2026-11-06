import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_OPTIONS,
  OPTIONS_STORAGE_KEY,
  browserOptionsStorage,
  exportSettingsFor,
  parseOptions,
  readOptions,
  renderOptionsFor,
  serializeOptions,
  writeOptions,
  type DocumentOptions,
  type OptionsStorage,
} from "../src/doc/options";
import {
  pageContentHeight,
  paperMetrics,
} from "../src/doc/paper";
import { renderExportDocument } from "../src/doc/render";
import multiH1Markdown from "./fixtures/multi-h1.md?raw";
import simpleMarkdown from "./fixtures/simple.md?raw";

function memoryStorage(initial: Record<string, string> = {}): OptionsStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function options(overrides: Partial<DocumentOptions> = {}): DocumentOptions {
  return { ...DEFAULT_DOCUMENT_OPTIONS, ...overrides };
}

describe("document options", () => {
  it("starts from the previous app's defaults", () => {
    expect(DEFAULT_DOCUMENT_OPTIONS).toEqual({
      paper: "a4",
      margin: "36",
      headerTitle: "",
      pageNumbers: true,
      cover: true,
      pageBreakOnH1: false,
      theme: "paper",
      background: "#ffffff",
      customCss: "",
      compress: true,
    });
  });

  it("serializes in the frozen key's shape and drops retired fields", () => {
    const stored = JSON.parse(serializeOptions(options())) as Record<
      string,
      unknown
    >;

    expect(stored).toEqual({
      paper: "a4",
      margin: "36",
      title: "",
      footer: true,
      cover: true,
      h1Break: false,
      compress: true,
      theme: "paper",
      background: "#ffffff",
      css: "",
    });
    expect(stored).not.toHaveProperty("sync");
    expect(stored).not.toHaveProperty("editMode");
  });

  it("round-trips every setting through the legacy storage key", () => {
    const storage = memoryStorage();
    const source = options({
      paper: "a4-landscape",
      margin: "18",
      headerTitle: "季度报告",
      pageNumbers: false,
      cover: false,
      pageBreakOnH1: true,
      theme: "editorial",
      background: "#fdfbf7",
      customCss: ".pdf-doc h1 { color: #8a3b22; }",
      compress: false,
    });

    expect(writeOptions(storage, source)).toBe(true);
    expect(storage.values.get(OPTIONS_STORAGE_KEY)).toBe(
      serializeOptions(source),
    );
    expect(readOptions(storage)).toEqual(source);
  });

  it("migrates settings stored by the previous interface", () => {
    const stored = JSON.stringify({
      paper: "a4-landscape",
      margin: "18",
      title: "自定义页眉",
      footer: false,
      cover: false,
      h1Break: true,
      compress: false,
      theme: "editorial",
      background: "#fdfbf7",
      css: ".pdf-doc { font-size: 16px; }",
      sync: false,
      editMode: "plain",
    });

    expect(parseOptions(stored)).toEqual({
      paper: "a4-landscape",
      margin: "18",
      headerTitle: "自定义页眉",
      pageNumbers: false,
      cover: false,
      pageBreakOnH1: true,
      theme: "editorial",
      background: "#fdfbf7",
      customCss: ".pdf-doc { font-size: 16px; }",
      compress: false,
    });

    // The retired fields disappear on the next write, but the values that
    // still exist survive.
    const written = memoryStorage();
    writeOptions(written, parseOptions(stored));
    const migrated = JSON.parse(
      written.values.get(OPTIONS_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    expect(migrated.sync).toBeUndefined();
    expect(migrated.editMode).toBeUndefined();
    expect(migrated.title).toBe("自定义页眉");
    expect(migrated.css).toBe(".pdf-doc { font-size: 16px; }");
  });

  it("repairs fields independently instead of discarding the object", () => {
    const stored = JSON.stringify({
      paper: "a5",
      margin: "24",
      title: 42,
      footer: "yes",
      cover: false,
      h1Break: "true",
      compress: null,
      theme: "editorial",
      background: "not-a-color",
      css: 99,
    });

    expect(parseOptions(stored)).toEqual({
      ...DEFAULT_DOCUMENT_OPTIONS,
      cover: false,
      theme: "editorial",
    });
  });

  it("accepts numeric margins and three-digit colours from storage", () => {
    expect(parseOptions(JSON.stringify({ margin: 0 })).margin).toBe("0");
    expect(parseOptions(JSON.stringify({ background: "#abc" })).background).toBe(
      "#aabbcc",
    );
  });

  it("falls back to a theme that exists in the loaded theme table", () => {
    const missing = parseOptions(
      JSON.stringify({ theme: "retired" }),
      ["paper", "editorial"],
    );
    expect(missing.theme).toBe("paper");

    const withoutPaper = parseOptions(
      JSON.stringify({ theme: "retired" }),
      ["editorial", "compact"],
    );
    expect(withoutPaper.theme).toBe("editorial");
  });

  it("uses defaults for malformed or unavailable storage", () => {
    expect(readOptions(null)).toEqual(DEFAULT_DOCUMENT_OPTIONS);
    expect(parseOptions("")).toEqual(DEFAULT_DOCUMENT_OPTIONS);
    expect(parseOptions("not json")).toEqual(DEFAULT_DOCUMENT_OPTIONS);
    expect(parseOptions("null")).toEqual(DEFAULT_DOCUMENT_OPTIONS);
    expect(parseOptions("[]")).toEqual(DEFAULT_DOCUMENT_OPTIONS);

    const failingRead: OptionsStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => undefined,
    };
    const failingWrite: OptionsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };

    expect(readOptions(failingRead)).toEqual(DEFAULT_DOCUMENT_OPTIONS);
    expect(writeOptions(failingWrite, options())).toBe(false);
    expect(writeOptions(null, options())).toBe(false);
  });

  it("reads and writes the browser store when available", () => {
    localStorage.clear();
    const storage = browserOptionsStorage();

    expect(storage).not.toBeNull();
    expect(writeOptions(storage, options({ paper: "letter" }))).toBe(true);
    expect(readOptions(storage).paper).toBe("letter");
  });
});

describe("preview metrics", () => {
  it("mirrors the export kernel's paper sizes and margins", () => {
    const a4 = paperMetrics("a4", 36);
    expect(a4).toMatchObject({
      widthPt: 595.5,
      heightPt: 842.25,
      marginPt: 36,
      marginPx: 48,
      widthPx: 794,
      heightPx: 1123,
      contentWidthPx: 698,
      headerHeight: 34,
      footerHeight: 28,
    });

    const landscape = paperMetrics("a4-landscape", 18);
    expect(landscape).toMatchObject({
      widthPx: 1123,
      heightPx: 794,
      marginPx: 24,
      contentWidthPx: 1075,
    });

    const letter = paperMetrics("letter", 0);
    expect(letter).toMatchObject({
      widthPx: 816,
      heightPx: 1056,
      marginPx: 0,
      contentWidthPx: 816,
    });
  });

  it("subtracts header and footer bands from the printable height", () => {
    const a4 = paperMetrics("a4", 36);
    expect(pageContentHeight(a4, false)).toBe(1027);
    expect(pageContentHeight(a4, true)).toBe(965);
    expect(pageContentHeight(paperMetrics("a4", 0), true)).toBe(1061);
    expect(pageContentHeight({ ...a4, heightPx: 0 }, true)).toBe(1);
  });
});

describe("options mapping", () => {
  it("passes theme and detail CSS to the shared render seam", () => {
    expect(
      renderOptionsFor(
        options({ theme: "compact", customCss: ".pdf-doc { color: red; }" }),
      ),
    ).toEqual({
      theme: "compact",
      customCss: ".pdf-doc { color: red; }",
    });
  });

  it("takes the header title from the first H1 when the field is empty", () => {
    const document = renderExportDocument(multiH1Markdown);
    const settings = exportSettingsFor(options(), document);

    expect(document.title).toBe("第一章 起点");
    expect(settings.headerTitle).toBe("第一章 起点");
    expect(settings.headerTitle).not.toContain("第二章");
  });

  it("prefers an explicit header title over the first H1", () => {
    const document = renderExportDocument(multiH1Markdown);
    const settings = exportSettingsFor(
      options({ headerTitle: "  内部评审  " }),
      document,
    );

    expect(settings.headerTitle).toBe("内部评审");
  });

  it("carries the normalized document name into export settings", () => {
    const document = renderExportDocument(multiH1Markdown);
    const settings = exportSettingsFor(options(), document, "季度报告.md");

    expect(settings.fileName).toBe("季度报告.md");
  });

  it("maps paper, layout and document settings to the frozen export options", () => {
    const document = renderExportDocument(simpleMarkdown);
    const settings = exportSettingsFor(
      options({
        paper: "letter",
        margin: "0",
        pageNumbers: false,
        cover: false,
        pageBreakOnH1: true,
        compress: false,
        theme: "dark",
        background: "#0d1117",
      }),
      document,
    );

    expect(settings).toEqual({
      paper: "letter",
      marginPt: 0,
      headerTitle: "会议纪要",
      pageNumbers: false,
      cover: false,
      pageBreakOnH1: true,
      compress: false,
      background: "#0d1117",
      fileName: "",
    });
  });

  it("uses the theme background when the stored background is empty", () => {
    const document = renderExportDocument(simpleMarkdown, { theme: "dark" });
    const settings = exportSettingsFor(
      options({ theme: "dark", background: "" }),
      document,
    );

    expect(settings.background).toBe("#0d1117");
  });
});
