/** Text counters for the status bar. Both operate on the Markdown source. */

const WHITESPACE = /\s/gu;
const CJK_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Counts visible characters, ignoring whitespace. Code points rather than
 * UTF-16 units keep emoji and rare CJK extension characters as one each.
 */
export function countCharacters(text: string): number {
  return Array.from(text.replace(WHITESPACE, "")).length;
}

/**
 * Counts words the way Chinese writing tools do: every CJK character is one
 * word, and each remaining run of letters or digits is one word.
 */
export function countWords(text: string): number {
  const cjk = text.match(CJK_CHARACTER)?.length ?? 0;
  const remainder = text.replace(CJK_CHARACTER, " ");
  const words = remainder.match(WORD)?.length ?? 0;
  return cjk + words;
}
