# PDF 导出基线

这组测试把“当前导出链路的输出”固定成黄金值：给定一份 Markdown，导出后的**页数**与**提取文本**必须与黄金文件一致。它用于重写写作面与应用外壳期间确认导出行为没有变化，不做像素比对。

黄金值捕获于 `rewrite/quirekit@1a2ba5b`（2026-11-06），即重写开始前的实现。

## 目录

```
tests/
  fixtures/
    simple.md        简单文档：标题、段落、行内标记、列表、引用
    mixed.md         混合结构：多级标题、列表、引用、表格、代码块、
                     任务列表、长 token、图片
    long.md          长文档：10 章，跨 5 页
    assets/block.png 本地图片，不依赖网络
  golden/
    simple.json      页数 + 逐页提取文本
    mixed.json
    long.json
  compare.mjs        导出、提取、比对
  README.md
```

## 前置条件

- Node.js 22+（`export.mjs` 使用内置 `WebSocket` 驱动 Chrome）。
- 本机安装 Chrome 或 Edge。找不到时用 `CHROME_PATH` 指向可执行文件。
- `pdftotext`（poppler-utils 或 xpdf）在 `PATH` 上；也可用 `PDFTOTEXT_PATH` 指定。
- `pdfinfo` 可选。存在时用于读取页数；不存在时回退到解析 PDF 结构。

## 运行比对

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

## 页数从哪里来

`compare.mjs` 按以下顺序取页数，并在运行时打印实际使用的来源：

1. `pdfinfo` 的 `Pages:` 字段（装了 `pdfinfo` 时）。
2. PDF 字节中的 `/Type /Page` 对象数量（与 `export.mjs` 的 `countPages()` 相同）。
3. 页面树的 `/Count N`。
4. CLI 输出的 `N 页`。
5. `pdftotext` 的换页符数量（最后手段）。

本仓库的黄金值是在**没有 `pdfinfo`** 的机器上捕获的，因此使用了第 2 种：`/Type /Page` 对象数量。安装 `pdfinfo` 后重跑，页数应当相同，只是来源标签变成 `pdfinfo`；这不影响比对。

文本统一用 `pdftotext -enc UTF-8 <pdf> <txt>` 提取，按换页符 `\f` 拆成逐页字符串。每页会去掉行尾空白和首尾空行，除此之外不做归一化。

## 黄金值格式

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

## 预期变化后如何更新黄金值

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

## 环境差异

- 黄金文本由 **Xpdf 4.00 的 `pdftotext`** 捕获。不同实现（例如 poppler 的不同版本）可能改变换行位置、列表符号或空白；若脚本提示“仅空白/换行不同”，优先在与捕获时一致的工具链上复核。
- 文本提取依赖 PDF 内嵌字体；仓库自带 `fonts/SourceHanSansSC-Regular.ttf`，导出不访问网络。
- 不比较 PDF 字节：dompdf 会写入时间等元数据，字节级比对没有意义；页数与文本才是稳定的外部行为。

## CI 提示

CI 需要：Node 22+、Chrome/Edge（可设 `CHROME_PATH`）、`pdftotext`（通常来自 `poppler-utils`）。命令就是：

```bash
node tests/compare.mjs
```

不需要 `npm install`，也不访问网络。
