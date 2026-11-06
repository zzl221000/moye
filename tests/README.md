# 测试

本仓库有三条验证线：写作面冒烟、共享渲染快照、PDF 导出基线。

## 写作面冒烟

jsdom 不做布局，MSFE 写作面无法在单元测试里挂载。`tests/smoke-writing.mjs` 用真实的无头 Chrome/Edge 验证写作面：

```bash
bun run smoke:writing
```

需要留档时，可保存两张截图：

```bash
MOYE_SMOKE_SCREENSHOT=writing.png MOYE_SMOKE_SCREENSHOT_EMPTY=empty.png bun run smoke:writing
```

脚本会启动 Vite 开发服务器，挂载 MSFE live 写作面，载入示例，替换为包含中文标题、表格、任务列表、代码块与长链接的 fixture，检查 live 投影与右侧版式预览，然后拖动分隔条并断言比例写入 `localStorage`；接着用页面内的假文件句柄驱动 `Ctrl+S` 写回、`Ctrl+Shift+S` 另存与 `Ctrl+O` 打开，拖入一个 Markdown 文件，确认顶栏文件名可编辑，再用 `Ctrl+Shift+E` 触发导出并检查进度条与下载的 PDF；键入 `中文 ABC 123` 后等待草稿写入，刷新页面并断言 `getMarkdown()`、文件名与分栏比例都恢复；最后键入一份长文档，断言预览出现新标题、状态栏字数增长且页数估算随内容高度增加。窗口改为 800px 宽时还会断言写作面在上、预览在下、分隔条隐藏。插入按钮的检查（链接、图片、表格、代码块的标准 Markdown、链接对话框的 Enter/Escape 与焦点回归、表格替换选区、代码块包裹选区）也在同一脚本内。

前置条件：

- Node.js 22+（脚本使用内置 `WebSocket` 驱动 DevTools）。
- 本机安装 Chrome 或 Edge；找不到时用 `CHROME_PATH` 指向可执行文件。

它不在 `bun run test` 里运行，因为浏览器不是单元测试环境的依赖。`bun run test` 只覆盖纯函数：文件名归一化、PDF 文件名、草稿读写、文件句柄能力降级、分栏比例的夹取与持久化、字数统计、页数估算，以及纸型尺寸与冻结导出表的契约。

## 应用端到端导出

应用侧还有两处测试：

- `tests/render.test.ts`：共享渲染接缝（`src/doc/render.ts`）的快照测试，覆盖 `simple`、`mixed`、`long` 三份 fixture；快照在 `tests/__snapshots__/`。
- `tests/e2e.mjs`：在构建后的应用里真实点击导出，校验下载的 PDF；见下文。

```bash
bun run test:e2e            # 先 vite build，再跑应用导出
node tests/e2e.mjs          # 假设 dist/ 已经是最新构建
node tests/e2e.mjs --keep   # 保留下载的 PDF 与临时 Chrome 目录
node tests/e2e.mjs --ci     # CI 模式：页数 + 关键文本
```

它会：

1. 用 Node 内置 HTTP 服务把 `dist/` 挂在 Pages base `/moye/` 下；fixture 图片由测试服务单独映射，生产构建里不包含 fixture。
2. 启动无头 Chrome（默认 `C:\Program Files\Google\Chrome\Application\chrome.exe`，可用 `CHROME_PATH` 覆盖）；
3. 打开构建产物，把 `mixed.md` 写入 `localStorage` 草稿并刷新，等待版式预览渲染出这份文档、字体与图片就绪；
4. 点击 `[data-action="export"]`；
5. 通过 `Browser.setDownloadBehavior` 接收浏览器下载的 PDF；
6. 用与 `tests/compare.mjs` 相同的页数优先级和 `pdftotext -enc UTF-8` 规则，与 `tests/golden/mixed.json` 比对。

第 3 步是必要的：版式预览现在跟随当前文档，构建产物不再内置固定 fixture，草稿是应用里能触发同一渲染路径的公开入口。

退出码：`0` 通过；`1` PDF 或文本不匹配；`2` 缺少构建、Chrome、`pdftotext` 或参数错误。

`--ci` 只断言页数与 13 段关键文本（去掉所有空白后做子串匹配）。不同 `pdftotext` 实现可能改变换行位置，所以 CI 用这个模式；本地默认模式仍做逐页精确比对。

`bun run test` 不包含端到端导出；它跑共享接缝的三份 fixture 快照。

## PDF 导出基线

这组测试把“当前导出链路的输出”固定成黄金值：给定一份 Markdown，导出后的**页数**与**提取文本**必须与黄金文件一致。它用于重写写作面与应用外壳期间确认导出行为没有变化，不做像素比对。

黄金值捕获于 `rewrite/quirekit@1a2ba5b`（2026-11-06），即重写开始前的实现。

### 目录

