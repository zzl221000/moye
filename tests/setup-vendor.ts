import { createRequire } from "node:module";
import type {
  DocumentTheme,
  MarkedApi,
  PurifyApi,
  ThemeTable,
} from "../src/doc/vendor";

/**
 * The production app loads these exact UMD builds with <script> tags. Tests
 * load the same bytes through Node's CommonJS loader, so snapshots cover the
 * frozen parser/sanitizer rather than a second npm copy.
 */
const requireModule = createRequire(import.meta.url);

function load(relativePath: string): unknown {
  return requireModule(relativePath) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarked(value: unknown): value is MarkedApi {
  return isRecord(value) && typeof value.parse === "function";
}

function isPurify(value: unknown): value is PurifyApi {
  // DOMPurify's browser build is a callable object, not a plain record.
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "sanitize" in value &&
    typeof value.sanitize === "function"
  );
}

function isTheme(value: unknown): value is DocumentTheme {
  if (!isRecord(value)) return false;
  return (
    typeof value.background === "string" &&
    typeof value.headerColor === "string" &&
    typeof value.footerColor === "string" &&
    typeof value.css === "string"
  );
}

function isThemeTable(value: unknown): value is ThemeTable {
  if (!isRecord(value)) return false;
  const themes = Object.values(value);
  return themes.length > 0 && themes.every(isTheme);
}

const marked = load("../vendor/marked.min.js");
const purify = load("../vendor/purify.min.js");
const themes = load("../themes.js");

if (!isMarked(marked)) {
  throw new Error("无法加载 vendor/marked.min.js");
}
if (!isPurify(purify)) {
  throw new Error("无法加载 vendor/purify.min.js");
}
if (!isThemeTable(themes)) {
  throw new Error("无法加载 themes.js");
}

globalThis.marked = marked;
globalThis.DOMPurify = purify;
globalThis.MOYE_THEMES = themes;
