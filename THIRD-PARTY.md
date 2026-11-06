# Third-party notices

墨页在 `vendor/` 中直接分发三个运行时文件，并以 npm 依赖的形式使用 QuireKit MSFE、Solid 与构建工具链。各组件的许可仍归其作者所有。

## Vendored runtime

| Library | Version | License | Upstream |
| --- | --- | --- | --- |
| dompdf.js | 2.0.7 | MIT | https://github.com/lmn1919/dompdf.js |
| marked | 12.0.2 | MIT | https://github.com/markedjs/marked |
| DOMPurify | 3.1.6 | MPL-2.0 OR Apache-2.0 | https://github.com/cure53/DOMPurify |

## Runtime dependencies

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| `@quirekit/msfe-core` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `@quirekit/msfe-starter-kit` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `@quirekit/msfe-bold` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `@quirekit/msfe-code-block` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `@quirekit/msfe-heading` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `@quirekit/msfe-image` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `@quirekit/msfe-link` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `@quirekit/msfe-prose` | 0.0.1 | MIT | https://github.com/quirekit/quirekit |
| `solid-js` | 2.0.0-rc.21 | MIT | https://github.com/solidjs/solid |
| `@solidjs/web` | 2.0.0-rc.21 | MIT | https://github.com/solidjs/solid |

QuireKit 的 `@quirekit/cm-*`、`@quirekit/lezer-markdown` 与 `@quirekit/ime` 是其传递依赖，均为 MIT，派生自 CodeMirror 6 / Lezer，版权归 Marijn Haverbeke 及其他贡献者。QuireKit 各包自带的 `THIRD_PARTY_NOTICES.md` 保留完整的上游声明。

## Build-time dependencies

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| `@solidjs/vite-plugin` | 3.0.0-next.56 | MIT | https://github.com/solidjs/solid-start |
| `vite` | 8.3.6 | MIT | https://github.com/vitejs/vite |
| `vitest` | 5.1.0 | MIT | https://github.com/vitest-dev/vitest |
| `typescript` | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| `jsdom` | 31.0.0 | MIT | https://github.com/jsdom/jsdom |
| `@types/node` | 26.6.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

TypeScript 以 Apache License 2.0 分发，完整文本见 https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt。

## Font

The bundled Chinese font is **Source Han Sans SC Regular** (思源黑体):

| Asset | License | Upstream |
| --- | --- | --- |
| `fonts/SourceHanSansSC-Regular.ttf` | SIL Open Font License 1.1 | https://github.com/adobe-fonts/source-han-sans |

The full OFL text is in `fonts/OFL.txt`.

---

## MIT License

Copyright (c) their respective authors, including:

- dompdf.js — Copyright (c) 2026 lfc
- marked — Copyright (c) 2018+, MarkedJS and contributors
- QuireKit — Copyright (c) 2026 Wang Yishuai (王一帅) and QuireKit contributors
- CodeMirror / Lezer — Copyright (C) by Marijn Haverbeke and others
- Solid — Copyright (c) Ryan Carniato and Solid contributors
- Vite — Copyright (c) 2019-present, VoidZero Inc. and Vite contributors
- Vitest — Copyright (c) 2021-present, VoidZero Inc. and Vitest contributors
- jsdom — Copyright (c) 2010 Elijah Insua
- @types/node — Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
