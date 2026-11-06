/** File-name rules shared by open, save, save-as and draft restore. */

export const FALLBACK_FILE_NAME = "未命名.md";

const MARKDOWN_SUFFIX = /\.(?:md|markdown|txt)$/iu;
const ILLEGAL_NAME_CHARACTERS = /[<>:"|?*\u0000-\u001f]/gu;

/**
 * Trims path noise from a file name, replaces characters the browser and the
 * operating system reject, and appends `.md` when no Markdown suffix exists.
 */
export function normalizeFileName(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  const leaf = raw.split(/[\\/]/u).pop() ?? "";
  const cleaned = leaf.replace(ILLEGAL_NAME_CHARACTERS, "-").trim();
  const base = cleaned.length > 0 ? cleaned : FALLBACK_FILE_NAME;
  return MARKDOWN_SUFFIX.test(base) ? base : `${base}.md`;
}

/** Reports whether a dropped or picked file is a Markdown document. */
export function isMarkdownFile(name: string, type = ""): boolean {
  if (MARKDOWN_SUFFIX.test(name)) return true;
  return type === "text/markdown" || type === "text/plain";
}

/**
 * MSFE accepts only uniform line endings. Opening a file with mixed or bare CR
 * endings would reject the mount, so normalize everything to LF.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/gu, "\n");
}
