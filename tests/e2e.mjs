#!/usr/bin/env node
/**
 * End-to-end export check for ticket 04.
 *
 * Serves `dist/` under the Pages base, opens the built app in headless Chrome,
 * clicks the export button, waits for the browser download, then compares the
 * PDF page count and pdftotext output with `tests/golden/mixed.json`.
 *
 *   bun run test:e2e        # builds first; exact text comparison
 *   node tests/e2e.mjs      # same, assuming dist/ is current
 *   node tests/e2e.mjs --ci # page count + key text (stable across pdftotext builds)
 *
 * Zero npm dependencies: Node built-ins plus `pdftotext` (and `pdfinfo` when
 * installed), driving Chrome over the DevTools protocol with Node's built-in
 * WebSocket — the same technique as the frozen `export.mjs`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");
const fixtureAssetsDir = path.join(__dirname, "fixtures", "assets");
const goldenPath = path.join(__dirname, "golden", "mixed.json");
const PAGES_BASE = "/moye/";

const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const ci = argv.includes("--ci");
const pagination = argv.includes("--pagination");
const unknownFlags = argv.filter(
  (argument) =>
    argument.startsWith("-") &&
    argument !== "--keep" &&
    argument !== "--ci" &&
    argument !== "--pagination",
);

/**
 * CI only asserts the exported page count and key text. pdftotext builds differ
 * in line wrapping; the local (default) mode still performs the exact
 * page-by-page comparison with the same rules as `tests/compare.mjs`.
 */
const CI_KEY_TEXT = [
  "混合结构基线",
  "标题层级",
  "无序列表",
  "有序列表",
  "引用",
  "表格",
  "代码块",
  "任务列表",
  "长 token",
  "pkg_config_dependency_resolution_without_any_break_opportunity_0123456789abcdef",
  "图片",
  "结尾",
  "第2页/共3页",
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
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

class EnvironmentError extends Error {}

function requireEnvironment() {
  if (unknownFlags.length > 0) {
    throw new EnvironmentError(`未知参数：${unknownFlags.join(" ")}（可用：--keep、--ci、--pagination）`);
  }
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new EnvironmentError("dist/index.html 不存在；先运行 bun run build。");
  }
  if (fs.existsSync(path.join(distDir, "assets", "block.png"))) {
    throw new EnvironmentError("生产构建包含 fixture 图片 assets/block.png。");
  }
  if (!fs.existsSync(goldenPath)) {
    throw new EnvironmentError(`缺少黄金值：${path.relative(repoRoot, goldenPath)}`);
  }

  const pdftotext = findExecutable("pdftotext");
  if (!pdftotext) {
    throw new EnvironmentError(
      "找不到 pdftotext。请安装 poppler-utils 或 xpdf，或用 PDFTOTEXT_PATH 指定可执行文件。",
    );
  }

  const chrome = findChrome();
  if (!chrome) {
    throw new EnvironmentError(
      "未找到 Chrome。设置 CHROME_PATH，或安装到 C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe。",
    );
  }

  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  if (typeof golden.pageCount !== "number" || !Array.isArray(golden.pages)) {
    throw new EnvironmentError("tests/golden/mixed.json 格式无效。");
  }

  const mixedPath = path.join(__dirname, "fixtures", "mixed.md");
  const mixedMarkdown = fs.readFileSync(mixedPath, "utf8");
  if (mixedMarkdown.trim() === "") {
    throw new EnvironmentError(`fixture 为空：${path.relative(repoRoot, mixedPath)}`);
  }
  if (!fs.existsSync(path.join(fixtureAssetsDir, "block.png"))) {
    throw new EnvironmentError(
      `缺少 fixture 图片：${path.relative(repoRoot, path.join(fixtureAssetsDir, "block.png"))}`,
    );
  }

  return {
    pdftotext,
    pdfinfo: findExecutable("pdfinfo"),
    chrome,
    golden,
    mixedMarkdown,
  };
}

