/** Pure Markdown insertion plans for the writing pane's four insert actions. */

export interface InsertionContext {
  /** Source text before the current selection. */
  readonly before: string;
  /** Source text after the current selection. */
  readonly after: string;
  /** Selected source text, empty for a collapsed caret. */
  readonly selected: string;
}

export interface RelativeSelection {
  /** Start offset inside the replacement text. */
  readonly from: number;
  /** End offset inside the replacement text. */
  readonly to: number;
}

export interface InsertionPlan {
  /** Text that replaces the current selection. */
  readonly text: string;
  /** Selection after the insertion, relative to `text`. */
  readonly selection: RelativeSelection;
}

export interface ImageFileInfo {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface ImageInsertion {
  /** Alternative text derived from the chosen file. */
  readonly alt: string;
  /** Either a data URL or a placeholder path. */
  readonly url: string;
  /** Whether the file was embedded into the Markdown. */
  readonly inline: boolean;
}

/** Smallest and largest table the size picker offers, in either direction. */
export const TABLE_SIZE_MIN = 1;
export const TABLE_SIZE_MAX = 8;
export const TABLE_DEFAULT_COLUMNS = 3;
export const TABLE_DEFAULT_ROWS = 2;

/** @param value - Requested row or column count. @returns A whole count inside the picker's range. */
export function clampTableSize(value: number): number {
  const whole = Number.isFinite(value) ? Math.trunc(value) : TABLE_SIZE_MIN;
  return Math.min(TABLE_SIZE_MAX, Math.max(TABLE_SIZE_MIN, whole));
}

/**
 * @param columns - Header and body column count.
 * @param rows - Body row count, excluding the header and separator.
 * @returns A GFM table whose header labels are ready to rename.
 */
export function buildTableTemplate(
  columns = TABLE_DEFAULT_COLUMNS,
  rows = TABLE_DEFAULT_ROWS,
): string {
  const columnCount = clampTableSize(columns);
  const rowCount = clampTableSize(rows);
  const labels = Array.from(
    { length: columnCount },
    (_, index) => `列 ${index + 1}`,
  );
  const separators = Array.from({ length: columnCount }, () => "---");
  const empty = Array.from({ length: columnCount }, () => "");
  const header = `| ${labels.join(" | ")} |`;
  const separator = `| ${separators.join(" | ")} |`;
  const body = `| ${empty.join(" | ")} |`;
  return [header, separator, ...Array<string>(rowCount).fill(body)].join("\n");
}

/** Default table used by the insert action when no size is supplied. */
export const TABLE_TEMPLATE = buildTableTemplate();

export const IMAGE_PLACEHOLDER_URL = "images/image.png";
/** Files above this size stay as a placeholder path instead of bloating the document. */
export const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const IMAGE_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** The placeholder image used when a picker is unavailable or a file is too large. */
export const PLACEHOLDER_IMAGE: ImageFileInfo = {
  name: "图片.png",
  type: "image/png",
  size: 0,
};

/** @param before - Text before the insertion point. @returns Newlines that start a new block. */
function blockBreakBefore(before: string): string {
  if (before.length === 0) return "";
  const lineBreak = before.lastIndexOf("\n");
  if (lineBreak === -1) return "\n\n";
  const currentLine = before.slice(lineBreak + 1);
  if (currentLine.trim() !== "") return "\n\n";
  if (lineBreak === 0) return "";
  const previousBreak = before.lastIndexOf("\n", lineBreak - 1);
  const previousLine = before.slice(previousBreak + 1, lineBreak);
  return previousLine.trim() === "" ? "" : "\n";
}

/** @param after - Text after the insertion point. @returns Newlines that end a block. */
function blockBreakAfter(after: string): string {
  if (after.length === 0) return "";
  const lineBreak = after.indexOf("\n");
  if (lineBreak === -1) return "\n\n";
  const currentLine = after.slice(0, lineBreak);
  if (currentLine.trim() !== "") return "\n\n";
  if (currentLine.length > 0) return "\n";
  if (lineBreak === after.length - 1) return "";
  const nextBreak = after.indexOf("\n", lineBreak + 1);
  const nextLine =
    nextBreak === -1 ? after.slice(lineBreak + 1) : after.slice(lineBreak + 1, nextBreak);
  return nextLine.trim() === "" ? "" : "\n";
}

/**
 * Inserts a clamped GFM table with a header, separator and `rows` empty body
 * rows. A non-empty selection is replaced. The first header label is selected
 * so it can be renamed immediately.
 */
export function buildTableInsertion(
  context: InsertionContext,
  columns = TABLE_DEFAULT_COLUMNS,
  rows = TABLE_DEFAULT_ROWS,
): InsertionPlan {
  const prefix = blockBreakBefore(context.before);
  const suffix = blockBreakAfter(context.after);
  const text = `${prefix}${buildTableTemplate(columns, rows)}${suffix}`;
  const cellFrom = prefix.length + "| ".length;
  return {
    text,
    selection: { from: cellFrom, to: cellFrom + "列 1".length },
  };
}

/** @param content - Text that will live inside a fenced block. @returns A safe fence. */
export function fenceFor(content: string): string {
  let longest = 0;
  let current = 0;
  for (const character of content) {
    if (character === "`") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Wraps the selection in a fenced code block, or inserts an empty fence with
 * the caret on its body line.
 */
export function buildCodeBlockInsertion(
  context: InsertionContext,
): InsertionPlan {
  const prefix = blockBreakBefore(context.before);
  const suffix = blockBreakAfter(context.after);
  const fence = fenceFor(context.selected);
  const body = context.selected
    ? context.selected.endsWith("\n")
      ? context.selected
      : `${context.selected}\n`
    : "\n";
  const text = `${prefix}${fence}\n${body}${fence}${suffix}`;
  const caret = prefix.length + fence.length + 1;
  return { text, selection: { from: caret, to: caret } };
}

/** @param name - Original file name. @param type - Browser-reported MIME type. @returns A supported image type, or null. */
export function imageMimeType(name: string, type: string): string | null {
  const declared = type.toLowerCase();
  if (IMAGE_TYPES.has(declared)) return declared;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPE_BY_EXTENSION[extension] ?? null;
}

/** @param fileName - Original file name. @returns A short, single-line alternative text. */
export function imageAlt(fileName: string): string {
  const leaf = fileName.split(/[\\/]/u).pop() ?? "";
  const base = leaf
    .replace(/\.[^.]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  return base.length > 0 ? base.slice(0, 120) : "图片";
}

/**
 * Chooses between an inline data URL and a placeholder path. The data URL is
 * used only for a supported image type below `MAX_INLINE_IMAGE_BYTES`.
 */
export function planImageInsertion(
  file: ImageFileInfo,
  dataUrl: string | null,
): ImageInsertion {
  const alt = imageAlt(file.name);
  const type = imageMimeType(file.name, file.type);
  if (
    type !== null &&
    file.size > 0 &&
    file.size <= MAX_INLINE_IMAGE_BYTES &&
    dataUrl !== null &&
    dataUrl.startsWith(`data:${type};base64,`)
  ) {
    return { alt, url: dataUrl, inline: true };
  }
  return { alt, url: IMAGE_PLACEHOLDER_URL, inline: false };
}
