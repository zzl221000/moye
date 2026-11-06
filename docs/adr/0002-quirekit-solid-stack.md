# 写作面采用 QuireKit MSFE，应用外壳采用 Solid 2.0 RC

写作面需要从源码编辑器升级为 live 呈现，而 PDF 导出必须保持不变。选择 `@quirekit/msfe-core` 而不是完整的编辑器壳，因为它框架中立、无 peer 依赖，边界最干净；选择 Solid 2.0 RC 是因为官方已把它作为下一版本，而外壳要从零写，迁移成本只发生一次。

## Consequences

- 全部依赖锁定精确版本：`solid-js@2.0.0-rc.21`、`@solidjs/web@2.0.0-rc.21`、`@solidjs/vite-plugin@3.0.0-next.56`、`vite@8.3.6`。
- 不做自动升级；升级是单独的决定。
- QuireKit 处于 `0.0.1`，API 变化由本仓库的适配层吸收。

## Considered Options

- 保留 vanilla + CodeMirror 5：改动最小，但拿不到 live 呈现。
- 使用 `@quirekit/md-editor`：自带 44 个依赖与工具栏，超出需要。
- 使用 `@quirekit/ui` 组件：JS 入口依赖 Vue，与 Solid 冲突，只取其语义 token。