function findExecutable(name) {
  const fromEnv = process.env[name.toUpperCase() + "_PATH"];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const locator = process.platform === "win32" ? "where" : "which";
  try {
    const output = execFileSync(locator, [name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const first = output.split(/\r?\n/).find((line) => line.trim());
    return first ? first.trim() : null;
  } catch {
    return null;
  }
}

function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
            : "",
          process.env.PROGRAMFILES
            ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe")
            : "",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
          ];

  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate)) ?? null;
}

/* ------------------------------------------------------------------ server */

function startServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
      response.writeHead(400).end("bad request");
      return;
    }

    if (pathname === "/" || pathname === "/moye") {
      response.writeHead(302, { location: PAGES_BASE }).end();
      return;
    }
    if (!pathname.startsWith(PAGES_BASE)) {
      response.writeHead(404).end("not found");
      return;
    }

    let relative = pathname.slice(PAGES_BASE.length);
    if (relative === "" || relative.endsWith("/")) relative += "index.html";

    // Fixture images are test inputs, not part of the production build. The
    // harness serves them here so the preview can resolve `assets/block.png`
    // without leaking fixtures into `dist/`. Vite's own bundle also lives under
    // `/assets/`, so only an existing fixture file takes the detour.
    let target = null;
    if (relative.startsWith("assets/")) {
      const fixtureTarget = path.resolve(
        fixtureAssetsDir,
        relative.slice("assets/".length),
      );
      if (
        fixtureTarget.startsWith(fixtureAssetsDir + path.sep) &&
        fs.existsSync(fixtureTarget) &&
        fs.statSync(fixtureTarget).isFile()
      ) {
        target = fixtureTarget;
      }
    }
    if (!target) {
      target = path.resolve(distDir, relative);
      if (target !== distDir && !target.startsWith(distDir + path.sep)) {
        response.writeHead(403).end("forbidden");
        return;
      }
    }

    try {
      if (fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
      if (!fs.statSync(target).isFile()) throw new Error("not a file");
    } catch {
      response.writeHead(404).end("not found");
      return;
    }

    response.writeHead(200, {
      "content-type": TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
      "content-length": String(fs.statSync(target).size),
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(target).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("无法获取本地服务端口"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}${PAGES_BASE}` });
    });
  });
}

/* ------------------------------------------------------------------ chrome */

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(condition, timeout, label, detail) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await condition();
    if (value) return value;
    await sleep(150);
  }
  const suffix = detail ? `\n${await detail()}` : "";
  throw new Error(`等待超时：${label}${suffix}`);
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
        return;
      }
      if (message.method) {
        for (const handler of this.listeners.get(message.method) ?? []) {
          handler(message.params, message.sessionId);
        }
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("DevTools WebSocket 连接失败")), {
        once: true,
      });
    });
    return new Cdp(socket);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.socket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // ignore
    }
  }
}

async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
  const response = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise, returnByValue: true },
    sessionId,
  );
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text ??
        "页面脚本执行失败",
    );
  }
  if (!response.result) throw new Error("页面脚本没有返回值");
  return response.result.value;
}

async function launchChrome(executable, userDataDir) {
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      "--hide-scrollbars",
      "--window-size=1400,1000",
      "--user-data-dir=" + userDataDir,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  let log = "";
  child.stderr.on("data", (chunk) => {
    log += chunk.toString();
  });

  const devtoolsPort = await waitFor(
    () => {
      const file = path.join(userDataDir, "DevToolsActivePort");
      if (!fs.existsSync(file)) return null;
      try {
        const [portLine] = fs.readFileSync(file, "utf8").split("\n");
        return Number(portLine) || null;
      } catch {
        return null;
      }
    },
    20_000,
    "Chrome 启动",
    () => log.slice(-2000),
  );

  const version = await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`);
        return response.ok ? await response.json() : null;
      } catch {
        return null;
      }
    },
    15_000,
    "DevTools 端口",
  );

  return { child, version };
}

/* ------------------------------------------------------------------- pdf */

