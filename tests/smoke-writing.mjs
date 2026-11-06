#!/usr/bin/env node
/**
 * Headless smoke test for the MSFE live writing surface.
 *
 * jsdom cannot lay out CodeMirror, so this script starts the Vite dev server,
 * drives headless Chrome over the DevTools protocol, loads the sample, replaces
 * it with a Markdown fixture, checks live-mode projections, types Chinese text
 * and asserts `getMarkdown()` round-trips.
 *
 *   node tests/smoke-writing.mjs
 *   CHROME_PATH=/path/to/chrome node tests/smoke-writing.mjs
 *
 * It is deliberately outside `bun run test` because it needs a browser.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const FIXTURE = [
  "# 中文标题",
  "",
  "段落包含 **加粗**、*斜体*、`行内代码` 与 [链接](https://example.com)。",
  "",
  "| 指标 | 本期 |",
  "| --- | ---: |",
  "| 营业收入 | 12,480 |",
  "",
  "```ts",
  "const answer = 42;",
  "```",
  "",
  "- [x] 已完成",
  "- [ ] 待办",
  "",
  "https://example.com/reports/2026/q2/quarterly-business-review-with-a-very-long-slug-that-wraps-inside-the-page",
].join("\n");

const TYPED = "中文 ABC 123";

const SETTINGS_FIXTURE = [
  "# 第一章 起点",
  "",
  "第一章的正文。",
  "",
  "# 第二章 转折",
  "",
  "第二章的正文。",
  "",
  "# 第三章 收束",
  "",
  "第三章的正文。",
].join("\n");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition, timeout, label) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      const value = await condition();
      if (value) return value;
      last = value;
    } catch (error) {
      last = error;
    }
    await sleep(120);
  }
  throw new Error(`等待超时：${label}${last ? `（${last}）` : ""}`);
}

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
            : [],
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

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => {
        reject(new Error("DevTools WebSocket 连接失败"));
      }, { once: true });
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

  close() {
    try {
      this.socket.close();
    } catch {
      /* socket already closed */
    }
  }
}

async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise, returnByValue: true },
    sessionId,
  );
  if (exceptionDetails) {
    throw new Error(
      exceptionDetails.exception?.description ??
        exceptionDetails.text ??
        "页面脚本执行失败",
    );
  }
  return result.value;
}

/** Modifiers follow the DevTools protocol: Alt 1, Ctrl 2, Meta 4, Shift 8. */
async function pressShortcut(cdp, sessionId, key, code, virtualKeyCode, modifiers) {
  const base = {
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers,
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sessionId);
}

async function pressEnter(cdp, sessionId) {
  const base = {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  };
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", text: "\r", unmodifiedText: "\r", ...base },
    sessionId,
  );
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sessionId);
}

