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

export const TABLE_TEMPLATE = [
  "| 列 1 | 列 2 |",
  "| --- | --- |",
  "|  |  |",
  "|  |  |",
].join("\n");

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
 * Inserts a two-column GFM table with a header, separator and two empty rows.
 * A non-empty selection is replaced. The first header label is selected so it
 * can be renamed immediately.
 */
export function buildTableInsertion(context: InsertionContext): InsertionPlan {
  const prefix = blockBreakBefore(context.before);
  const suffix = blockBreakAfter(context.after);
  const text = `${prefix}${TABLE_TEMPLATE}${suffix}`;
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
