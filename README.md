# 墨页 · Markdown → PDF

本地优先的 Markdown 写作面与 PDF 导出工具。写作面是 QuireKit MSFE 的 live 呈现，右侧版式预览与导出共用同一份渲染结果，PDF 由 dompdf.js 在浏览器内生成。

运行时不访问网络：应用、字体、Markdown 解析器与 PDF 内核都是同源静态资源，文档内容不离开本机。只有 Markdown 里显式写出的远程图片会按原 URL 请求。

## 目录

```
moye/
├─ index.html
├─ src/
│  ├─ main.tsx            应用入口
│  ├─ App.tsx             外壳装配与状态
│  ├─ doc/                渲染接缝、导出、设置、纸型、页数估算
│  ├─ shell/              顶栏、写作面、插入栏、版式预览、设置、状态栏
│  ├─ writing/            草稿、文件读写、插入、统计
│  └─ styles/             设计 token 与应用样式
├─ styles/
│  ├─ doc.css             文档/PDF 排版（冻结）
│  └─ export-host.css     预览与导出的字体注册（冻结）
├─ export-doc.js          浏览器导出核心（冻结）
├─ prepare.js             导出前处理（冻结）
├─ themes.js              文档主题（冻结）
├─ export.mjs             CLI：Markdown → PDF
├─ vendor/                dompdf.js、marked、DOMPurify（冻结）
├─ fonts/                 思源黑体与 OFL
├─ tests/                 渲染快照、PDF 基线、端到端导出、写作面冒烟
├─ vite-plugins/          冻结资源的开发服务与构建输出
└─ .github/workflows/pages.yml
```

## 开发

使用 bun 1.3.13；测试与 CLI 需要 Node.js 22+。

```bash
bun install
bun run dev             # http://localhost:5173/moye/
bun run build           # → dist/
bun run preview         # 预览 dist/，同样在 /moye/
bun run typecheck
bun run test
bun run test:e2e        # 构建 → 无头浏览器 → 导出 PDF → 比对基线
bun run smoke:writing   # 写作面冒烟，需要 Chrome/Edge
```

`test:e2e` 还需要 `pdftotext`（poppler-utils 或 xpdf）。`CHROME_PATH` 可指定 Chrome/Edge 路径。

工具链锁定精确版本：`solid-js@2.0.0-rc.21`、`@solidjs/web@2.0.0-rc.21`、`@solidjs/vite-plugin@3.0.0-next.56`、`vite@8.3.6`、`vitest@5.1.0`、`typescript@5.9.3`、`jsdom@31.0.0`、`@types/node@26.6.6`、`@quirekit/msfe-core@0.0.1`、`@quirekit/msfe-starter-kit@0.0.1`。升级是单独的决定，需要同时更新 `bun.lock`。

## 使用

打开：顶栏「打开」、`Ctrl/⌘ O`，或把 `.md` 文件拖进窗口。保存：`Ctrl/⌘ S` 写回原文件，`Ctrl/⌘ ⇧ S` 另存。导出：顶栏「导出 PDF」。

设置分三组：纸张（纸张、页边距）、版式（页眉标题、页脚页码、首页不显示页眉页脚、一级标题另起页）、文档（文档主题、页面背景、细节 CSS、压缩 PDF 体积）。

Chrome / Edge 在 HTTPS 或 localhost 下通过 File System Access API 写回原文件；Firefox / Safari 降级为下载副本。文件句柄只在当前会话有效，刷新后需要重新打开文件；草稿自动保存在 localStorage。

窄屏下写作面在上、版式预览在下。分栏比例、设置与草稿都保存在 localStorage。

## 命令行导出（Zed / 脚本 / CI）

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

CLI 起一个临时 HTTP 服务，用 headless Chrome 打开导出页，再调用 dompdf.js 把 base64 PDF 写回磁盘。需要 **Node 22+**；找不到 Chrome 时设置 `CHROME_PATH`（Edge 也可以）。Markdown 里的相对图片路径按 `.md` 所在目录解析。

## 在 Zed 中使用

本目录自带 `.zed/tasks.json`。若墨页位于子目录，把参数改成 `$ZED_WORKTREE_ROOT/md-pdf/export.mjs`：

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

在 Zed 里对 Markdown 文件执行 `task: spawn`，选择 “Markdown → PDF (dompdf)”。

## 导出链路

- 预览与导出共用 `src/doc/render.ts`：Markdown 经 marked 解析、DOMPurify 净化，得到 `.pdf-doc` HTML。
- 导出时把同一份 HTML 交给冻结的 `export-doc.js` 与 `vendor/dompdf.min.js`；分页只由 dompdf 决定，预览不模拟页边界。
- CLI `export.mjs` 在 headless Chrome 里运行同一条链路。
- `themes.js` 提供文档主题，`styles/doc.css` 是预览与 PDF 共用的文档排版。

## 已知限制

- 跨页表格不会重复表头，长表格的第二页直接从数据行开始。
- File System Access API 只有 Chromium 系完整支持，写回需要 HTTPS 或 localhost。
- 状态栏页数由预览高度估算，最终页数以 dompdf 导出为准。
- 不支持 Mermaid、KaTeX、Obsidian 双链等扩展语法；新增语法需要扩展共享渲染接缝。
- 远程图片需要服务端返回 CORS 头，否则会被跳过。
- 字体只打包了思源黑体 Regular，粗体由渲染器合成。

## 部署

项目站地址是 `https://zzl221000.github.io/moye/`。`vite.config.mts` 的 `PAGES_BASE` 为 `/moye/`，开发、预览与构建产物使用同一路径，子路径部署不需要额外配置。

`.github/workflows/pages.yml` 在 push 到 `main` / `master` 时执行 `bun install --frozen-lockfile` 与 `bun run build`，发布 `dist/`。在仓库 Settings → Pages → Source 选择 **GitHub Actions**。

如果墨页只是大仓库里的一个子目录，需要在 workflow 里设置 `working-directory`、调整 artifact 路径，并把 workflow 移到仓库根的 `.github/workflows/`。

构建产物是纯静态文件，`public/.nojekyll` 会复制进 `dist/`，不需要服务端。

## 字体与第三方

`fonts/SourceHanSansSC-Regular.ttf` 来自 dompdf.js 示例仓库，使用 SIL Open Font License 1.1，完整文本在 `fonts/OFL.txt`。

运行时的 dompdf.js、marked、DOMPurify，QuireKit MSFE 与 Solid，以及构建期的 Vite、TypeScript、Vitest 等许可见 `THIRD-PARTY.md`。