```
tests/
  fixtures/
    simple.md        简单文档：标题、段落、行内标记、列表、引用
    mixed.md         混合结构：多级标题、列表、引用、表格、代码块、
                     任务列表、长 token、图片
    long.md          长文档：10 章，跨 5 页
    multi-h1.md      版式选项单测用，不参与 PDF 基线
    assets/block.png 本地图片，不依赖网络
  golden/
    simple.json      页数 + 逐页提取文本
    mixed.json
    long.json
  compare.mjs        导出、提取、比对（CLI）
  e2e.mjs            构建产物 → 无头 Chrome → 导出下载 → 比对 mixed
  README.md
```

### 前置条件

- Node.js 22+（`export.mjs` 使用内置 `WebSocket` 驱动 Chrome）。
- 本机安装 Chrome 或 Edge。找不到时用 `CHROME_PATH` 指向可执行文件。
- `pdftotext`（poppler-utils 或 xpdf）在 `PATH` 上；也可用 `PDFTOTEXT_PATH` 指定。
- `pdfinfo` 可选。存在时用于读取页数；不存在时回退到解析 PDF 结构。

### 运行比对

```bash
node tests/compare.mjs
```

- 全部匹配：退出码 `0`。
- 页数或文本不匹配：退出码 `1`，并打印以 `pN |` 标注页码的 diff。
- 环境缺失（没有 fixture、没有 `pdftotext` 等）：退出码 `2`。

常用选项：

```bash
node tests/compare.mjs --keep              # 保留临时目录中的 PDF / txt
node tests/compare.mjs --update --source rewrite/quirekit
```

`--update` 是重新生成黄金值的唯一方式；`--source` 只影响黄金文件里记录的版本来源。

### 页数从哪里来

`compare.mjs` 按以下顺序取页数，并在运行时打印实际使用的来源：

1. `pdfinfo` 的 `Pages:` 字段（装了 `pdfinfo` 时）。
2. PDF 字节中的 `/Type /Page` 对象数量（与 `export.mjs` 的 `countPages()` 相同）。
3. 页面树的 `/Count N`。
4. CLI 输出的 `N 页`。
5. `pdftotext` 的换页符数量（最后手段）。

本仓库的黄金值是在**没有 `pdfinfo`** 的机器上捕获的，因此使用了第 2 种：`/Type /Page` 对象数量。安装 `pdfinfo` 后重跑，页数应当相同，只是来源标签变成 `pdfinfo`；这不影响比对。

文本统一用 `pdftotext -enc UTF-8 <pdf> <txt>` 提取，按换页符 `\f` 拆成逐页字符串。每页会去掉行尾空白和首尾空行，除此之外不做归一化。

### 黄金值格式

```json
{
  "fixture": "tests/fixtures/simple.md",
  "pageCount": 1,
  "capturedFrom": { "branch": "rewrite/quirekit", "commit": "1a2ba5b" },
  "pages": ["第一页文本", "第二页文本"]
}
```

- `pageCount` 来自 PDF 本身，独立于文本提取；空白页也会被计入。
- `pages` 是 `pdftotext` 的逐页文本。`pages.length` 必须等于 `pageCount`，否则脚本按环境错误处理。
- `capturedFrom` 只作溯源，不参与比对。

### 预期变化后如何更新黄金值

只有**有意的导出行为变化**才更新黄金值。步骤：

1. 先跑 `node tests/compare.mjs`，确认失败原因与改动一致。
2. 重新生成：

   ```bash
   node tests/compare.mjs --update --source <当前实现分支或 commit>
   ```

3. 审阅 `git diff tests/golden/`。页数变化、文本增删、页眉页脚变化都应当能解释。
4. 如果 fixture 本身变了，把 fixture 与黄金值放在同一个 commit 里。
5. 提交后跑一次普通比对，确认干净通过。

不要为了“让测试变绿”而直接更新黄金值；先确认差异来自预期的导出改动，而不是环境或依赖漂移。

### 环境差异

- 黄金文本由 **Xpdf 4.00 的 `pdftotext`** 捕获。不同实现（例如 poppler 的不同版本）可能改变换行位置、列表符号或空白；若脚本提示“仅空白/换行不同”，优先在与捕获时一致的工具链上复核。
- 文本提取依赖 PDF 内嵌字体；仓库自带 `fonts/SourceHanSansSC-Regular.ttf`，导出不访问网络。
- 不比较 PDF 字节：dompdf 会写入时间等元数据，字节级比对没有意义；页数与文本才是稳定的外部行为。

### CI 提示

CI 需要：Node 22+、Chrome/Edge（可设 `CHROME_PATH`）、`pdftotext`（通常来自 `poppler-utils`）。

```bash
node tests/compare.mjs      # CLI 基线
bun run test:e2e            # 应用导出（精确文本）
node tests/e2e.mjs --ci     # 应用导出（页数 + 关键文本，GitHub Actions 使用）
```

不需要 `npm install`，也不访问网络（安装依赖与 Chrome 除外）。
