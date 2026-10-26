#!/usr/bin/env node
/**
 * md-pdf export — Markdown → vector PDF through dompdf.js in headless Chrome.
 *
 *   node export.mjs note.md
 *   node export.mjs note.md --paper a4 --margin 36 --h1-break --open
 *
 * Zero npm dependencies: reuses the page in this folder and drives Chrome over
 * the DevTools protocol with Node's built-in WebSocket.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const marked = require("./vendor/marked.min.js");
const THEMES = require("./themes.js");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/* ------------------------------------------------------------------ args */

const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  console.log(`墨页 CLI — Markdown → PDF（dompdf.js）

用法
  node export.mjs <input.md> [options]

选项
  -o, --out <file>      输出路径（默认与输入同名的 .pdf）
      --paper <name>    a4 | a4-landscape | letter（默认 a4）
      --margin <pt>     页边距，单位 pt（默认 36 ≈ 12.7mm）
      --title <text>    页眉标题（默认取第一个一级标题）
      --theme <name>    文档主题：paper | editorial | compact | dark
      --css <file>      追加自定义 CSS 文件（作用于 .pdf-doc）
      --background <c>  页面背景色（默认取主题）
      --no-footer       不输出页脚页码
      --no-cover        首页也显示页眉页脚
      --h1-break        每个一级标题另起一页
      --no-compress     不压缩 PDF 流
      --open            生成后用默认阅读器打开

示例
  node export.mjs ../../报告.md --h1-break --open`);
  process.exit(0);
}

function getFlag(name) {
  return argv.includes("--" + name);
}

function getValue(name, fallback) {
  const prefix = "--" + name;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === prefix) return argv[i + 1];
    if (argv[i].startsWith(prefix + "=")) return argv[i].slice(prefix.length + 1);
  }
  const short = { out: "-o" }[name];
  if (short) {
    const index = argv.indexOf(short);
    if (index >= 0) return argv[index + 1];
  }
  return fallback;
}

const inputArg = argv.find((arg, index) => {
  if (arg.startsWith("-")) return false;
  const previous = argv[index - 1];
  if (
    previous === "-o" ||
    previous === "--out" ||
    previous === "--paper" ||
    previous === "--margin" ||
    previous === "--title" ||
    previous === "--theme" ||
    previous === "--css" ||
    previous === "--background"
  ) {
    return false;
  }
  return true;
});

if (!inputArg) {
  console.error("缺少输入文件。运行 node export.mjs --help 查看用法。");
  process.exit(1);
}

const inputPath = path.resolve(process.cwd(), inputArg);
if (!fs.existsSync(inputPath)) {
  console.error(`找不到文件：${inputPath}`);
  process.exit(1);
}

const markdown = stripFrontMatter(fs.readFileSync(inputPath, "utf8"));
const mdDir = path.dirname(inputPath);
const base = path.basename(inputPath).replace(/\.(md|markdown|txt)$/i, "");
const outputPath = path.resolve(getValue("out", path.join(mdDir, base + ".pdf")));
const paperName = getValue("paper", "a4");
const marginPt = Number(getValue("margin", "36"));
const explicitTitle = getValue("title", "");
const title = explicitTitle || firstHeading(markdown) || base;
const themeName = getValue("theme", "paper");
const theme = THEMES[themeName];

if (!theme) {
  console.error(
    `未知主题：${themeName}。可选：${Object.keys(THEMES).join(" / ")}`
  );
  process.exit(1);
}

const cssPath = getValue("css", "");
let customCss = "";
if (cssPath) {
  const resolvedCss = path.resolve(process.cwd(), cssPath);
  if (!fs.existsSync(resolvedCss)) {
    console.error(`找不到 CSS 文件：${resolvedCss}`);
    process.exit(1);
  }
  customCss = fs.readFileSync(resolvedCss, "utf8");
}

const background = getValue("background", theme.background || "#ffffff");
const pageNumbers = !getFlag("no-footer");
const cover = !getFlag("no-cover");
const h1Break = getFlag("h1-break");
const compress = !getFlag("no-compress");

/* --------------------------------------------------------------- helpers */

function stripFrontMatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function firstHeading(text) {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1].replace(/[*_`~]/g, "").trim() : "";
}

function pageHtml(html, theme, customCss, background) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<base href="/local/">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/styles/doc.css">
<style id="docTheme">${theme.css}
${customCss}</style>
<style>
  @font-face {
    font-family: "SourceHanSansSC-Regular";
    src: url("/fonts/SourceHanSansSC-Regular.ttf") format("truetype");
    font-weight: 400;
    font-style: normal;
  }
  html, body { margin: 0; padding: 0; background: ${background}; }
  #doc { padding: 0; }
</style>
</head>
<body>
<article id="doc" class="pdf-doc">${html}</article>
<script src="/vendor/dompdf.min.js"></script>
<script src="/prepare.js"></script>
<script src="/export-doc.js"></script>
<script>
window.__exportPdf = async function (options) {
  const doc = document.getElementById("doc");
  await document.fonts.load('15px "SourceHanSansSC-Regular"');
  await document.fonts.ready;

  const response = await fetch("/fonts/SourceHanSansSC-Regular.ttf");
  if (!response.ok) throw new Error("字体加载失败：HTTP " + response.status);
  const fontBytes = new Uint8Array(await response.arrayBuffer());

  let pages = 0;
  const blob = await DocExport.exportElement(
    doc,
    Object.assign({}, options, {
      fontBytes: fontBytes,
      onProgress: function (progress) {
        if (progress && progress.stage === "done") pages = progress.totalPages || pages;
      },
    })
  );

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), pages: pages, size: bytes.length };
};
window.__moyeReady = true;
</script>
</body>
</html>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
  });
}

function markedHtml(markdownText) {
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(markdownText);
}

function countPages(buffer) {
  const text = buffer.toString("latin1");
  const pageObjects = text.match(/\/Type\s*\/Page(?![s])/g);
  if (pageObjects) return pageObjects.length;
  const countMatch = text.match(/\/Count\s+(\d+)/);
  return countMatch ? Number(countMatch[1]) : 0;
}

/* ---------------------------------------------------------------- server */

function startServer() {
  const html = pageHtml(markedHtml(markdown), theme, customCss, background);

  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      response.writeHead(400).end("bad request");
      return;
    }

    if (pathname === "/page.html") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(html);
      return;
    }

    let root = __dirname;
    if (pathname.startsWith("/local/")) {
      root = mdDir;
      pathname = "/" + pathname.slice("/local/".length);
    }

    const filePath = path.resolve(root, "." + pathname);
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      response.writeHead(403).end("forbidden");
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "content-length": stats.size,
        "cache-control": "no-store",
      });
      fs.createReadStream(filePath).pipe(response);
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/* ------------------------------------------------------------------ chrome */

function findChrome() {
  const fromEnv = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const windows = [
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
    process.env.LOCALAPPDATA,
  ];

  const candidates =
    process.platform === "win32"
      ? windows.flatMap((dir) =>
          dir
            ? [
                path.join(dir, "Google", "Chrome", "Application", "chrome.exe"),
                path.join(dir, "Microsoft", "Edge", "Application", "msedge.exe"),
              ]
            : []
        )
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
          ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await condition();
    if (value) return value;
    await sleep(120);
  }
  throw new Error("等待超时：" + label);
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
        message = JSON.parse(event.data);
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
      const handlers = this.listeners.get(message.method);
      if (handlers) handlers.forEach((handler) => handler(message.params, message.sessionId));
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
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
      /* ignore */
    }
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error("未找到 Chrome/Edge。设置环境变量 CHROME_PATH 指向浏览器可执行文件。");
  }

  const { server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/page.html`;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "moye-chrome-"));

  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
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
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  let chromeLog = "";
  child.stderr.on("data", (chunk) => {
    chromeLog += chunk.toString();
  });

  let cdp = null;

  try {
    const devtoolsPort = await waitFor(
      () => {
        const file = path.join(userDataDir, "DevToolsActivePort");
        if (!fs.existsSync(file)) return null;
        const [portLine] = fs.readFileSync(file, "utf8").split("\n");
        return Number(portLine) || null;
      },
      20000,
      "Chrome 启动"
    );

    const version = await waitFor(
      async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`);
          return response.ok ? response.json() : null;
        } catch {
          return null;
        }
      },
      15000,
      "DevTools 端口"
    );

    cdp = await Cdp.connect(version.webSocketDebuggerUrl);

    const { targetId } = await cdp.send("Target.createTarget", { url });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Runtime.enable", {}, sessionId);

    await waitFor(
      async () => {
        try {
          const { result } = await cdp.send(
            "Runtime.evaluate",
            { expression: "window.__moyeReady === true", returnByValue: true },
            sessionId
          );
          return result.value === true;
        } catch {
          return false;
        }
      },
      20000,
      "页面加载"
    );

    const exportOptions = {
      paper: paperName,
      marginPt,
      headerTitle: title,
      pageNumbers,
      cover,
      pageBreakOnH1: h1Break,
      compress,
      background,
      headerColor: theme.headerColor,
      footerColor: theme.footerColor,
      metadata: {
        title,
        creator: "墨页 CLI",
        producer: "dompdf.js",
        keywords: ["Markdown", "PDF"],
      },
    };

    const started = Date.now();
    const { result, exceptionDetails } = await cdp.send(
      "Runtime.evaluate",
      {
        expression: `window.__exportPdf(${JSON.stringify(exportOptions)})`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId
    );

    if (exceptionDetails) {
      const detail =
        (exceptionDetails.exception && exceptionDetails.exception.description) ||
        exceptionDetails.text ||
        "页面内导出失败";
      throw new Error(detail);
    }

    const payload = result.value;
    const bytes = Buffer.from(payload.base64, "base64");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, bytes);

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const pages = countPages(bytes) || payload.pages || "?";
    console.log(
      `✔ ${path.basename(outputPath)}  ${pages} 页  ${(
        bytes.length / 1024
      ).toFixed(0)} KB  ${seconds}s`
    );
    console.log(`  ${outputPath}`);
    console.log(`  主题 ${theme.label || themeName} · 背景 ${background}`);

    if (getFlag("open")) openFile(outputPath);
  } finally {
    if (cdp) {
      try {
        await cdp.send("Browser.close");
      } catch {
        /* ignore */
      }
      cdp.close();
    }
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* ignore */
    }
  }

  if (chromeLog && process.env.MOYE_DEBUG) {
    process.stderr.write(chromeLog);
  }
}

function openFile(target) {
  const opener =
    process.platform === "win32"
      ? spawn("cmd", ["/c", "start", "", target], { stdio: "ignore", detached: true })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [target], {
          stdio: "ignore",
          detached: true,
        });
  opener.unref();
}

main().catch((error) => {
  console.error("✖ " + error.message);
  if (process.env.MOYE_DEBUG) console.error(error);
  process.exit(1);
});
