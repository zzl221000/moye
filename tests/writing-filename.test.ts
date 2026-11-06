import { describe, expect, it } from "vitest";
import {
  FALLBACK_FILE_NAME,
  isMarkdownFile,
  normalizeFileName,
  normalizeLineEndings,
} from "../src/writing/filename";

describe("file-name normalization", () => {
  it("falls back to 未命名.md for blank names", () => {
    expect(normalizeFileName("")).toBe(FALLBACK_FILE_NAME);
    expect(normalizeFileName("   ")).toBe(FALLBACK_FILE_NAME);
  });

  it("adds the Markdown suffix when it is missing", () => {
    expect(normalizeFileName("季度报告")).toBe("季度报告.md");
    expect(normalizeFileName("notes.MD")).toBe("notes.MD");
    expect(normalizeFileName("notes.markdown")).toBe("notes.markdown");
    expect(normalizeFileName("notes.txt")).toBe("notes.txt");
  });

  it("keeps only the leaf name and replaces rejected characters", () => {
    expect(normalizeFileName("C:\\工作\\季度:报告?.md")).toBe("季度-报告-.md");
    expect(normalizeFileName("../drafts/notes.md")).toBe("notes.md");
  });

  it("recognizes Markdown by name or media type", () => {
    expect(isMarkdownFile("报告.md")).toBe(true);
    expect(isMarkdownFile("报告.markdown")).toBe(true);
    expect(isMarkdownFile("报告.txt")).toBe(true);
    expect(isMarkdownFile("unknown", "text/markdown")).toBe(true);
    expect(isMarkdownFile("notes.pdf", "application/pdf")).toBe(false);
  });

  it("normalizes mixed line endings to LF", () => {
    expect(normalizeLineEndings("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
});
