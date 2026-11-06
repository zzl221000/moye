import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY, type DraftStorage } from "../src/writing/draft";
import { WritingSession } from "../src/writing/session";

const TWO_COLUMNS = [
  "| 列 1 | 列 2 |",
  "| --- | --- |",
  "|  |  |",
].join("\n");

class MemoryStorage implements DraftStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

interface Mounted {
  readonly session: WritingSession;
  /** Latest source snapshot published to the shell. */
  markdown(): string;
}

let mounted: Mounted | null = null;

function mount(content: string): Mounted {
  const host = document.createElement("div");
  document.body.append(host);
  const storage = new MemoryStorage();
  storage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({ name: "表格.md", content, at: Date.now() }),
  );
  let latest = content;
  const session = new WritingSession({
    host,
    storage,
    onState: (state) => {
      latest = state.markdown;
    },
  });
  mounted = { session, markdown: () => latest };
  return mounted;
}

/** @param markdown - GFM table. @returns Cell counts for every structural line. */
function cellCounts(markdown: string): number[] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.trim().replace(/^\||\|$/gu, "").split("|").length);
}

afterEach(() => {
  mounted?.session.destroy();
  mounted = null;
  document.body.replaceChildren();
});

describe("table structure", () => {
  it("reports the header row as non-deletable and columns as deletable", () => {
    const current = mount("");
    expect(current.session.insertTable(2, 1)).toBe(true);
    const structure = current.session.structure();

    expect(structure.table).toBe(true);
    expect(structure.deleteRow).toBe(false);
    expect(structure.deleteColumn).toBe(true);
  });

  it("reports no table for ordinary prose", () => {
    const current = mount("普通段落");
    const structure = current.session.structure();

    expect(structure.table).toBe(false);
    expect(structure.deleteRow).toBe(false);
    expect(structure.deleteColumn).toBe(false);
  });

  it("adds and removes a body row without touching the header", () => {
    const current = mount("");
    expect(current.session.insertTable(2, 1)).toBe(true);

    expect(current.session.insertTableRow()).toBe(true);
    expect(current.session.structure().deleteRow).toBe(true);
    expect(cellCounts(current.markdown())).toEqual([2, 2, 2, 2]);

    expect(current.session.deleteTableRow()).toBe(true);
    expect(current.markdown()).toBe(TWO_COLUMNS);
  });

  it("adds and removes a column on every structural line", () => {
    const current = mount("");
    expect(current.session.insertTable(2, 1)).toBe(true);

    expect(current.session.insertTableColumn()).toBe(true);
    expect(cellCounts(current.markdown())).toEqual([3, 3, 3]);

    expect(current.session.deleteTableColumn()).toBe(true);
    expect(current.markdown()).toBe(TWO_COLUMNS);
  });

  it("disables the last column without a diagnostic", () => {
    const current = mount("");
    expect(current.session.insertTable(1, 1)).toBe(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(current.session.structure().deleteColumn).toBe(false);

    expect(current.session.deleteTableColumn()).toBe(false);
    expect(current.markdown()).toBe("| 列 1 |\n| --- |\n|  |");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("table insertion", () => {
  it("inserts the picked shape and leaves the first header label selected", () => {
    const current = mount("");

    expect(current.session.insertTable(4, 3)).toBe(true);
    expect(cellCounts(current.markdown())).toEqual([4, 4, 4, 4, 4]);
    expect(current.markdown().split("\n")[0]).toBe(
      "| 列 1 | 列 2 | 列 3 | 列 4 |",
    );
    expect(current.session.structure().table).toBe(true);
    expect(current.session.structure().deleteRow).toBe(false);
  });
});
