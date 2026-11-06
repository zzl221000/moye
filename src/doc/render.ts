import type {
  DocumentTheme,
  MarkedApi,
  PurifyApi,
  ThemeTable,
} from "./vendor";

/**
 * The single render seam: Markdown plus options become the exact HTML the
 * 版式预览 displays and the export clone is handed to `DocExport`.
 *
 * It is pure with respect to application state: no signals, no editor, no
 * settings store, no DOM side effects beyond a detached `<article>` used for
 * deterministic parsing. The frozen parser and sanitizer are read from the
 * globals installed by `runtime.ts` (or by the test harness).
 */
export type ExportRenderOptions = {
  /** Key into the frozen `themes.js` table. */
  theme?: string;
  /** Detail CSS appended after the theme, matching the CLI's `--css`. */
  customCss?: string;
};

export type ExportDocument = {
  theme: string;
  /** Full `<article class="pdf-doc">…</article>` markup. */
  html: string;
  /** Theme CSS plus detail CSS, scoped to `.pdf-doc` by convention. */
  css: string;
  background: string;
  headerColor: string;
  footerColor: string;
  /** First level-1 heading, used as the PDF header title like the CLI does. */
  title: string;
};

const DEFAULT_THEME = "paper";
const LONG_TOKEN = /[A-Za-z0-9_\-./:@?&=%+#]{24,}/;

function requireMarked(): MarkedApi {
  const engine = globalThis.marked;
  if (!engine) {
    throw new Error("Markdown 引擎未加载");
  }
  return engine;
}

function requirePurify(): PurifyApi {
  const sanitizer = globalThis.DOMPurify;
  if (!sanitizer) {
    throw new Error("HTML 净化器未加载");
  }
  return sanitizer;
}

function requireThemes(): ThemeTable {
  const themes = globalThis.MOYE_THEMES;
  if (!themes) {
    throw new Error("文档主题未加载");
  }
  return themes;
}

/** Mirrors `stripFrontMatter()` in the frozen CLI. */
function stripFrontMatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

/** Mirrors `firstHeading()` in the frozen CLI. */
function firstHeading(text: string): string {
  const heading = text.match(/^#\s+(.+)$/m)?.[1];
  return heading ? heading.replace(/[*_`~]/g, "").trim() : "";
}

function buildArticle(html: string): HTMLElement {
  const article = document.createElement("article");
  article.className = "pdf-doc";
  article.innerHTML = html;

  // Preview-only affordances from the old render path. They are part of the
  // shared result so the preview and the export clone stay identical.
  for (const box of article.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )) {
    box.disabled = true;
    box.parentElement?.classList.add("task-list-item");
  }

  for (const link of article.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    link.target = "_blank";
    link.rel = "noreferrer noopener";
  }

  for (const cell of article.querySelectorAll<HTMLTableCellElement>("td, th")) {
    if (LONG_TOKEN.test(cell.textContent ?? "")) {
      cell.classList.add("cell-wrap-anywhere");
    }
  }

  return article;
}

function resolveTheme(options: ExportRenderOptions): {
  name: string;
  theme: DocumentTheme;
} {
  const themes = requireThemes();
  const name = options.theme ?? DEFAULT_THEME;
  const theme = themes[name];
  if (!theme) {
    throw new Error(`未知文档主题：${name}`);
  }
  return { name, theme };
}

export function renderExportDocument(
  markdown: string,
  options: ExportRenderOptions = {},
): ExportDocument {
  const { name, theme } = resolveTheme(options);
  const source = stripFrontMatter(markdown);
  const parsed = requireMarked().parse(source, { gfm: true, breaks: false });
  const sanitized = requirePurify().sanitize(parsed, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["align", "target"],
  });
  const article = buildArticle(sanitized);

  return {
    theme: name,
    html: article.outerHTML,
    css: [theme.css, options.customCss ?? ""].filter(Boolean).join("\n"),
    background: theme.background,
    headerColor: theme.headerColor,
    footerColor: theme.footerColor,
    title: firstHeading(source),
  };
}

/**
 * Turn the shared result into a clean `<article>` for the export pipeline.
 * The preview renders the same `html` string; the export clone is rebuilt from
 * it so no preview-only wrapper or zoom can leak into page measurement.
 */
export function createExportArticle(html: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html;
  const article = template.content.firstElementChild;
  if (!(article instanceof HTMLElement) || !article.classList.contains("pdf-doc")) {
    throw new Error("导出文档结构无效：缺少 .pdf-doc");
  }
  return article;
}
