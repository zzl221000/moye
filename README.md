# 墨页 · Markdown → PDF

双栏 Markdown 编辑器 + 纯前端矢量 PDF 导出，PDF 引擎是 [dompdf.js](https://dompdfjs.lisky.com.cn/)。
运行时零依赖，不需要打包（`build.mjs` 只做文件拷贝）。不联网也能跑，字体和库都在本地。

```
md-pdf/
├─ index.html            编辑器（CodeMirror + A4 版式预览）
├─ app.js                界面逻辑、导出、设置、快捷键
├─ prepare.js            导出前处理（分页属性、长 token、任务列表）
├─ export-doc.js         共用的导出核心（编辑器与 CLI 都走这里）
├─ themes.js             主题 CSS 组（编辑器与 CLI 共用）
├─ export.mjs            CLI：Markdown → PDF（headless Chrome + CDP）
├─ build.mjs             生成 dist/：纯拷贝 + .nojekyll / CNAME
├─ serve.mjs             本地静态服务器（支持 --dir / --port）
├─ start.cmd             Windows 一键启动
├─ styles/
│  ├─ app.css            界面样式（Operate 风格，浅色纸感）
│  └─ doc.css           文档/PDF 排版（预览与 PDF 共用）
├─ vendor/               CodeMirror 5、marked、DOMPurify、dompdf.js
├─ fonts/                Source Han Sans SC（思源黑体）TTF + OFL.txt
├─ THIRD-PARTY.md        第三方许可
└─ .github/workflows/pages.yml
```

## 一、打开编辑器

双击 `start.cmd`，或：

```bash
node serve.mjs            # http://127.0.0.1:8777
```

不要直接双击 `index.html`。`file://` 下浏览器会拦截字体请求，中文在 PDF 里会变成方框；
dompdf 的 Worker 也可能被安全策略挡住。

快捷键：

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 保存 / 写回文件 | `Ctrl+S` | `⌘S` |
| 另存为 | `Ctrl+Shift+S` | `⌘⇧S` |
| 导出 PDF | `Ctrl+Shift+E` | `⌘⇧E` |
| 打开文件 | `Ctrl+O` | `⌘O` |

右上角设置里可以改纸张（A4 / A4 横向 / Letter）、页边距、页眉标题、
页脚页码、首页不显示页眉页脚、每个 H1 另起一页、是否压缩，以及文档主题、
页面背景、细节 CSS、编辑模式和双栏同步滚动。

导出后提示条里有「打开」，会用新标签页打开生成的 PDF，方便立即检查分页。

### 保存到原文件

Chrome / Edge（HTTPS 或 localhost）下，「打开」「保存」走浏览器
[File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API)：

- 打开文件后记住句柄，`Ctrl+S` **直接写回原文件**，不再下载
- `Ctrl+Shift+S` 另存为；修改文件名后保存也会新建文件
- 把 `.md` 拖进页面同样会拿到句柄，后续保存写回
- 首次写入会请求权限，拒绝则取消本次保存
- Firefox / Safari 没有这个 API，自动降级为下载副本（设置底部会显示当前状态）
- 句柄只在当前会话有效；刷新后重新「打开」即可。草稿仍会自动暂存在 localStorage

### 编辑模式

设置 → 编辑器 → 编辑模式：

- **Markdown · 语法高亮**：标题、强调、链接、代码、列表标记着色，开启括号自动补全、
  括号匹配和回车续写列表。默认模式。
- **纯文本 · 无高亮**：关闭语法着色、自动补全、括号匹配和列表续写，适合粘贴原文、
  整理纯文本或不想被自动补全打断时使用。

模式只影响编辑区的显示和输入辅助，不改变 Markdown 内容；右侧预览和导出的 PDF
仍然按 Markdown 渲染。CodeMirror 是源码编辑器，**不提供所见即所得**（不会隐藏 `#`、
把粗体就地渲染）；需要那种效果得换 HyperMD、TipTap / Milkdown 等编辑器。

### 主题与细节 CSS

设置面板里的「文档样式」：

- **主题**：纸张 / 刊物 / 紧凑 / 石墨（深色），是一组作用在 `.pdf-doc` 上的 CSS 组
- **页面背景**：同时作用于预览纸张和 PDF 页面底色
- **细节 CSS**：实时生效，导出时一起写入 PDF
- **双栏同步滚动**：默认开启，按滚动比例同步编辑器和预览

```css
/* 细节 CSS 示例 */
.pdf-doc { font-size: 15px; }
.pdf-doc h1 { color: #8a3b22; }
.pdf-doc table { font-size: 13px; }
```

主题定义在 `themes.js`，可以按同样结构加一组。自定义 CSS 建议只写 `.pdf-doc ...`
选择器；换 `font-family` 需要额外嵌入 TTF，否则 PDF 里的中文可能缺字。

## 二、命令行导出（适合 Zed / 脚本 / CI）

```bash
node export.mjs 报告.md
node export.mjs 报告.md --paper a4-landscape --h1-break --open
node export.mjs 报告.md --margin 18 --no-footer
node export.mjs 报告.md --theme dark --css my.css --background '#0d1117'
```

| 选项 | 说明 |
| --- | --- |
| `-o, --out <file>` | 输出路径（默认同名 `.pdf`） |
| `--paper <name>` | `a4` / `a4-landscape` / `letter` |
| `--margin <pt>` | 页边距，单位 pt（默认 36 ≈ 12.7mm） |
| `--title <text>` | 页眉标题（默认取第一个一级标题） |
| `--theme <name>` | `paper` / `editorial` / `compact` / `dark` |
| `--css <file>` | 追加自定义 CSS 文件（作用于 `.pdf-doc`） |
| `--background <color>` | 页面背景色（默认取主题） |
| `--no-footer` | 不输出页脚页码 |
| `--no-cover` | 首页也显示页眉页脚 |
| `--h1-break` | 每个一级标题另起一页 |
| `--no-compress` | 不压缩 PDF 流 |
| `--open` | 生成后用默认阅读器打开 |

原理：起一个临时 HTTP 服务 → headless Chrome 打开导出页 →
`Runtime.evaluate` 调 dompdf.js → 把 base64 PDF 写回磁盘。用的是 Node 内置
`WebSocket`，所以零依赖。需要 **Node 22+**。找不到 Chrome 时设置 `CHROME_PATH`（Edge 也可以）。

Markdown 里的相对图片路径会按 `.md` 所在目录解析，例如 `![](images/a.png)`。

## 三、放到 Zed 里

Zed 的扩展系统**不能**做这件事（详见下文），可行的方式是「任务 + CLI」。
本目录自带 `.zed/tasks.json`（如果应用在子目录里，把参数改成 `$ZED_WORKTREE_ROOT/md-pdf/export.mjs`）：

```json
{
  "label": "Markdown → PDF (dompdf)",
  "command": "node",
  "args": ["$ZED_WORKTREE_ROOT/export.mjs", "$ZED_FILE", "--open"],
  "cwd": "$ZED_DIRNAME",
  "save": "current",
  "reveal": "no_focus",
  "hide": "on_success"
}
```

在 Zed 里对 Markdown 文件执行 `task: spawn`（默认 `alt-shift-r` / `cmd-shift-r`，
以你的 keymap 为准），选 “Markdown → PDF (dompdf)”。会在源文件旁边生成同名 PDF。

如果你把 `md-pdf` 放在别的项目里，按实际路径改第一段参数即可。

### 为什么 Zed 扩展做不了

Zed 的 `extension.toml` 只能提供这些能力：

- Languages（语法、LSP、tree-sitter）
- Themes / Icon Themes
- Snippets
- Debuggers（DAP）
- MCP Servers
- Agent Server Extensions（ACP）

`Extension` trait 里只有 language server、DAP、context server、slash command、
docs index 这些入口；没有命令面板项、没有菜单、没有面板、没有 webview。
slash command 的输出只能进 Agent 面板，不能操作编辑器或生成文件。

更根本的是：Zed 的 Markdown 预览是 GPUI 原生渲染，不存在 DOM/CSSOM。
dompdf.js 依赖 `getComputedStyle`、布局盒模型和 Web Worker，在 Zed 里没有可读的页面。

因此：**Zed 里没有「导出 PDF 按钮」这种插件形态**，任务 + CLI 是它的原生集成方式。

## 四、导出质量做了哪些处理

这套排版针对中文报告做过调整，直接改 `styles/doc.css` 即可：

- **代码换行**：`pre` / `code` 用 `white-space: pre-wrap` + `overflow-wrap: anywhere`，
  并把 `pre` 的 `overflow` 设为 `visible`。这是最初「PDF 里代码不换行」的根因：
  很多主题只改了 `code`，但 `pre` 的 `white-space: pre` 优先级更高。
- **表格宽度**：普通单元格保持自然宽度，只给含长 URL / 长标识符的单元格加
  `.cell-wrap-anywhere`，避免数字列被压成三行。
- **对齐**：marked 输出的 `align="right"` 在 CSS 里显式恢复，金额列才会右对齐。
- **中文嵌入**：`fontConfig` + `langFontConfig` 都用思源黑体，并保证预览与 PDF
  使用同一套字形度量，否则换行位置会和 PDF 对不上。
- **标题孤行**：调用 dompdf 的 `computePageBreaks()`，把落在页尾 96px 内、
  且后面紧跟表格/代码块的标题推到下一页。
- **分页**：小表格/短代码块加 `divisionDisable` 尽量不拆；超过 420px 的表格允许
  跨页。需要强制换页的元素加 `pageBreak` 属性。
- **首页**：默认第 1 页不显示页眉页脚（封面页），可在设置里关闭。

## 五、已知限制

- 跨页的**表格不会重复表头**（dompdf 当前不支持重复 `<thead>`）。长表格的第二页
  直接从数据行开始。
- File System Access API 目前只有 Chromium 系（Chrome / Edge）完整支持；Firefox / Safari
  会降级为下载。写回需要 HTTPS 或 localhost。
- 编辑区只做源码语法高亮，不提供所见即所得；格式化结果看右侧预览
- 不支持 Mermaid、KaTeX、Obsidian 双链等扩展语法；需要的话可在 `app.js` 里加
  marked 扩展。
- 远程图片需要服务端返回 CORS 头（导出时 `useCORS: true`），否则会被跳过。
- 字体现在是同源加载；GitHub Pages 本身由 Fastly CDN 提供，字体已经是 CDN 响应。
  若要换到自己的 OSS/jsDelivr，需要同时改 `index.html` 的 `@font-face`/preload 和
  `app.js` 的 `fetch` 地址，并确保 CDN 返回 `Access-Control-Allow-Origin`。
  换 CDN 不会减小 4.5MB 体积，真正省流量还是用上面的 `pyftsubset`。
- 思源黑体只打包了 Regular。粗体由渲染器合成；如果你需要真正的 Bold，
  把 `SourceHanSansSC-Bold.ttf` 放进 `fonts/`，并在 `export-doc.js` 的
  `fontConfig` 里再注册一条 `fontWeight: 700`。
- 移动端只做「整页缩放到宽度」，正文会很小；这是桌面写作工具。


## 六、字体与第三方

- `fonts/SourceHanSansSC-Regular.ttf` 来自 dompdf.js 示例仓库，
  Source Han Sans 使用 SIL Open Font License 1.1。
- dompdf.js — MIT；CodeMirror 5 — MIT；marked — MIT；DOMPurify — MPL-2.0 / Apache-2.0。
  许可文本见各自的上游仓库。

## 七、部署为纯静态站点

墨页没有后端：字体、WASM、Worker、PDF 写入全部在浏览器里完成，放到 GitHub Pages
或任意静态空间就能用。构建脚本只做拷贝，不打包、不压缩。

```bash
node build.mjs                            # → dist/
node build.mjs --out docs                 # → docs/，适合 Pages 的「分支 /docs」
node build.mjs --domain md.example.com    # 额外生成 CNAME
node serve.mjs --dir dist --port 8899     # 本地验证发布产物
```

### GitHub Pages（Actions，推荐）

把 `md-pdf/` 当作仓库根目录推送，在 Settings → Pages → Source 选择
**GitHub Actions**。已带 `.github/workflows/pages.yml`：push 后自动
`node build.mjs` 并发布 `dist/`。

如果它只是大仓库里的一个子目录，按 workflow 里的注释改两处：
`working-directory: md-pdf` 和 `path: md-pdf/dist`；同时把 workflow 文件从
`md-pdf/.github/workflows/` 移到仓库根的 `.github/workflows/`（GitHub 只读根目录）。

项目站地址是 `https://<user>.github.io/<repo>/`。所有资源都是相对路径，
子路径部署不需要改任何配置；把整个目录一起部署，不要拆散 `styles/ vendor/ fonts/`。

### GitHub Pages（分支 /docs）

```bash
node build.mjs --out docs
git add docs && git commit -m "build md-pdf"
```

Settings → Pages → Source: Deploy from a branch → `main` / `/docs`。
`.nojekyll` 已自动生成，Jekyll 不会碰这些文件。

### 自定义域名

```bash
node build.mjs --domain md.example.com
```

也可以在 Pages 设置里直接填。DNS：

- 子域名：`CNAME` 指向 `<user>.github.io`
- 顶级域：`A` 记录指向 GitHub Pages 的地址（以 GitHub 文档为准）
- 最后开启 **Enforce HTTPS**

### 体积与字体裁剪

首屏约 **5.6MB**，其中 4.5MB 是思源黑体；HTTP 缓存后再次访问很快，导出的 PDF 只有几十到
一百多 KB。如果要给公网省流量，可以按用字裁剪字体：

```bash
pip install fonttools
pyftsubset fonts/SourceHanSansSC-Regular.ttf \
  --text-file=报告用字.txt \
  --unicodes="U+0020-007E,U+00A0-00FF,U+3000-303F" \
  --output-file=fonts/SourceHanSansSC-Regular.ttf
```

字体名不变，`@font-face` 和 `fontConfig` 都不用改。裁掉的字在 PDF 里会缺字，
按你的文档实际用字确认后再上线。

> 不要用 `file://` 直接打开部署后的 `index.html`；字体和 Worker 需要 HTTP(S)。GitHub Pages
> 自带 HTTPS，本地用 `serve.mjs`。
