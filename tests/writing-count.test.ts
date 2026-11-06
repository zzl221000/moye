import { describe, expect, it } from "vitest";
import { countCharacters, countWords } from "../src/writing/count";

describe("character count", () => {
  it("counts non-whitespace code points", () => {
    expect(countCharacters("")).toBe(0);
    expect(countCharacters("  \n\t ")).toBe(0);
    expect(countCharacters("a\nb")).toBe(2);
    expect(countCharacters("中文 ABC 123")).toBe(8);
    expect(countCharacters("🙂")).toBe(1);
  });
});

describe("word count", () => {
  it("counts CJK characters and Latin/digit runs", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("标题")).toBe(2);
    expect(countWords("中文 ABC 123")).toBe(4);
    expect(countWords("hello, world!")).toBe(2);
    expect(countWords("汉字 plus 2 words")).toBe(5);
  });
});