function countPages(pdfPath, pdfinfo, textPages) {
  if (pdfinfo) {
    try {
      const output = execFileSync(pdfinfo, [pdfPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const match = output.match(/^Pages:\s+(\d+)\s*$/m);
      if (match) return { count: Number(match[1]), source: "pdfinfo" };
    } catch {
      // fall through
    }
  }

  const bytes = fs.readFileSync(pdfPath).toString("latin1");
  const pageObjects = bytes.match(/\/Type\s*\/Page(?![s])/g);
  if (pageObjects && pageObjects.length > 0) {
    return { count: pageObjects.length, source: "pdf /Type /Page objects" };
  }

  const countMatch = bytes.match(/\/Count\s+(\d+)/);
  if (countMatch) {
    return { count: Number(countMatch[1]), source: "pdf page tree /Count" };
  }

  return { count: textPages.length, source: "pdftotext form feeds" };
}

function parsePages(raw) {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const parts = normalized.split("\f");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();

  return parts.map((page) =>
    page
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, ""),
  );
}

function sameArray(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function withoutWhitespace(pages) {
  return pages.map((page) => page.replace(/\s+/g, ""));
}

function reportPageDifference(expected, actual, page) {
  const expectedLines = expected === "" ? ["(blank)"] : expected.split("\n");
  const actualLines = actual === "" ? ["(blank)"] : actual.split("\n");
  const count = Math.max(expectedLines.length, actualLines.length);

  for (let index = 0; index < count; index += 1) {
    const before = expectedLines[index];
    const after = actualLines[index];
    if (before === after) continue;
    return [
      `  p${page} | 黄金值：${before ?? "(缺失)"}`,
      `  p${page} | 实际：  ${after ?? "(缺失)"}`,
    ].join("\n");
  }

  return `  p${page} | 页数不同`;
}

/* ------------------------------------------------------- pagination suite */

const PAGINATION_CASES = [
  {
    fixture: "simple",
    label: "simple",
    cover: true,
    footer: true,
    header: "会议纪要",
  },
  {
    fixture: "mixed",
    label: "mixed",
    cover: true,
    footer: true,
    header: "混合结构基线",
  },
  {
    fixture: "long",
    label: "long",
    cover: true,
    footer: true,
    header: "长文档基线",
  },
  {
    fixture: "multi-h1",
    label: "multi-h1",
    cover: true,
    footer: true,
    header: "第一章 起点",
  },
  {
    fixture: "multi-h1",
    label: "multi-h1-break",
    cover: false,
    footer: true,
    header: "第一章 起点",
    options: {
      paper: "a4",
      margin: "36",
      title: "",
      footer: true,
      cover: false,
      h1Break: true,
      theme: "paper",
      background: "#ffffff",
      css: "",
    },
  },
  {
    fixture: "mixed",
    label: "mixed-landscape",
    cover: true,
    footer: true,
    header: "自定义页眉",
    options: {
      paper: "a4-landscape",
      margin: "0",
      title: "自定义页眉",
      footer: true,
      cover: true,
      h1Break: false,
      theme: "paper",
      background: "#ffffff",
      css: "",
    },
  },
  {
    fixture: "mixed",
    label: "mixed-letter",
    cover: false,
    footer: true,
    header: "混合结构基线",
    options: {
      paper: "letter",
      margin: "18",
      title: "",
      footer: true,
      cover: false,
      h1Break: false,
      theme: "paper",
      background: "#ffffff",
      css: "",
    },
  },
  {
    fixture: "mixed",
    label: "mixed-nofooter",
    cover: false,
    footer: false,
    header: "混合结构基线",
    options: {
      paper: "a4",
      margin: "36",
      title: "",
      footer: false,
      cover: false,
      h1Break: false,
      theme: "paper",
      background: "#ffffff",
      css: "",
    },
  },
];

const PAGE_STATE_EXPRESSION = `(() => {
  const pane = document.getElementById("preview-pane");
  const cards = [...document.querySelectorAll("[data-preview-page]")];
  return {
    state: pane?.getAttribute("data-pagination-state") ?? "",
    count: Number(pane?.getAttribute("data-page-count") ?? 0),
    cards: cards.length,
    ms: Number(pane?.getAttribute("data-pagination-ms") ?? 0),
    name: document.querySelector(".doc-name")?.value ?? "",
    status: document.querySelector(".statusbar")?.textContent ?? "",
    bands: cards.map((card, index) => ({
      page: index + 1,
      count: card.querySelectorAll("[data-preview-band]").length,
      header:
        card.querySelector('[data-preview-band="header"]')?.textContent?.trim() ?? "",
      footer:
        card.querySelector('[data-preview-band="footer"]')?.textContent?.trim() ?? "",
    })),
  };
})()`;

async function waitForExactPreview(cdp, sessionId, name, label) {
  return waitFor(
    async () => {
      try {
        const state = await evaluate(cdp, sessionId, PAGE_STATE_EXPRESSION);
        return state.state === "exact" &&
          state.count > 0 &&
          state.cards === state.count &&
          state.name === `${name}.md`
          ? state
          : null;
      } catch {
        return null;
      }
    },
    60_000,
    `${label} 分页预览`,
  );
}

/**
 * Compares the preview's measured page count with a real PDF export for every
 * fixture, plus paper/margin/header/footer/cover/H1-break variants. Each case
 * runs in a fresh browser context so the previous draft cannot leak in.
 */
async function runPaginationSuite({ cdp, url, pdfinfo, pdftotext }) {
  const results = [];
  let maxMs = 0;

  for (const testCase of PAGINATION_CASES) {
    const fixturePath = path.join(__dirname, "fixtures", `${testCase.fixture}.md`);
    const markdown = fs.readFileSync(fixturePath, "utf8");
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "moye-pages-"));
    const { browserContextId } = await cdp.send("Target.createBrowserContext");
    const pageErrors = [];
    let targetId = null;

    try {
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        browserContextId,
        downloadPath: downloadDir,
        eventsEnabled: false,
      });

      const created = await cdp.send("Target.createTarget", {
        url,
        browserContextId,
      });
      targetId = created.targetId;
      const attached = await cdp.send("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const sessionId = attached.sessionId;
      await cdp.send("Runtime.enable", {}, sessionId);
      cdp.on("Runtime.exceptionThrown", (params, eventSession) => {
        if (eventSession !== sessionId) return;
        pageErrors.push(
          params.exceptionDetails?.exception?.description ??
            params.exceptionDetails?.text ??
            "页面异常",
        );
      });
      cdp.on("Runtime.consoleAPICalled", (params, eventSession) => {
        if (eventSession !== sessionId || params.type !== "error") return;
        pageErrors.push(
          (params.args ?? [])
            .map((argument) => String(argument.value ?? argument.description ?? ""))
            .join(" "),
        );
      });

      await waitFor(
        async () =>
          evaluate(
            cdp,
            sessionId,
            `Boolean(document.querySelector(".app-shell"))`,
          ),
        30_000,
        `${testCase.label} 应用加载`,
      );

      const draft = JSON.stringify({
        name: `${testCase.label}.md`,
        content: markdown,
        at: Date.now(),
      });
      await evaluate(
        cdp,
        sessionId,
        `localStorage.setItem("moye.draft.v1", ${JSON.stringify(draft)})`,
      );
      if (testCase.options) {
        await evaluate(
          cdp,
          sessionId,
          `localStorage.setItem("moye.options.v1", ${JSON.stringify(
            JSON.stringify(testCase.options),
          )})`,
        );
      }

      await cdp.send("Page.enable", {}, sessionId);
      await cdp.send("Page.reload", { ignoreCache: true }, sessionId);

      const preview = await waitForExactPreview(
        cdp,
        sessionId,
        testCase.label,
        testCase.label,
      );

      if (preview.status.includes("≈")) {
        throw new Error(
          `${testCase.label} 状态栏仍是估算页数：${preview.status}`,
        );
      }
      if (!preview.status.includes(`${preview.count} 页`)) {
        throw new Error(
          `${testCase.label} 状态栏没有显示精确页数：${preview.status}`,
        );
      }

      const bandPages = testCase.footer ? 2 : 1;
      for (const band of preview.bands) {
        const expected = band.page === 1 && testCase.cover ? 0 : bandPages;
        if (band.count !== expected) {
          throw new Error(
            `${testCase.label} 第 ${band.page} 页页眉页脚数量：期望 ${expected}，实际 ${band.count}`,
          );
        }
        if (band.page === 1 && testCase.cover) continue;
        if (band.header !== testCase.header) {
          throw new Error(
            `${testCase.label} 第 ${band.page} 页页眉：期望 ${testCase.header}，实际 ${band.header}`,
          );
        }
        if (testCase.footer && band.footer !== `第 ${band.page} 页`) {
          throw new Error(
            `${testCase.label} 第 ${band.page} 页页脚：期望 第 ${band.page} 页，实际 ${band.footer}`,
          );
        }
      }

      await waitFor(
        async () =>
          evaluate(
            cdp,
            sessionId,
            `(() => {
              const button = document.querySelector('[data-action="export"]');
              return Boolean(button && !button.disabled);
            })()`,
          ),
        15_000,
        `${testCase.label} 导出按钮可用`,
      );
      await evaluate(
        cdp,
        sessionId,
        `document.querySelector('[data-action="export"]').click()`,
      );

      const pdfPath = await waitFor(
        () => {
          if (pageErrors.length > 0) {
            throw new Error(`${testCase.label} 导出报错：\n${pageErrors.join("\n")}`);
          }
          const files = fs
            .readdirSync(downloadDir)
            .filter((file) => file.toLowerCase().endsWith(".pdf"));
          if (files.length === 0) return null;
          const candidate = path.join(downloadDir, files[0]);
          const firstSize = fs.statSync(candidate).size;
          if (firstSize <= 0) return null;
          return sleep(200).then(() =>
            fs.statSync(candidate).size === firstSize ? candidate : null,
          );
        },
        120_000,
        `${testCase.label} PDF`,
      );

      const textPath = path.join(downloadDir, "export.txt");
      execFileSync(pdftotext, ["-enc", "UTF-8", pdfPath, textPath], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      const textPages = parsePages(fs.readFileSync(textPath, "utf8"));
      const pdfCount = countPages(pdfPath, pdfinfo, textPages);

      if (preview.count !== pdfCount.count) {
        throw new Error(
          `${testCase.label} 页数不一致：预览 ${preview.count} 页，导出 ${pdfCount.count} 页（${pdfCount.source}）`,
        );
      }

      const elapsed = Math.round(preview.ms);
      maxMs = Math.max(maxMs, elapsed);
      results.push({
        label: testCase.label,
        pages: preview.count,
        ms: elapsed,
      });
      console.log(
        `✔ ${testCase.label.padEnd(18)} 预览 ${preview.count} 页 = PDF ${pdfCount.count} 页  快照 ${elapsed} ms`,
      );
    } finally {
      if (targetId) {
        try {
          await cdp.send("Target.closeTarget", { targetId });
        } catch {
          /* already closed */
        }
      }
      try {
        await cdp.send("Target.disposeBrowserContext", { browserContextId });
      } catch {
        /* already disposed */
      }
      try {
        fs.rmSync(downloadDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* Chrome may still hold a file on Windows */
      }
    }
  }

  console.log(
    `✔ 分页预览：${results.length} 个用例，预览页数均等于导出 PDF；最长快照 ${maxMs} ms`,
  );
}

/* ------------------------------------------------------------------- main */

async function main() {
  const { pdftotext, pdfinfo, chrome, golden, mixedMarkdown } =
    requireEnvironment();
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "moye-e2e-"));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "moye-e2e-chrome-"));
  const pageErrors = [];

  const { server, url } = await startServer();
  let child = null;
  let cdp = null;

  try {
    const launched = await launchChrome(chrome, userDataDir);
    child = launched.child;

    cdp = await Cdp.connect(launched.version.webSocketDebuggerUrl);
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
      eventsEnabled: false,
    });

    if (pagination) {
      await runPaginationSuite({ cdp, url, pdfinfo, pdftotext });
      return;
    }

    const { targetId } = await cdp.send("Target.createTarget", { url });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    await cdp.send("Runtime.enable", {}, sessionId);
    cdp.on("Runtime.consoleAPICalled", (params, eventSession) => {
      if (eventSession !== sessionId || params.type !== "error") return;
      pageErrors.push(
        (params.args ?? [])
          .map((argument) => String(argument.value ?? argument.description ?? ""))
          .join(" "),
      );
    });
    cdp.on("Runtime.exceptionThrown", (params, eventSession) => {
      if (eventSession !== sessionId) return;
      pageErrors.push(
        params.exceptionDetails?.exception?.description ??
          params.exceptionDetails?.text ??
          "页面异常",
      );
    });

    await waitFor(
      async () => {
        const ready = await evaluate(
          cdp,
          sessionId,
          `Boolean(document.readyState === "complete" && document.querySelector(".app-shell"))`,
        );
        return ready;
      },
      30_000,
      "应用加载",
      async () => {
        if (pageErrors.length) return `页面错误：\n${pageErrors.join("\n")}`;
        try {
          return await evaluate(
            cdp,
            sessionId,
            `JSON.stringify({
              ready: document.readyState,
              shell: Boolean(document.querySelector(".app-shell")),
              text: document.body.textContent?.slice(0, 240) ?? "",
              root: document.getElementById("root")?.innerHTML.slice(0, 240) ?? "",
              scripts: [...document.scripts].map((script) => script.src),
            })`,
          );
        } catch (error) {
          return `无法读取页面状态：${String(error)}`;
        }
      },
    );

    // The preview follows the current document, so the export check first has
    // to open the mixed fixture. A draft is the public restore path; it needs
    // no development-only hook in the built app.
    const draft = JSON.stringify({
      name: "混合结构基线.md",
      content: mixedMarkdown,
      at: Date.now(),
    });
    await evaluate(
      cdp,
      sessionId,
      `localStorage.setItem("moye.draft.v1", ${JSON.stringify(draft)})`,
    );
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Page.reload", { ignoreCache: true }, sessionId);

    await waitFor(
      async () => {
        try {
          const ready = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const button = document.querySelector('[data-action="export"]');
              const doc = document.querySelector('.preview-paper .pdf-doc');
              const images = Array.from(document.querySelectorAll("img[src]"));
              return Boolean(
                document.readyState === "complete" &&
                button &&
                !button.disabled &&
                doc &&
                doc.textContent?.includes("混合结构基线") &&
                document.fonts.status === "loaded" &&
                images.every((image) => image.complete && image.naturalWidth > 0)
              );
            })()`,
          );
          return ready;
        } catch {
          return null;
        }
      },
      30_000,
      "混合 fixture 载入预览",
      async () => {
        if (pageErrors.length) return `页面错误：\n${pageErrors.join("\n")}`;
        try {
          const state = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const button = document.querySelector('[data-action="export"]');
              const doc = document.querySelector(".preview-paper .pdf-doc");
              const images = Array.from(document.querySelectorAll("img[src]"));
              return {
                ready: document.readyState,
                button: Boolean(button),
                disabled: button?.disabled,
                docText: (doc?.textContent ?? "").slice(0, 80),
                fonts: document.fonts.status,
                badImages: images
                  .filter((image) => !image.complete || image.naturalWidth === 0)
                  .slice(0, 3)
                  .map((image) => image.getAttribute("src")),
              };
            })()`,
          );
          return JSON.stringify(state);
        } catch (error) {
          return `无法读取页面状态：${String(error)}`;
        }
      },
    );

    await evaluate(
      cdp,
      sessionId,
      `document.querySelector('[data-action="export"]').click()`,
    );

    const pdfPath = await waitFor(
      () => {
        if (pageErrors.length > 0) {
          throw new Error(`导出时页面报错：\n${pageErrors.join("\n")}`);
        }
        const files = fs
          .readdirSync(downloadDir)
          .filter((name) => name.toLowerCase().endsWith(".pdf"));
        if (files.length === 0) return null;

        const candidate = path.join(downloadDir, files[0]);
        const firstSize = fs.statSync(candidate).size;
        if (firstSize <= 0) return null;

        return sleep(200).then(() => {
          const secondSize = fs.statSync(candidate).size;
          return secondSize === firstSize ? candidate : null;
        });
      },
      120_000,
      "浏览器下载 PDF",
      () => (pageErrors.length ? `页面错误：\n${pageErrors.join("\n")}` : ""),
    );

    const textPath = path.join(downloadDir, "mixed.txt");
    execFileSync(pdftotext, ["-enc", "UTF-8", pdfPath, textPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const actualPages = parsePages(fs.readFileSync(textPath, "utf8"));
    const actualCount = countPages(pdfPath, pdfinfo, actualPages);

    if (ci) {
      const normalized = actualPages.join("\n").replace(/\s+/g, "");
      const missing = CI_KEY_TEXT.filter(
        (text) => !normalized.includes(text.replace(/\s+/g, "")),
      );
      const problems = [];

      if (actualPages.length !== actualCount.count) {
        problems.push(
          `页数不一致：PDF 显示 ${actualCount.count} 页（${actualCount.source}），pdftotext 提取到 ${actualPages.length} 页`,
        );
      }
      if (golden.pageCount !== actualCount.count) {
        problems.push(
          `页数：黄金值 ${golden.pageCount}，实际 ${actualCount.count}（${actualCount.source}）`,
        );
      }
      if (missing.length > 0) {
        problems.push(`缺少关键文本：${missing.join("、")}`);
      }

      if (problems.length > 0) {
        console.error("✖ mixed 导出未通过 CI 检查");
        for (const problem of problems) console.error(`  ${problem}`);
        throw new Error("E2E CI 检查失败");
      }

      console.log(
        `✔ mixed  ${actualCount.count} 页  关键文本 ${CI_KEY_TEXT.length}/${CI_KEY_TEXT.length}（${actualCount.source}）`,
      );
      console.log(`  ${path.basename(pdfPath)} 已通过页面与关键文本检查。`);
      return;
    }

    const problems = [];
    if (actualPages.length !== actualCount.count) {
      problems.push(
        `页数不一致：PDF 显示 ${actualCount.count} 页（${actualCount.source}），pdftotext 提取到 ${actualPages.length} 页`,
      );
    }
    if (golden.pageCount !== actualCount.count) {
      problems.push(
        `页数：黄金值 ${golden.pageCount}，实际 ${actualCount.count}（${actualCount.source}）`,
      );
    }
    if (golden.pages.length !== golden.pageCount) {
      problems.push(`黄金文件自身不一致：pageCount=${golden.pageCount}，pages=${golden.pages.length}`);
    }
    if (!sameArray(golden.pages, actualPages)) {
      if (sameArray(withoutWhitespace(golden.pages), withoutWhitespace(actualPages))) {
        problems.push("提取文本仅空白/换行不同（通常来自 pdftotext 版本差异）");
      } else {
        problems.push("提取文本不同");
      }
    }

    if (problems.length > 0) {
      console.error("✖ mixed 导出与黄金值不一致");
      for (const problem of problems) console.error(`  ${problem}`);

      const limit = Math.min(Math.max(golden.pages.length, actualPages.length), 5);
      for (let index = 0; index < limit; index += 1) {
        const expected = golden.pages[index] ?? "";
        const actual = actualPages[index] ?? "";
        if (expected === actual) continue;
        console.error(reportPageDifference(expected, actual, index + 1));
      }

      throw new Error("E2E 比对失败");
    }

    const sizeKb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
    console.log(
      `✔ mixed  ${actualCount.count} 页  ${sizeKb} KB  ${path.basename(pdfPath)}（${actualCount.source}）`,
    );
    console.log("  页数与 pdftotext 文本均与 tests/golden/mixed.json 一致。");
  } finally {
    if (cdp) {
      try {
        await cdp.send("Browser.close");
      } catch {
        // ignore
      }
      cdp.close();
    }
    if (child) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
    server.close();

    if (keep) {
      console.error(`\n保留的临时文件：\n  ${downloadDir}\n  ${userDataDir}`);
    } else {
      for (const directory of [downloadDir, userDataDir]) {
        try {
          fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
        } catch {
          // ignore
        }
      }
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✖ ${message}`);
  if (error instanceof EnvironmentError) process.exit(2);
  process.exit(1);
});
