/* themes.js — document style presets shared by the editor and the CLI.
   Each theme is plain CSS scoped to .pdf-doc, plus the page background and
   the header/footer colours used by dompdf's pageConfig. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MOYE_THEMES = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    paper: {
      label: "纸张（默认）",
      background: "#ffffff",
      headerColor: "#6b7279",
      footerColor: "#8a9199",
      css: "",
    },

    editorial: {
      label: "刊物",
      background: "#fdfbf7",
      headerColor: "#6b6153",
      footerColor: "#8a8172",
      css: `
.pdf-doc {
  font-size: 15.5px;
  line-height: 1.9;
  --accent: #8a3b22;
}
.pdf-doc h1 {
  font-size: 31px;
  letter-spacing: -0.015em;
  border-bottom: 2px solid #231f1a;
  padding-bottom: 16px;
}
.pdf-doc h2 {
  font-size: 20px;
  border-bottom-color: #e3ddd2;
}
.pdf-doc blockquote {
  border-left-color: #c8b9a5;
  color: #4a4238;
}
.pdf-doc thead th {
  background: #f3ede2;
}
.pdf-doc tbody tr:nth-child(even) td {
  background: #fbf8f2;
}
.pdf-doc th,
.pdf-doc td {
  border-color: #ddd4c6;
}
.pdf-doc code,
.pdf-doc pre {
  background: #f6f1e8;
}
.pdf-doc pre {
  border-color: #e6ddcf;
}
`,
    },

    compact: {
      label: "紧凑",
      background: "#ffffff",
      headerColor: "#6b7279",
      footerColor: "#8a9199",
      css: `
.pdf-doc {
  font-size: 13.5px;
  line-height: 1.62;
}
.pdf-doc h1 {
  font-size: 21px;
  padding-bottom: 9px;
}
.pdf-doc h2 {
  font-size: 16.5px;
  padding-bottom: 3px;
}
.pdf-doc h3 {
  font-size: 14.5px;
}
.pdf-doc h4,
.pdf-doc h5,
.pdf-doc h6 {
  font-size: 13.5px;
}
.pdf-doc p {
  margin-bottom: 0.55em;
}
.pdf-doc ul,
.pdf-doc ol {
  margin-bottom: 0.6em;
}
.pdf-doc li {
  margin: 0.1em 0;
}
.pdf-doc table {
  font-size: 12.5px;
}
.pdf-doc th,
.pdf-doc td {
  padding: 4px 8px;
}
.pdf-doc pre {
  padding: 9px 11px;
  font-size: 11.5px;
  line-height: 1.55;
}
.pdf-doc blockquote {
  margin: 0.7em 0;
}
.pdf-doc hr {
  margin: 1.2em 0;
}
`,
    },

    dark: {
      label: "石墨（深色）",
      background: "#0d1117",
      headerColor: "#8b949e",
      footerColor: "#6e7681",
      css: `
.pdf-doc {
  --ink: #e6edf3;
  --ink-soft: #c9d1d9;
  --muted: #9aa4ad;
  --rule: #30363d;
  --rule-soft: #21262d;
  --wash: #161b22;
  --accent: #7ee2b8;
  color: #e6edf3;
}
.pdf-doc h1,
.pdf-doc h2,
.pdf-doc h3,
.pdf-doc h4 {
  color: #e6edf3;
}
.pdf-doc h1 {
  border-bottom-color: #30363d;
}
.pdf-doc h2 {
  border-bottom-color: #21262d;
}
.pdf-doc h5,
.pdf-doc h6 {
  color: #c9d1d9;
}
.pdf-doc strong {
  color: #ffffff;
}
.pdf-doc a {
  color: #7ee2b8;
}
.pdf-doc blockquote {
  border-left-color: #3d444d;
  color: #b1bac4;
}
.pdf-doc hr {
  border-top-color: #30363d;
}
.pdf-doc th,
.pdf-doc td {
  border-color: #30363d;
}
.pdf-doc thead th {
  background: #161b22;
  color: #e6edf3;
}
.pdf-doc tbody tr:nth-child(even) td {
  background: #1b2129;
}
.pdf-doc table caption,
.pdf-doc figcaption,
.pdf-doc small {
  color: #9aa4ad;
}
.pdf-doc code {
  background: #161b22;
}
.pdf-doc pre {
  background: #161b22;
  border-color: #30363d;
}
.pdf-doc kbd {
  background: #161b22;
  border-color: #30363d;
  color: #e6edf3;
}
.pdf-doc mark {
  background: #3b2f00;
  color: #f0d58a;
}
.pdf-doc li::marker {
  color: #6e7681;
}
.pdf-doc li.task-list-item input[type="checkbox"] {
  accent-color: #7ee2b8;
}
`,
    },
  };
});
