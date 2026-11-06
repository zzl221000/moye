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
    await cdp.send("Page.reload", { ignoreCache: true }, sessionId);
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
      })`,
    );
    if (restoredShell.empty || !restoredShell.live || restoredShell.name !== "拖入.md") {
      throw new Error(`草稿恢复后的界面不对：${JSON.stringify(restoredShell)}`);
    }

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

    console.log("✔ MSFE live 写作面冒烟通过");
    console.log(`  文档往返：${JSON.stringify(roundTrip.slice(0, 24))}…`);
    console.log(`  键入往返：${JSON.stringify(typed)}`);
    console.log(`  刷新恢复：${JSON.stringify(restored)}（${restoredShell.name}）`);
    console.log("  中文标题、表格、任务列表、代码块与长链接换行均已投影");
    console.log("  Ctrl+S 写回、Ctrl+Shift+S 另存、Ctrl+O 打开、拖入 Markdown 均通过");
    console.log(`  插入链接：${JSON.stringify(linkMarkdown)}`);
    console.log(`  插入图片：${JSON.stringify(imageMarkdown.slice(0, 48))}…`);
    console.log(`  插入表格：${JSON.stringify(tableMarkdown)}`);
    console.log(`  插入代码块：${JSON.stringify(codeMarkdown)}`);
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
