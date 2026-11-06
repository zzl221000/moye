import type { ExportDocument, ExportRenderOptions } from "./render";
import {
  isMarginValue,
  isPaperKind,
  type MarginValue,
  type PaperKind,
} from "./paper";

/**
 * The single settings model behind the panel, the 版式预览 and the export.
 *
 * The persisted shape deliberately keeps the frozen app's field names and
 * localStorage key (`moye.options.v1`), so settings saved by the previous
 * interface survive. `sync` and `editMode` are no longer settings and are
 * dropped when the next change is written.
 */
export interface DocumentOptions {
  readonly paper: PaperKind;
  readonly margin: MarginValue;
  /** Page-header override; empty means the document's first H1. */
  readonly headerTitle: string;
  readonly pageNumbers: boolean;
  readonly cover: boolean;
  readonly pageBreakOnH1: boolean;
  readonly theme: string;
  readonly background: string;
  readonly customCss: string;
  readonly compress: boolean;
}

export const OPTIONS_STORAGE_KEY = "moye.options.v1";
export const DEFAULT_THEME_ID = "paper";

export const DEFAULT_DOCUMENT_OPTIONS: DocumentOptions = Object.freeze({
  paper: "a4",
  margin: "36",
  headerTitle: "",
  pageNumbers: true,
  cover: true,
  pageBreakOnH1: false,
  theme: DEFAULT_THEME_ID,
  background: "#ffffff",
  customCss: "",
  compress: true,
});

/** The subset of Storage the settings layer needs; tests supply a memory store. */
export interface OptionsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What the frozen `DocExport.exportElement` receives besides theme colours. */
export type DocumentExportSettings = {
  readonly paper: PaperKind;
  readonly marginPt: number;
  readonly headerTitle: string;
  readonly pageNumbers: boolean;
  readonly cover: boolean;
  readonly pageBreakOnH1: boolean;
  readonly compress: boolean;
  readonly background: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function readBoolean(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback: boolean,
): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return fallback;
}

function normalizeBackground(value: string | null): string {
  if (value === null) return DEFAULT_DOCUMENT_OPTIONS.background;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) {
    const [r, g, b] = color.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return DEFAULT_DOCUMENT_OPTIONS.background;
}

function normalizeMargin(value: unknown): MarginValue {
  if (isMarginValue(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const text = String(value);
    if (isMarginValue(text)) return text;
  }
  return DEFAULT_DOCUMENT_OPTIONS.margin;
}

function normalizeTheme(
  value: string | null,
  availableThemes: readonly string[] | undefined,
): string {
  if (availableThemes === undefined) {
    return value && value.trim() !== ""
      ? value
      : DEFAULT_DOCUMENT_OPTIONS.theme;
  }
  if (value && availableThemes.includes(value)) return value;
  if (availableThemes.includes(DEFAULT_THEME_ID)) return DEFAULT_THEME_ID;
  return availableThemes[0] ?? DEFAULT_THEME_ID;
}

/**
 * Reads a stored options object. Unknown fields are ignored, and each invalid
 * field independently falls back to its default, so one corrupt value cannot
 * discard the rest of the settings.
 */
export function parseOptions(
  raw: string | null,
  availableThemes?: readonly string[],
): DocumentOptions {
  if (raw === null || raw.trim() === "") {
    return { ...DEFAULT_DOCUMENT_OPTIONS };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn("[moye] 设置无法解析", error);
    return { ...DEFAULT_DOCUMENT_OPTIONS };
  }
  if (!isRecord(parsed)) return { ...DEFAULT_DOCUMENT_OPTIONS };

  return {
    paper: isPaperKind(parsed.paper)
      ? parsed.paper
      : DEFAULT_DOCUMENT_OPTIONS.paper,
    margin: normalizeMargin(parsed.margin),
    headerTitle:
      readString(parsed, ["headerTitle", "title"]) ??
      DEFAULT_DOCUMENT_OPTIONS.headerTitle,
    pageNumbers: readBoolean(
      parsed,
      ["pageNumbers", "footer"],
      DEFAULT_DOCUMENT_OPTIONS.pageNumbers,
    ),
    cover: readBoolean(
      parsed,
      ["cover"],
      DEFAULT_DOCUMENT_OPTIONS.cover,
    ),
    pageBreakOnH1: readBoolean(
      parsed,
      ["pageBreakOnH1", "h1Break"],
      DEFAULT_DOCUMENT_OPTIONS.pageBreakOnH1,
    ),
    theme: normalizeTheme(
      readString(parsed, ["theme"]),
      availableThemes,
    ),
    background: normalizeBackground(readString(parsed, ["background"])),
    customCss:
      readString(parsed, ["customCss", "css"]) ??
      DEFAULT_DOCUMENT_OPTIONS.customCss,
    compress: readBoolean(
      parsed,
      ["compress"],
      DEFAULT_DOCUMENT_OPTIONS.compress,
    ),
  };
}

/** Serializes in the frozen interface's shape, minus the retired fields. */
export function serializeOptions(options: DocumentOptions): string {
  return JSON.stringify({
    paper: options.paper,
    margin: options.margin,
    title: options.headerTitle,
    footer: options.pageNumbers,
    cover: options.cover,
    h1Break: options.pageBreakOnH1,
    compress: options.compress,
    theme: options.theme,
    background: options.background,
    css: options.customCss,
  });
}

/** Returns localStorage when available, or null in locked-down contexts. */
export function browserOptionsStorage(): OptionsStorage | null {
  try {
    const storage = globalThis.localStorage;
    return typeof storage?.getItem === "function" ? storage : null;
  } catch (error) {
    console.warn("[moye] 设置存储不可用", error);
    return null;
  }
}

/** Reads the remembered settings, migrating or repairing malformed fields. */
export function readOptions(
  storage: OptionsStorage | null,
  availableThemes?: readonly string[],
): DocumentOptions {
  if (!storage) return { ...DEFAULT_DOCUMENT_OPTIONS };
  try {
    return parseOptions(storage.getItem(OPTIONS_STORAGE_KEY), availableThemes);
  } catch (error) {
    console.warn("[moye] 设置无法读取", error);
    return { ...DEFAULT_DOCUMENT_OPTIONS };
  }
}

/** Persists settings and reports whether the write succeeded. */
export function writeOptions(
  storage: OptionsStorage | null,
  options: DocumentOptions,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(OPTIONS_STORAGE_KEY, serializeOptions(options));
    return true;
  } catch (error) {
    console.warn("[moye] 设置无法保存", error);
    return false;
  }
}

/** Everything the shared render seam needs from the settings model. */
export function renderOptionsFor(
  options: DocumentOptions,
): ExportRenderOptions {
  return { theme: options.theme, customCss: options.customCss };
}

/**
 * The one mapping from settings to the frozen export chain. The preview and
 * the export call the same `renderExportDocument` first, so a theme or detail
 * CSS change cannot diverge between them.
 */
export function exportSettingsFor(
  options: DocumentOptions,
  document: ExportDocument,
): DocumentExportSettings {
  return {
    paper: options.paper,
    marginPt: Number(options.margin),
    headerTitle: options.headerTitle.trim() || document.title,
    pageNumbers: options.pageNumbers,
    cover: options.cover,
    pageBreakOnH1: options.pageBreakOnH1,
    compress: options.compress,
    background: options.background || document.background,
  };
}
