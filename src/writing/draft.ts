import { normalizeFileName } from "./filename";

/** localStorage key kept from the pre-rewrite app so existing drafts survive. */
export const DRAFT_STORAGE_KEY = "moye.draft.v1";

export interface Draft {
  readonly name: string;
  readonly content: string;
  readonly at: number;
}

/** The subset of Storage the draft layer needs; tests supply a memory implementation. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Returns localStorage when the browser allows it, or null in locked-down contexts. */
export function browserDraftStorage(): DraftStorage | null {
  try {
    const storage = globalThis.localStorage;
    return typeof storage?.getItem === "function" ? storage : null;
  } catch (error) {
    console.warn("[moye] 本地草稿不可用", error);
    return null;
  }
}

/** Reads and validates a draft; malformed or unreadable values count as absent. */
export function readDraft(storage: DraftStorage | null): Draft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const { name, content, at } = parsed;
    if (typeof name !== "string" || typeof content !== "string") return null;
    return {
      name: normalizeFileName(name),
      content,
      at:
        typeof at === "number" && Number.isFinite(at) && at >= 0
          ? at
          : Date.now(),
    };
  } catch (error) {
    console.warn("[moye] 本地草稿无法读取", error);
    return null;
  }
}

/** Persists a draft and reports whether the write succeeded. */
export function writeDraft(
  storage: DraftStorage | null,
  draft: Draft,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch (error) {
    console.warn("[moye] 本地草稿无法保存", error);
    return false;
  }
}
