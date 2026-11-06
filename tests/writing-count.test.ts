import { describe, expect, it } from "vitest";
import { countCharacters } from "../src/writing/count";

describe("character count", () => {
  it("counts non-whitespace code points", () => {
    expect(countCharacters("")).toBe(0);
    expect(countCharacters("  \n\t ")).toBe(0);
    expect(countCharacters("a\nb")).toBe(2);
    expect(countCharacters("中文 ABC 123")).toBe(8);
    expect(countCharacters("🙂")).toBe(1);
  });
});
