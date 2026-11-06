import { describe, expect, it } from "vitest";
import { pdfFileName } from "../src/doc/export";

describe("PDF file name", () => {
  it("uses the normalized document name and replaces the Markdown suffix", () => {
    expect(pdfFileName("季度报告.md", "第一章")).toBe("季度报告.pdf");
    expect(pdfFileName("notes.markdown", "第一章")).toBe("notes.pdf");
    expect(pdfFileName("notes.txt", "第一章")).toBe("notes.pdf");
  });

  it("falls back to the first H1 only when the name is empty", () => {
    expect(pdfFileName("", "第一章 起点")).toBe("第一章 起点.pdf");
    expect(pdfFileName("   ", "第一章 起点")).toBe("第一章 起点.pdf");
    expect(pdfFileName("季度报告.md", "第一章 起点")).toBe("季度报告.pdf");
  });

  it("sanitizes characters the browser rejects", () => {
    expect(pdfFileName("季度:报告?.md", "第一章")).toBe("季度-报告-.pdf");
    expect(pdfFileName("", "")).toBe("未命名.pdf");
  });
});
