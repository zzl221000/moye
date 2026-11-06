import { describe, expect, it } from "vitest";
import {
  clampSplit,
  parseSplit,
  readSplit,
  SPLIT_DEFAULT,
  SPLIT_MAX,
  SPLIT_MIN,
  SPLIT_STORAGE_KEY,
  writeSplit,
  type SplitStorage,
} from "../src/shell/split";

function memoryStorage(initial: Record<string, string> = {}): SplitStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("workspace split", () => {
  it("clamps a split to the readable range", () => {
    expect(clampSplit(0)).toBe(SPLIT_MIN);
    expect(clampSplit(0.2)).toBe(SPLIT_MIN);
    expect(clampSplit(0.5)).toBe(0.5);
    expect(clampSplit(0.9)).toBe(SPLIT_MAX);
    expect(clampSplit(1)).toBe(SPLIT_MAX);
  });

  it("uses the default for non-finite input", () => {
    expect(clampSplit(Number.NaN)).toBe(SPLIT_DEFAULT);
    expect(clampSplit(Number.POSITIVE_INFINITY)).toBe(SPLIT_DEFAULT);
  });

  it("parses missing, malformed and out-of-range stored values", () => {
    expect(parseSplit(null)).toBe(SPLIT_DEFAULT);
    expect(parseSplit("")).toBe(SPLIT_DEFAULT);
    expect(parseSplit("not-a-number")).toBe(SPLIT_DEFAULT);
    expect(parseSplit("0.1")).toBe(SPLIT_MIN);
    expect(parseSplit("0.65")).toBe(0.65);
    expect(parseSplit("2")).toBe(SPLIT_MAX);
  });

  it("round-trips a split and falls back when storage is unavailable", () => {
    const storage = memoryStorage();

    expect(readSplit(storage)).toBe(SPLIT_DEFAULT);
    expect(writeSplit(storage, 0.62)).toBe(true);
    expect(readSplit(storage)).toBe(0.62);
    expect(storage.getItem(SPLIT_STORAGE_KEY)).toBe("0.62");

    expect(readSplit(null)).toBe(SPLIT_DEFAULT);
    expect(writeSplit(null, 0.5)).toBe(false);
  });

  it("reports read and write failures instead of throwing", () => {
    const failingWrite: SplitStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    const failingRead: SplitStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => undefined,
    };

    expect(writeSplit(failingWrite, 0.5)).toBe(false);
    expect(readSplit(failingRead)).toBe(SPLIT_DEFAULT);
  });
});
