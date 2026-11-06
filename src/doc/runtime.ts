/**
 * Loads the frozen browser assets from the Vite plugin's single source.
 *
 * URLs always go through `import.meta.env.BASE_URL`, so the same code works at
 * `http://localhost:5173/moye/` in dev and at
 * `https://zzl221000.github.io/moye/` in production.
 */
const BASE_URL = import.meta.env.BASE_URL;

const RENDER_SCRIPTS = [
  "vendor/marked.min.js",
  "vendor/purify.min.js",
  "themes.js",
] as const;

const EXPORT_SCRIPTS = [
  "vendor/dompdf.min.js",
  "prepare.js",
  "export-doc.js",
] as const;

const DOCUMENT_STYLES = ["styles/doc.css", "styles/export-host.css"] as const;

export function frozenUrl(relativePath: string): string {
  return `${BASE_URL}${relativePath.replace(/^\/+/, "")}`;
}

function injectScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    script.dataset.moyeFrozen = url;
    script.addEventListener(
      "load",
      () => {
        script.dataset.moyeLoaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`脚本加载失败：${url}`)),
      { once: true },
    );
    document.head.append(script);
  });
}

function injectStyle(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.moyeFrozen = url;
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener(
      "error",
      () => reject(new Error(`样式加载失败：${url}`)),
      { once: true },
    );
    document.head.append(link);
  });
}

const scriptLoads = new Map<string, Promise<void>>();
const styleLoads = new Map<string, Promise<void>>();

function loadScript(relativePath: string): Promise<void> {
  const url = frozenUrl(relativePath);
  let pending = scriptLoads.get(url);
  if (!pending) {
    pending = injectScript(url).catch((error: unknown) => {
      scriptLoads.delete(url);
      throw error;
    });
    scriptLoads.set(url, pending);
  }
  return pending;
}

function loadStyle(relativePath: string): Promise<void> {
  const url = frozenUrl(relativePath);
  let pending = styleLoads.get(url);
  if (!pending) {
    pending = injectStyle(url).catch((error: unknown) => {
      styleLoads.delete(url);
      throw error;
    });
    styleLoads.set(url, pending);
  }
  return pending;
}

async function loadScripts(scripts: readonly string[]): Promise<void> {
  for (const script of scripts) {
    await loadScript(script);
  }
}

let renderRuntime: Promise<void> | null = null;
let exportRuntime: Promise<void> | null = null;
let documentStyles: Promise<void> | null = null;

/** Marked, DOMPurify and the theme table, enough to render the preview. */
export function ensureRenderRuntime(): Promise<void> {
  renderRuntime ??= loadScripts(RENDER_SCRIPTS).catch((error: unknown) => {
    renderRuntime = null;
    throw error;
  });
  return renderRuntime;
}

/** dompdf plus the frozen export transforms, loaded on the first export. */
export function ensureExportRuntime(): Promise<void> {
  exportRuntime ??= loadScripts(EXPORT_SCRIPTS).catch((error: unknown) => {
    exportRuntime = null;
    throw error;
  });
  return exportRuntime;
}

/** Document stylesheet and the embedded face shared with the CLI page. */
export function ensureDocumentStyles(): Promise<void> {
  documentStyles ??= (async () => {
    await Promise.all(DOCUMENT_STYLES.map((style) => loadStyle(style)));

    if (typeof document.fonts?.load !== "function") return;
    const faces = await document.fonts.load('15px "SourceHanSansSC-Regular"');
    if (faces.length === 0) {
      throw new Error("字体加载失败：SourceHanSansSC-Regular.ttf");
    }
    await document.fonts.ready;
  })().catch((error: unknown) => {
    documentStyles = null;
    throw error;
  });
  return documentStyles;
}

let fontBytes: Promise<Uint8Array> | null = null;

/** The exact TTF the preview uses, handed to dompdf for embedding. */
export function loadFontBytes(): Promise<Uint8Array> {
  fontBytes ??= fetch(frozenUrl("fonts/SourceHanSansSC-Regular.ttf"))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`字体加载失败：HTTP ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      fontBytes = null;
      throw error;
    });
  return fontBytes;
}
