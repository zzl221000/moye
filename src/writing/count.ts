/** Text counter for the status bar. It operates on the Markdown source. */

const WHITESPACE = /\s/gu;

/**
 * Counts visible characters, ignoring whitespace. Code points rather than
 * UTF-16 units keep emoji and rare CJK extension characters as one each.
 */
export function countCharacters(text: string): number {
  return Array.from(text.replace(WHITESPACE, "")).length;
}
