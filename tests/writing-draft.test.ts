import { describe, expect, it } from "vitest";
import {
  DRAFT_STORAGE_KEY,
  readDraft,
  writeDraft,
  type DraftStorage,
} from "../src/writing/draft";

function memoryStorage(initial: Record<string, string> = {}): DraftStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("draft storage", () => {
  it("treats a missing key as no draft", () => {
    expect(readDraft(memoryStorage())).toBeNull();
    expect(readDraft(null)).toBeNull();
  });

  it("round-trips a draft and normalizes its name", () => {
    const storage = memoryStorage();
    const written = writeDraft(storage, {
      name: "季度报告",
      content: "# 标题\n",
      at: 1_760_000_000_000,
    });

    expect(written).toBe(true);
    expect(readDraft(storage)).toEqual({
      name: "季度报告.md",
      content: "# 标题\n",
      at: 1_760_000_000_000,
    });
  });

  it("ignores malformed JSON and malformed shapes", () => {
    expect(
      readDraft(memoryStorage({ [DRAFT_STORAGE_KEY]: "{not json" })),
    ).toBeNull();
    expect(
      readDraft(memoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify([]) })),
    ).toBeNull();
    expect(
      readDraft(
        memoryStorage({
          [DRAFT_STORAGE_KEY]: JSON.stringify({ name: "a.md" }),
        }),
      ),
    ).toBeNull();
    expect(
      readDraft(
        memoryStorage({
          [DRAFT_STORAGE_KEY]: JSON.stringify({
            name: "a.md",
            content: 42,
          }),
        }),
      ),
    ).toBeNull();
  });

  it("keeps content but repairs a missing timestamp", () => {
    const draft = readDraft(
      memoryStorage({
        [DRAFT_STORAGE_KEY]: JSON.stringify({
          name: "a.md",
          content: "正文",
        }),
      }),
    );

    expect(draft?.content).toBe("正文");
    expect(draft?.at).toBeTypeOf("number");
  });

  it("reports write and read failures instead of throwing", () => {
    const failingWrite: DraftStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    const failingRead: DraftStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => undefined,
    };

    expect(
      writeDraft(failingWrite, { name: "a.md", content: "", at: 0 }),
    ).toBe(false);
    expect(readDraft(failingRead)).toBeNull();
  });
});