async function pressEscape(cdp, sessionId) {
  const base = {
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...base }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sessionId);
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("未找到 Chrome/Edge。设置 CHROME_PATH 指向浏览器可执行文件。");
  }

  const server = await createServer({
    root,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite 开发服务器没有监听端口");
  }
  const url = `http://127.0.0.1:${address.port}/moye/`;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "moye-smoke-"));
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--mute-audio",
      "--hide-scrollbars",
      "--window-size=1400,1000",
      `--user-data-dir=${userDataDir}`,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  let chromeLog = "";
  child.stderr.on("data", (chunk) => {
    chromeLog += chunk.toString();
  });

  let cdp = null;
  let sessionId = null;
  let targetId = null;
  try {
    const devtoolsPort = await waitFor(
      () => {
        const file = path.join(userDataDir, "DevToolsActivePort");
        if (!fs.existsSync(file)) return null;
        const [portLine] = fs.readFileSync(file, "utf8").split("\n");
        return Number(portLine) || null;
      },
      20_000,
      "Chrome 启动",
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
      15_000,
      "DevTools 端口",
    );

    cdp = await Cdp.connect(version.webSocketDebuggerUrl);
    const created = await cdp.send("Target.createTarget", { url });
    targetId = created.targetId;
    const attached = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    sessionId = attached.sessionId;
    await cdp.send("Runtime.enable", {}, sessionId);

    await waitFor(
      async () => evaluate(cdp, sessionId, "Boolean(window.__moye)"),
      20_000,
      "写作面加载",
    );

    const emptyScreenshotPath = process.env.MOYE_SMOKE_SCREENSHOT_EMPTY;
    if (emptyScreenshotPath) {
      await cdp.send("Page.enable", {}, sessionId);
      const shot = await cdp.send(
        "Page.captureScreenshot",
        { format: "png" },
        sessionId,
      );
      fs.writeFileSync(emptyScreenshotPath, Buffer.from(shot.data, "base64"));
      console.log(`  空状态截图：${emptyScreenshotPath}`);
    }

    await evaluate(cdp, sessionId, "window.__moye.loadSample()");
    const sampleMarkdown = await evaluate(cdp, sessionId, "window.__moye.getMarkdown()");
    if (typeof sampleMarkdown !== "string" || !sampleMarkdown.includes("# 季度经营分析")) {
      throw new Error("示例文档没有载入");
    }

    const replaced = await evaluate(
      cdp,
      sessionId,
      `window.__moye.replace(${JSON.stringify(FIXTURE)})`,
    );
    if (replaced !== true) throw new Error("replace 返回 false");

    const roundTrip = await evaluate(cdp, sessionId, "window.__moye.getMarkdown()");
    if (roundTrip !== FIXTURE) {
      throw new Error("fixture 的 Markdown 往返不一致");
    }

    // The preview follows the editor's current Markdown through the shared
    // render seam; it is no longer a fixed fixture.
    const preview = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const doc = document.querySelector(".preview-paper .pdf-doc");
            const status = document.querySelector(".statusbar")?.textContent ?? "";
            const pages = Number((status.match(/(\\d+)\\s*页/) ?? [])[1] ?? 0);
            return {
              heading: doc?.querySelector("h1")?.textContent ?? "",
              text: doc?.textContent ?? "",
              pages,
            };
          })()`,
        );
        return state.heading === "中文标题" &&
          state.text.includes("段落包含") &&
          state.pages >= 1
          ? state
          : null;
      },
      10_000,
      "预览跟随当前文档并给出页数",
    );

    // Drag the separator: the fraction changes, persists, and survives reload
    // later in this script.
    const splitter = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const handle = document.querySelector('[role="separator"]');
        const workspace = document.querySelector(".workspace");
        if (!handle || !workspace) return null;
        const h = handle.getBoundingClientRect();
        const w = workspace.getBoundingClientRect();
        return {
          x: h.left + h.width / 2,
          y: h.top + h.height / 2,
          width: w.width,
          before: handle.getAttribute("aria-valuenow"),
        };
      })()`,
    );
    if (!splitter || splitter.before !== "50") {
      throw new Error(`分隔条初始状态不对：${JSON.stringify(splitter)}`);
    }
    const dragBy = 160;
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mousePressed",
        x: splitter.x,
        y: splitter.y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      },
      sessionId,
    );
    for (let step = 1; step <= 5; step += 1) {
      await cdp.send(
        "Input.dispatchMouseEvent",
        {
          type: "mouseMoved",
          x: splitter.x + (dragBy * step) / 5,
          y: splitter.y,
          button: "left",
          buttons: 1,
        },
        sessionId,
      );
    }
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        x: splitter.x + dragBy,
        y: splitter.y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      },
      sessionId,
    );
    const draggedSplit = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => ({
            now: Number(document.querySelector('[role="separator"]')?.getAttribute("aria-valuenow")),
            stored: localStorage.getItem("moye.split.v1"),
          }))()`,
        );
        return state.now > 55 && state.now <= 70 ? state : null;
      },
      5_000,
      "拖动分隔条",
    );

    await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `(() => {
            const live = document.querySelector('[data-msfe-mode="live"]');
            const heading = document.querySelector('.cm-line.msfe-h1');
            const cells = document.querySelectorAll('.msfe-table-cell');
            const tasks = document.querySelectorAll('.msfe-task-control');
            const code = document.querySelectorAll('.msfe-code-line');
            return Boolean(live && heading && cells.length >= 4 && tasks.length === 2 && code.length >= 3);
          })()`,
        ),
      10_000,
      "live 投影（标题、表格、任务、代码块）",
    );

    const headingText = await evaluate(
      cdp,
      sessionId,
      `document.querySelector('.cm-line.msfe-h1')?.textContent ?? ""`,
    );
    if (!headingText.includes("中文标题")) {
      throw new Error(`中文标题没有呈现：${headingText}`);
    }

    const wrap = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const line = [...document.querySelectorAll('.cm-line')].find(
          (element) => element.textContent?.includes("quarterly-business-review"),
        );
        return line ? { scrollWidth: line.scrollWidth, clientWidth: line.clientWidth } : null;
      })()`,
    );
    if (!wrap || wrap.scrollWidth > wrap.clientWidth + 1) {
      throw new Error(`长链接没有在写作面内换行：${JSON.stringify(wrap)}`);
    }

    const screenshotPath = process.env.MOYE_SMOKE_SCREENSHOT;
    if (screenshotPath) {
      await cdp.send("Page.enable", {}, sessionId);
      const shot = await cdp.send(
        "Page.captureScreenshot",
        { format: "png" },
        sessionId,
      );
      fs.writeFileSync(screenshotPath, Buffer.from(shot.data, "base64"));
      console.log(`  截图：${screenshotPath}`);
    }

    const pickerSupport = await evaluate(
      cdp,
      sessionId,
      `({ open: typeof window.showOpenFilePicker === "function" })`,
    );
    if (!pickerSupport.open) {
      throw new Error("无头 Chrome 没有提供 File System Access picker");
    }

    // Save, save-as and write-back through the real shortcut path, with the
    // native picker replaced by an in-page handle that records writes.
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        window.__writeLog = [];
        window.__pickerCalls = 0;
        window.showSaveFilePicker = async () => {
          window.__pickerCalls += 1;
          return {
            name: "保存测试.md",
            getFile: async () => new File([""], "保存测试.md", { type: "text/markdown" }),
            createWritable: async () => ({
              write: async (text) => { window.__writeLog.push(String(text)); },
              close: async () => {},
              abort: async () => {},
            }),
            queryPermission: async () => "granted",
            requestPermission: async () => "granted",
          };
        };
      })()`,
    );

    await pressShortcut(cdp, sessionId, "s", "KeyS", 83, 2);
    await waitFor(
      async () => evaluate(cdp, sessionId, "window.__writeLog.length === 1"),
      10_000,
      "Ctrl+S 保存",
    );
    const firstSave = await evaluate(
      cdp,
      sessionId,
      `({ calls: window.__pickerCalls, text: window.__writeLog[0] })`,
    );
    if (firstSave.calls !== 1 || firstSave.text !== FIXTURE) {
      throw new Error("Ctrl+S 没有把 Markdown 写回选中的文件");
    }

    await pressShortcut(cdp, sessionId, "s", "KeyS", 83, 2);
    await waitFor(
      async () => evaluate(cdp, sessionId, "window.__writeLog.length === 2"),
      10_000,
      "再次 Ctrl+S 写回原句柄",
    );
    const secondSave = await evaluate(
      cdp,
      sessionId,
      `({ calls: window.__pickerCalls, text: window.__writeLog[1] })`,
    );
    if (secondSave.calls !== 1 || secondSave.text !== FIXTURE) {
      throw new Error("再次保存没有复用文件句柄");
    }

    await pressShortcut(cdp, sessionId, "s", "KeyS", 83, 10);
    await waitFor(
      async () => evaluate(cdp, sessionId, "window.__writeLog.length === 3"),
      10_000,
      "Ctrl+Shift+S 另存为",
    );
    const saveAs = await evaluate(
      cdp,
      sessionId,
      `({ calls: window.__pickerCalls, text: window.__writeLog[2] })`,
    );
    if (saveAs.calls !== 2 || saveAs.text !== FIXTURE) {
      throw new Error("Ctrl+Shift+S 没有重新选择目标文件");
    }

    // Open through Ctrl+O with a picker-supplied handle.
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        window.showOpenFilePicker = async () => [{
          name: "快捷键打开.md",
          getFile: async () => new File(["# 快捷键打开\\n"], "快捷键打开.md", { type: "text/markdown" }),
          createWritable: async () => ({
            write: async () => {},
            close: async () => {},
            abort: async () => {},
          }),
          queryPermission: async () => "granted",
          requestPermission: async () => "granted",
        }];
      })()`,
    );
    await pressShortcut(cdp, sessionId, "o", "KeyO", 79, 2);
    await waitFor(
      async () =>
        (await evaluate(cdp, sessionId, "window.__moye.getMarkdown()")) ===
        "# 快捷键打开\n",
      10_000,
      "Ctrl+O 打开文件",
    );
    const openedName = await evaluate(
      cdp,
      sessionId,
      `document.querySelector(".doc-name")?.value`,
    );
    if (openedName !== "快捷键打开.md") {
      throw new Error(`打开后文件名不对：${openedName}`);
    }

    // Drop a Markdown file onto the window; the synthetic handle is absent, so
    // this exercises the File fallback and still opens the document.
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(["# 拖入文档\\n\\n正文"], "拖入.md", { type: "text/markdown" }));
        window.dispatchEvent(new DragEvent("drop", {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
        }));
      })()`,
    );
    await waitFor(
      async () =>
        (await evaluate(cdp, sessionId, "window.__moye.getMarkdown()")) ===
        "# 拖入文档\n\n正文",
      10_000,
      "拖入 Markdown 文件",
    );
    const droppedName = await evaluate(
      cdp,
      sessionId,
      `document.querySelector(".doc-name")?.value`,
    );
    if (droppedName !== "拖入.md") {
      throw new Error(`拖入后文件名不对：${droppedName}`);
    }

    await evaluate(cdp, sessionId, `window.__moye.replace("")`);
    await evaluate(cdp, sessionId, "window.__moye.focus()");
    await cdp.send("Input.insertText", { text: TYPED }, sessionId);
    const typed = await waitFor(
      async () => {
        const value = await evaluate(cdp, sessionId, "window.__moye.getMarkdown()");
        return value === TYPED ? value : null;
      },
      10_000,
      "键入文本",
    );

    // Draft debounce → reload → restore, with the editor mounted again.
    await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `(() => {
            const raw = localStorage.getItem("moye.draft.v1");
            if (!raw) return false;
            try {
              return JSON.parse(raw).content === ${JSON.stringify(TYPED)};
            } catch {
              return false;
            }
          })()`,
        ),
      5_000,
      "草稿写入 localStorage",
    );

    await cdp.send("Page.enable", {}, sessionId);
    // A fresh document is the only place the marker disappears; evaluating in
    // the old context after Page.reload would otherwise pass immediately.
    const reloadMark = `moye-reload-${Date.now()}`;
    await evaluate(
      cdp,
      sessionId,
      `window.__moyeReloadMark = ${JSON.stringify(reloadMark)}`,
    );
    await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
    await waitFor(
      async () => {
        try {
          const stillOld = await evaluate(
            cdp,
            sessionId,
            `window.__moyeReloadMark === ${JSON.stringify(reloadMark)}`,
          );
          return stillOld ? null : true;
        } catch {
          return null;
        }
      },
      20_000,
      "页面重载",
    );
    const restored = await waitFor(
      async () => {
        try {
          const value = await evaluate(
            cdp,
            sessionId,
            "window.__moye ? window.__moye.getMarkdown() : null",
          );
          return value === TYPED ? value : null;
        } catch {
          return null;
        }
      },
      20_000,
      "刷新后恢复草稿",
    );
    const restoredShell = await evaluate(
      cdp,
      sessionId,
      `({
        empty: Boolean(document.querySelector(".writing-empty")),
        live: Boolean(document.querySelector('.cm-editor[data-msfe-mode="live"]')),
        name: document.querySelector(".doc-name")?.value,
        split: document.querySelector('[role="separator"]')?.getAttribute("aria-valuenow"),
      })`,
    );
    if (restoredShell.empty || !restoredShell.live || restoredShell.name !== "拖入.md") {
      throw new Error(`草稿恢复后的界面不对：${JSON.stringify(restoredShell)}`);
    }
    if (Number(restoredShell.split) !== draggedSplit.now) {
      throw new Error(
        `刷新后分栏比例没有恢复：期望 ${draggedSplit.now}，实际 ${restoredShell.split}`,
      );
    }

    // Typing must change the preview and the page estimate, not just the
    // editor's internal state. The long text is generated here so the expected
    // height is stable across runs.
    const longTyped = [
      "# 分页估算",
      "",
      "分页标记：预览与状态栏随键入更新。",
      "",
      ...Array.from(
        { length: 50 },
        (_, index) =>
          `第 ${index + 1} 段。这一段用于增加页面高度，确认状态栏中的页数估算会随着预览内容增长。`,
      ),
    ].join("\n");
    await evaluate(cdp, sessionId, `window.__moye.replace("")`);
    await evaluate(cdp, sessionId, "window.__moye.focus()");
    await cdp.send("Input.insertText", { text: longTyped }, sessionId);

    const typedPreview = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const doc = document.querySelector(".preview-paper .pdf-doc");
            const status = document.querySelector(".statusbar")?.textContent ?? "";
            return {
              heading: doc?.querySelector("h1")?.textContent ?? "",
              text: doc?.textContent ?? "",
              pages: Number((status.match(/(\\d+)\\s*页/) ?? [])[1] ?? 0),
              characters: Number((status.match(/(\\d+)\\s*字/) ?? [])[1] ?? 0),
            };
          })()`,
        );
        return state.heading === "分页估算" &&
          state.text.includes("分页标记") &&
          state.pages >= 2 &&
          state.characters > 500
          ? state
          : null;
      },
      10_000,
      "键入后预览与页数估算更新",
    );

    // Below 900px the panes stack writing-over-preview and the separator is
    // gone; no extra switching control may appear.
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 800, height: 1000, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    const stacked = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const workspace = document.querySelector(".workspace");
            const writing = document.querySelector('[data-region="writing"]');
            const preview = document.querySelector('[data-region="preview"]');
            const handle = document.querySelector('[role="separator"]');
            if (!workspace || !writing || !preview || !handle) return null;
            const w = writing.getBoundingClientRect();
            const p = preview.getBoundingClientRect();
            return {
              columns: getComputedStyle(workspace).gridTemplateColumns.split(" ").length,
              splitter: getComputedStyle(handle).display,
              stacked: w.bottom <= p.top + 1 && w.top < p.top,
              controls: Array.from(workspace.querySelectorAll("button"), (button) => ({
                text: button.textContent?.trim() ?? "",
                label: button.getAttribute("aria-label"),
                region: button.closest("[data-region]")?.getAttribute("data-region"),
              })),
            };
          })()`,
        );
        return state && state.splitter === "none" && state.stacked ? state : null;
      },
      5_000,
      "窄屏堆叠",
    );
    const switchingControls = stacked.controls.filter((control) =>
      /预览|编辑|切换/.test(`${control.text}${control.label ?? ""}`),
    );
    if (stacked.columns !== 1 || switchingControls.length !== 0) {
      throw new Error(`窄屏布局不对：${JSON.stringify({ ...stacked, switchingControls })}`);
    }
    await cdp.send("Emulation.clearDeviceMetricsOverride", {}, sessionId);

    // Insert actions: four icon buttons, each writing standard Markdown through
    // the editor. The link action also proves Enter submits and focus returns.
    const controls = await evaluate(
      cdp,
      sessionId,
      `[...document.querySelectorAll(".writing-bar button")].map((button) => ({
        label: button.getAttribute("aria-label"),
        title: button.getAttribute("title"),
        text: button.textContent.trim(),
      }))`,
    );
    if (
      controls.length !== 4 ||
      controls.some(
        (control) =>
          !control.label || control.title !== control.label || control.text !== "",
      )
    ) {
      throw new Error(`插入按钮的可访问名称不对：${JSON.stringify(controls)}`);
    }

    const resetWritingSurface = async () => {
      await evaluate(cdp, sessionId, `window.__moye.replace("")`);
      await evaluate(cdp, sessionId, "window.__moye.focus()");
    };
    const clickInsert = async (label) => {
      await evaluate(
        cdp,
        sessionId,
        `document.querySelector('button[aria-label="${label}"]')?.click()`,
      );
    };

    await resetWritingSurface();
    await clickInsert("插入链接");
    await waitFor(
      async () => evaluate(cdp, sessionId, `Boolean(document.querySelector('dialog[open]'))`),
      5_000,
      "链接对话框",
    );
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector("dialog[open] input")?.focus()`,
    );
    await cdp.send(
      "Input.insertText",
      { text: "https://example.com" },
      sessionId,
    );
    await pressEnter(cdp, sessionId);
    const linkMarkdown = await waitFor(
      async () => {
        const value = await evaluate(cdp, sessionId, "window.__moye.getMarkdown()");
        return typeof value === "string" &&
          value.includes("[https://example.com](<https://example.com>)")
          ? value
          : null;
      },
      10_000,
      "插入链接",
    );
    if (await evaluate(cdp, sessionId, `Boolean(document.querySelector('dialog[open]'))`)) {
      throw new Error("Enter 确认后链接对话框没有关闭");
    }
    await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `Boolean(document.activeElement?.closest(".cm-editor"))`,
        ),
      5_000,
      "链接插入后焦点回到写作面",
    );

    // Escape cancels without writing anything and also returns focus.
    await resetWritingSurface();
    await clickInsert("插入链接");
    await waitFor(
      async () => evaluate(cdp, sessionId, `Boolean(document.querySelector('dialog[open]'))`),
      5_000,
      "链接对话框（取消）",
    );
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector("dialog[open] input")?.focus()`,
    );
    await cdp.send("Input.insertText", { text: "https://cancelled.example" }, sessionId);
    await pressEscape(cdp, sessionId);
    await waitFor(
      async () => evaluate(cdp, sessionId, `!document.querySelector("dialog[open]")`),
      5_000,
      "Escape 关闭链接对话框",
    );
    if ((await evaluate(cdp, sessionId, "window.__moye.getMarkdown()")) !== "") {
      throw new Error("Escape 取消后写作面被改写");
    }
    await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `Boolean(document.activeElement?.closest(".cm-editor"))`,
        ),
      5_000,
      "取消链接后焦点回到写作面",
    );

    await resetWritingSurface();
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        window.showOpenFilePicker = async () => [{
          name: "像素.png",
          getFile: async () => new File(
            [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
            "像素.png",
            { type: "image/png" },
          ),
        }];
      })()`,
    );
    await clickInsert("插入图片");
    const imageMarkdown = await waitFor(
      async () => {
        const value = await evaluate(cdp, sessionId, "window.__moye.getMarkdown()");
        return typeof value === "string" &&
          value.includes("![像素](<data:image/png;base64,")
          ? value
          : null;
      },
      10_000,
      "插入图片",
    );

    await resetWritingSurface();
    await clickInsert("插入表格");
    const tableMarkdown = await waitFor(
      async () => {
        const value = await evaluate(cdp, sessionId, "window.__moye.getMarkdown()");
        return typeof value === "string" &&
          value.includes("| 列 1 | 列 2 |") &&
          value.includes("| --- | --- |") &&
          (value.match(/^\|  \|  \|$/gmu) ?? []).length === 2
          ? value
          : null;
      },
      10_000,
      "插入表格",
    );
    await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `document.querySelectorAll(".msfe-table-cell").length >= 6`,
        ),
      5_000,
      "表格 live 投影",
    );

    await resetWritingSurface();
    await clickInsert("插入代码块");
    const codeMarkdown = await waitFor(
      async () => {
        const value = await evaluate(cdp, sessionId, "window.__moye.getMarkdown()");
        return value === "```\n\n```" ? value : null;
      },
      10_000,
      "插入代码块",
    );
    await cdp.send(
      "Input.insertText",
      { text: "const answer = 42;" },
      sessionId,
    );
    await waitFor(
      async () =>
        (await evaluate(cdp, sessionId, "window.__moye.getMarkdown()")) ===
        "```\nconst answer = 42;\n```",
      10_000,
      "空代码块光标位于围栏内",
    );

    // Table and code block replace or wrap a non-empty selection.
    await evaluate(cdp, sessionId, `window.__moye.replace("旧内容")`);
    await evaluate(cdp, sessionId, "window.__moye.focus()");
    await pressShortcut(cdp, sessionId, "a", "KeyA", 65, 2);
    await clickInsert("插入表格");
    await waitFor(
      async () =>
        (await evaluate(cdp, sessionId, "window.__moye.getMarkdown()")) ===
        "| 列 1 | 列 2 |\n| --- | --- |\n|  |  |\n|  |  |",
      10_000,
      "表格替换选区",
    );

    await evaluate(cdp, sessionId, `window.__moye.replace("代码")`);
    await evaluate(cdp, sessionId, "window.__moye.focus()");
    await pressShortcut(cdp, sessionId, "a", "KeyA", 65, 2);
    await clickInsert("插入代码块");
    await waitFor(
      async () =>
        (await evaluate(cdp, sessionId, "window.__moye.getMarkdown()")) ===
        "```\n代码\n```",
      10_000,
      "代码块包裹选区",
    );

    // Settings: three groups, live preview, persisted export options and the
    // first-H1 fallback. The fixture has several H1s on purpose.
    await evaluate(
      cdp,
      sessionId,
      `window.__moye.replace(${JSON.stringify(SETTINGS_FIXTURE)})`,
    );
    await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `document.querySelector(".preview-paper .pdf-doc h1")?.textContent === "第一章 起点"`,
        ),
      10_000,
      "设置 fixture 进入预览",
    );

    const workspaceBefore = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const rect = document.querySelector(".workspace").getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })()`,
    );
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector('[data-action="settings"]')?.click()`,
    );
    const settingsOpen = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const dialog = document.querySelector("#settings-dialog");
            const active = document.activeElement;
            return {
              open: Boolean(dialog?.open),
              focus: active?.id ?? "",
              inside: Boolean(dialog && active && dialog.contains(active)),
              groups: [...document.querySelectorAll("#settings-dialog .settings-group__title")].map(
                (element) => element.textContent,
              ),
              toggle: document.querySelector('[data-action="settings"]')?.getAttribute("aria-expanded"),
              text: dialog?.textContent ?? "",
            };
          })()`,
        );
        return state.open && state.focus === "setting-paper" ? state : null;
      },
      5_000,
      "设置对话框打开并聚焦第一项",
    );
    if (
      !settingsOpen.inside ||
      settingsOpen.groups.join("|") !== "纸张|版式|文档" ||
      settingsOpen.toggle !== "true"
    ) {
      throw new Error(`设置分组不对：${JSON.stringify(settingsOpen)}`);
    }
    if (settingsOpen.text.includes("编辑模式") || settingsOpen.text.includes("同步滚动")) {
      throw new Error("设置里仍出现已删除的编辑模式或同步滚动");
    }
    const workspaceAfter = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const rect = document.querySelector(".workspace").getBoundingClientRect();
        const dialog = document.querySelector("#settings-dialog").getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          dialogWidth: Math.round(dialog.width),
          dialogHeight: Math.round(dialog.height),
        };
      })()`,
    );
    if (
      workspaceAfter.x !== workspaceBefore.x ||
      workspaceAfter.y !== workspaceBefore.y ||
      workspaceAfter.width !== workspaceBefore.width ||
      workspaceAfter.height !== workspaceBefore.height ||
      workspaceAfter.dialogWidth <= 0 ||
      workspaceAfter.dialogHeight <= 0
    ) {
      throw new Error(
        `设置对话框改变了布局：${JSON.stringify({ workspaceBefore, workspaceAfter })}`,
      );
    }

    // Paper: the preview sheet takes the landscape width and height.
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const control = document.querySelector("#setting-paper");
        control.value = "a4-landscape";
        control.dispatchEvent(new Event("change", { bubbles: true }));
      })()`,
    );
    const landscapePreview = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const paper = document.querySelector(".preview-paper");
            return {
              width: paper?.style.getPropertyValue("--moye-preview-paper-width"),
              height: paper?.style.getPropertyValue("--moye-preview-paper-height"),
            };
          })()`,
        );
        return state.width === "1123px" && state.height === "794px" ? state : null;
      },
      5_000,
      "预览切换到 A4 横向",
    );

    // Margin: no margin means no paper padding.
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const control = document.querySelector("#setting-margin");
        control.value = "0";
        control.dispatchEvent(new Event("change", { bubbles: true }));
      })()`,
    );
    const marginPreview = await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `document.querySelector(".preview-paper")?.style.getPropertyValue("--moye-preview-paper-margin") === "0px"`,
        ),
      5_000,
      "预览页边距归零",
    );
    if (!marginPreview) throw new Error("预览没有应用无页边距");

    // Theme: CSS and the page background are shared with the export.
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const control = document.querySelector("#setting-theme");
        control.value = "editorial";
        control.dispatchEvent(new Event("change", { bubbles: true }));
      })()`,
    );
    const themePreview = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const paper = document.querySelector(".preview-paper");
            return {
              css: document.querySelector("#docTheme")?.textContent ?? "",
              background: getComputedStyle(paper).backgroundColor,
              control: document.querySelector("#setting-background")?.value,
            };
          })()`,
        );
        return state.css.includes("--accent: #8a3b22") &&
          state.background === "rgb(253, 251, 247)" &&
          state.control === "#fdfbf7"
          ? state
          : null;
      },
      5_000,
      "预览切换文档主题",
    );

    // H1 break: marked before every H1 after the first, and passed to export.
    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const control = document.querySelector("#setting-h1-break");
        control.checked = true;
        control.dispatchEvent(new Event("change", { bubbles: true }));
      })()`,
    );
    const breakPreview = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const paper = document.querySelector(".preview-paper");
            const headings = [...paper.querySelectorAll(".preview-paper__content .pdf-doc > h1")];
            return {
              flag: paper.getAttribute("data-h1-break"),
              headings: headings.length,
              markers: headings.slice(1).every(
                (heading) => getComputedStyle(heading, "::before").borderTopStyle === "dashed",
              ),
            };
          })()`,
        );
        return state.flag === "true" && state.headings === 3 && state.markers
          ? state
          : null;
      },
      5_000,
      "预览标记一级标题另起页",
    );

    const exportSettings = await evaluate(
      cdp,
      sessionId,
      `window.__moyeSettings?.getExportSettings() ?? null`,
    );
    if (
      !exportSettings ||
      exportSettings.paper !== "a4-landscape" ||
      exportSettings.marginPt !== 0 ||
      exportSettings.headerTitle !== "第一章 起点" ||
      exportSettings.pageBreakOnH1 !== true ||
      exportSettings.background !== "#fdfbf7" ||
      exportSettings.pageNumbers !== true
    ) {
      throw new Error(`导出选项没有跟随设置：${JSON.stringify(exportSettings)}`);
    }

    // Escape closes the modal and returns focus to the settings button.
    await pressEscape(cdp, sessionId);
    await waitFor(
      async () =>
        evaluate(
          cdp,
          sessionId,
          `(() => {
            const dialog = document.querySelector("#settings-dialog");
            const active = document.activeElement;
            return (
              !dialog?.open &&
              active?.getAttribute("data-action") === "settings" &&
              active?.getAttribute("aria-expanded") === "false"
            );
          })()`,
        ),
      5_000,
      "Escape 关闭设置并归还焦点",
    );

    // Reload: every option comes back, and the preview is rebuilt from it.
    const settingsReloadMark = `moye-settings-reload-${Date.now()}`;
    await evaluate(
      cdp,
      sessionId,
      `window.__moyeSettingsReloadMark = ${JSON.stringify(settingsReloadMark)}`,
    );
    await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
    await waitFor(
      async () => {
        try {
          const stillOld = await evaluate(
            cdp,
            sessionId,
            `window.__moyeSettingsReloadMark === ${JSON.stringify(settingsReloadMark)}`,
          );
          return stillOld ? null : true;
        } catch {
          return null;
        }
      },
      20_000,
      "设置页重载",
    );
    const restoredSettings = await waitFor(
      async () => {
        try {
          const state = await evaluate(
            cdp,
            sessionId,
            `(() => {
              const paper = document.querySelector(".preview-paper");
              return {
                options: window.__moyeSettings?.getOptions() ?? null,
                width: paper?.style.getPropertyValue("--moye-preview-paper-width"),
                margin: paper?.style.getPropertyValue("--moye-preview-paper-margin"),
                h1Break: paper?.getAttribute("data-h1-break"),
                background: getComputedStyle(paper).backgroundColor,
              };
            })()`,
          );
          return state.options?.paper === "a4-landscape" ? state : null;
        } catch {
          return null;
        }
      },
      20_000,
      "刷新后恢复设置",
    );
    if (
      restoredSettings.width !== "1123px" ||
      restoredSettings.margin !== "0px" ||
      restoredSettings.h1Break !== "true" ||
      restoredSettings.background !== "rgb(253, 251, 247)" ||
      restoredSettings.options.theme !== "editorial" ||
      restoredSettings.options.pageBreakOnH1 !== true
    ) {
      throw new Error(`刷新后的设置或预览不对：${JSON.stringify(restoredSettings)}`);
    }

    await evaluate(
      cdp,
      sessionId,
      `document.querySelector('[data-action="settings"]')?.click()`,
    );
    const restoredControls = await waitFor(
      async () => {
        const state = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const dialog = document.querySelector("#settings-dialog");
            if (!dialog?.open) return null;
            return {
              paper: document.querySelector("#setting-paper")?.value,
              margin: document.querySelector("#setting-margin")?.value,
              theme: document.querySelector("#setting-theme")?.value,
              background: document.querySelector("#setting-background")?.value,
              h1Break: document.querySelector("#setting-h1-break")?.checked,
            };
          })()`,
        );
        return state?.paper === "a4-landscape" ? state : null;
      },
      5_000,
      "设置面板恢复已存值",
    );
    if (
      restoredControls.margin !== "0" ||
      restoredControls.theme !== "editorial" ||
      restoredControls.background !== "#fdfbf7" ||
      restoredControls.h1Break !== true
    ) {
      throw new Error(`设置面板没有恢复：${JSON.stringify(restoredControls)}`);
    }
    await evaluate(
      cdp,
      sessionId,
      `document.querySelector("#settings-dialog .settings-dialog__close")?.click()`,
    );
    await waitFor(
      async () =>
        evaluate(cdp, sessionId, `!document.querySelector("#settings-dialog")?.open`),
      5_000,
      "关闭设置按钮",
    );

    console.log("✔ MSFE live 写作面冒烟通过");
    console.log(`  文档往返：${JSON.stringify(roundTrip.slice(0, 24))}…`);
    console.log(`  键入往返：${JSON.stringify(typed)}`);
    console.log(`  刷新恢复：${JSON.stringify(restored)}（${restoredShell.name}）`);
    console.log(`  预览跟随：${preview.heading}，${preview.pages} 页`);
    console.log(`  分栏拖动：50% → ${draggedSplit.now}%，刷新后仍为 ${restoredShell.split}%`);
    console.log(
      `  键入后预览：${typedPreview.heading}，${typedPreview.characters} 字，${typedPreview.pages} 页`,
    );
    console.log(`  窄屏：写作面在上、预览在下，分隔条隐藏（${stacked.columns} 列）`);
    console.log("  中文标题、表格、任务列表、代码块与长链接换行均已投影");
    console.log("  Ctrl+S 写回、Ctrl+Shift+S 另存、Ctrl+O 打开、拖入 Markdown 均通过");
    console.log(`  插入链接：${JSON.stringify(linkMarkdown)}`);
    console.log(`  插入图片：${JSON.stringify(imageMarkdown.slice(0, 48))}…`);
    console.log(`  插入表格：${JSON.stringify(tableMarkdown)}`);
    console.log(`  插入代码块：${JSON.stringify(codeMarkdown)}`);
    console.log(
      `  设置预览：${landscapePreview.width}×${landscapePreview.height}，边距 ${restoredSettings.margin}，主题 ${themePreview.control}`,
    );
    console.log(
      `  一级标题另起页：${breakPreview.headings} 个标题，后续标题均带分页标记 ${breakPreview.markers}`,
    );
    console.log(
      `  设置持久化：${restoredSettings.options.paper} / ${restoredSettings.options.margin} / ${restoredSettings.options.theme} / 页眉 ${JSON.stringify(exportSettings.headerTitle)}`,
    );
  } finally {
    if (cdp && targetId) {
      try {
        await cdp.send("Target.closeTarget", { targetId });
      } catch {
        /* target may already be gone */
      }
    }
    cdp?.close();
    try {
      child.kill();
    } catch {
      /* already exited */
    }
    await server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* Chrome may still hold a file on Windows */
    }
    if (chromeLog && process.env.MOYE_DEBUG) process.stderr.write(chromeLog);
  }
}

main().catch((error) => {
  console.error("✖ " + error.message);
  if (process.env.MOYE_DEBUG) console.error(error);
  process.exit(1);
});
