/**
 * Workspace split: the writing pane's share of the available width.
 *
 * The value is a fraction, not pixels, so the same preference survives window
 * resizes. It is persisted as a plain number under one localStorage key; the
 * narrow layout ignores it entirely and stacks the panes.
 */

export const SPLIT_STORAGE_KEY = "moye.split.v1";
export const SPLIT_DEFAULT = 0.5;
/** Keep both panes readable even on a wide monitor. */
export const SPLIT_MIN = 0.3;
export const SPLIT_MAX = 0.7;
/** One arrow-key press moves the separator by two percentage points. */
export const SPLIT_STEP = 0.02;

export const SPLIT_PERCENT_MIN = Math.round(SPLIT_MIN * 100);
export const SPLIT_PERCENT_MAX = Math.round(SPLIT_MAX * 100);

/** The subset of Storage the split layer needs; tests supply a memory store. */
export interface SplitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Clamps any input, including NaN/Infinity, to a usable split. */
export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value));
}

/** Parses a stored value; missing, empty or malformed values use the default. */
export function parseSplit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return SPLIT_DEFAULT;
  const value = Number(raw);
  if (!Number.isFinite(value)) return SPLIT_DEFAULT;
  return clampSplit(value);
}

/** Returns localStorage when available, or null in locked-down contexts. */
export function browserSplitStorage(): SplitStorage | null {
  try {
    const storage = globalThis.localStorage;
    return typeof storage?.getItem === "function" ? storage : null;
  } catch (error) {
    console.warn("[moye] 分栏比例不可用", error);
    return null;
  }
}

/** Reads the remembered split, falling back to the default. */
export function readSplit(storage: SplitStorage | null): number {
  if (!storage) return SPLIT_DEFAULT;
  try {
    return parseSplit(storage.getItem(SPLIT_STORAGE_KEY));
  } catch (error) {
    console.warn("[moye] 分栏比例无法读取", error);
    return SPLIT_DEFAULT;
  }
}

/** Persists the clamped split and reports whether the write succeeded. */
export function writeSplit(
  storage: SplitStorage | null,
  value: number,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SPLIT_STORAGE_KEY, String(clampSplit(value)));
    return true;
  } catch (error) {
    console.warn("[moye] 分栏比例无法保存", error);
    return false;
  }
}
