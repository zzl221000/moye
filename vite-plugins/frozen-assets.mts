import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * The export chain is frozen: the browser app, the CLI and the golden PDF
 * baseline all have to read the same bytes. Instead of copying these files
 * into `public/` (two sources, silent drift), this plugin serves the repository
 * files in dev and emits them into `dist/` during the build.
 *
 * The whitelist is deliberately explicit: everything outside it is bundled or
 * served by Vite, and only these files must keep their exact bytes.
 */
const FROZEN_FILES = [
  "export-doc.js",
  "prepare.js",
  "themes.js",
  "export.mjs",
  "styles/doc.css",
  "styles/export-host.css",
  "vendor/dompdf.min.js",
  "vendor/marked.min.js",
  "vendor/purify.min.js",
] as const;

/**
 * `fonts/` is served whole because `export-doc.js` registers
 * `SourceHanSansSC-Regular.ttf` by name; the OFL notice travels with it.
 */
const FROZEN_DIRECTORIES = ["fonts"] as const;

/**
 * The mixed fixture writes `![…](assets/block.png)`. The dev server maps that
 * URL to the fixture directory so the preview can resolve the image exactly as
 * the CLI resolves it relative to the Markdown file. This lookup is dev-only:
 * fixtures are test inputs, never part of the production bundle. The e2e
 * harness serves the same directory from its own test server.
 */
const FIXTURE_ASSETS = {
  directory: path.join("tests", "fixtures", "assets"),
  urlPrefix: "/assets/",
} as const;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

type FrozenAsset = {
  /** URL path below the Pages base, e.g. `/vendor/dompdf.min.js`. */
  readonly urlPath: string;
  readonly filePath: string;
};

function collectFiles(root: string, directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) {
    throw new Error(`[moye] 缺少冻结目录：${directory}`);
  }
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join(directory.split(path.sep).join("/"), entry.name))
    .sort();
}

function collectAssets(root: string): FrozenAsset[] {
  const assets: FrozenAsset[] = [];
  const urls = new Set<string>();

  const add = (urlPath: string, relativePath: string): void => {
    if (urls.has(urlPath)) {
      throw new Error(`[moye] 冻结资源 URL 冲突：${urlPath}`);
    }
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`[moye] 缺少冻结文件：${relativePath}`);
    }
    urls.add(urlPath);
    assets.push({ urlPath, filePath });
  };

  for (const relativePath of FROZEN_FILES) {
    add("/" + relativePath.split(path.sep).join("/"), relativePath);
  }

  for (const directory of FROZEN_DIRECTORIES) {
    for (const relativePath of collectFiles(root, directory)) {
      add("/" + relativePath, relativePath);
    }
  }

  return assets;
}

/** Fixture images for the dev server only; never emitted by `generateBundle`. */
function collectFixtureAssets(root: string): FrozenAsset[] {
  return collectFiles(root, FIXTURE_ASSETS.directory).map((relativePath) => ({
    urlPath: FIXTURE_ASSETS.urlPrefix + path.posix.basename(relativePath),
    filePath: path.join(root, relativePath),
  }));
}

function contentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export default function frozenAssets(): Plugin {
  let assets: FrozenAsset[] = [];
  let lookup = new Map<string, string>();

  return {
    name: "moye:frozen-assets",

    configResolved(config) {
      assets = collectAssets(config.root);
      lookup = new Map(assets.map((asset) => [asset.urlPath, asset.filePath]));
      if (config.command === "serve") {
        for (const fixture of collectFixtureAssets(config.root)) {
          lookup.set(fixture.urlPath, fixture.filePath);
        }
      }
    },

    configureServer(server) {
      // Installed before Vite's transform middleware: these files must be sent
      // byte-for-byte, not rewritten as ESM modules.
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          next();
          return;
        }
        if (!request.url) {
          next();
          return;
        }

        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
        } catch {
          next();
          return;
        }

        const base = server.config.base;
        const relative =
          base !== "/" && pathname.startsWith(base)
            ? "/" + pathname.slice(base.length)
            : pathname;
        const filePath = lookup.get(relative) ?? lookup.get(pathname);
        if (!filePath) {
          next();
          return;
        }

        let size: number;
        try {
          size = fs.statSync(filePath).size;
        } catch {
          next();
          return;
        }

        response.writeHead(200, {
          "content-type": contentType(filePath),
          "content-length": String(size),
          "cache-control": "no-store",
        });
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        fs.createReadStream(filePath).pipe(response);
      });
    },

    generateBundle() {
      for (const asset of assets) {
        this.emitFile({
          type: "asset",
          fileName: asset.urlPath.replace(/^\//, ""),
          source: fs.readFileSync(asset.filePath),
        });
      }
    },
  };
}
