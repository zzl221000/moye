/* 墨页 — editor wiring. No build step, no framework. */
(function () {
  "use strict";

  var STORAGE_DRAFT = "moye.draft.v1";
  var STORAGE_OPTIONS = "moye.options.v1";
  var STORAGE_SPLIT = "moye.split.v1";

  var SAMPLE = [
    "# 季度经营分析",
    "",
    "> 数据截至 2026-06-30，金额单位为万元。右侧就是导出时的 PDF 版式。",
    "",
    "## 结论摘要",
    "",
    "营收同比增长 **18.4%**，主要由内容营销与效果广告两条业务线拉动。毛利率维持在 `62.1%`，环比提升 1.8 个百分点。",
    "",
    "1. 新客户贡献收入 1,840 万元，占总增量的 54%。",
    "2. 老客户续约率 78%，高于年度目标 3 个百分点。",
    "3. 交付成本下降 6.2%，主要来自素材自动化。",
    "",
    "## 指标明细",
    "",
    "| 指标 | 本期 | 上期 | 变动 |",
    "| --- | ---: | ---: | ---: |",
    "| 营业收入 | 12,480 | 10,540 | +18.4% |",
    "| 毛利率 | 62.1% | 60.3% | +1.8pp |",
    "| 经营性现金流 | 2,130 | 1,420 | +50.0% |",
    "",
    "## 导出示例",
    "",
    "```ts",
    "const blob = await dompdf(document.querySelector('#doc'), {",
    "  format: 'a4',",
    "  pagination: true,",
    "  marginPt: [36, 36, 36, 36],",
    "});",
    "```",
    "",
    "长链接不会被裁切：https://example.com/reports/2026/q2/quarterly-business-review-with-a-very-long-slug-that-wraps-inside-the-page",
    "",
    "- [x] 校验中文字体嵌入",
    "- [x] 校验表格与代码块换行",
    "- [ ] 补充图表与附录",
    "",
    "---",
    "",
    "### 备注",
    "",
    "页眉页脚、纸张与页边距都可以在右上角的设置里调整；导出后点击提示里的「打开」即可检查成稿。",
  ].join("\n");

  var DEFAULT_OPTIONS = {
    paper: "a4",
    margin: "36",
    title: "",
    footer: true,
    cover: true,
    h1Break: false,
    compress: true,
    theme: "paper",
    background: "#ffffff",
    css: "",
    sync: true,
  };

  var $ = function (id) {
    return document.getElementById(id);
  };

  var els = {
    workbench: $("workbench"),
    editorHost: $("editorHost"),
    previewPane: $("previewPane"),
    paper: $("paper"),
    doc: $("doc"),
    emptyState: $("emptyState"),
    fileName: $("fileName"),
    statusText: $("statusText"),
    statusDot: $("statusDot"),
    statusFile: $("statusFile"),
    statusHint: $("statusHint"),
    statPages: $("statPages"),
    statWords: $("statWords"),
    statLines: $("statLines"),
    openBtn: $("openBtn"),
    saveBtn: $("saveBtn"),
    exportBtn: $("exportBtn"),
    exportLabel: $("exportLabel"),
    settingsBtn: $("settingsBtn"),
    settingsPanel: $("settingsPanel"),
    closeSettings: $("closeSettings"),
    progress: $("progress"),
    progressBar: $("progressBar"),
    toastStack: $("toastStack"),
    fileInput: $("fileInput"),
    sampleBtn: $("sampleBtn"),
    gutter: $("gutter"),
    fontState: $("fontState"),
    optPaper: $("optPaper"),
    optMargin: $("optMargin"),
    optTitle: $("optTitle"),
    optFooter: $("optFooter"),
    optCover: $("optCover"),
    optH1Break: $("optH1Break"),
    optCompress: $("optCompress"),
    optTheme: $("optTheme"),
    optBg: $("optBg"),
    optCss: $("optCss"),
    optSync: $("optSync"),
    clearCss: $("clearCss"),
    docTheme: $("docTheme"),
    fsState: $("fsState"),
  };

  var options = loadOptions();
  var fontBytes = null;
  var fontPromise = null;
  var exporting = false;
  var lastPages = 0;
  var renderTimer = 0;
  var saveTimer = 0;
  var cssTimer = 0;
  var progressHideTimer = 0;
  var saving = false;
  var dirty = false;
  var fileHandle = null;
  var syncSuppress = null;

  var canOpenWithPicker = typeof window.showOpenFilePicker === "function";
  var canSaveWithPicker = typeof window.showSaveFilePicker === "function";

  var MARKDOWN_TYPES = [
    {
      description: "Markdown",
      accept: {
        "text/markdown": [".md", ".markdown"],
        "text/plain": [".txt"],
      },
    },
  ];

  /* ---------------------------------------------------------------- editor */

  var cm = CodeMirror(els.editorHost, {
    value: "",
    mode: "gfm",
    lineWrapping: true,
    styleActiveLine: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    lineNumbers: false,
    cursorBlinkRate: 530,
    extraKeys: {
      Tab: function (editor) {
        editor.replaceSelection("  ");
      },
      "Shift-Tab": function (editor) {
        editor.execCommand("indentLess");
      },
      Enter: "newlineAndIndentContinueMarkdownList",
      "Ctrl-S": function () {
        saveMarkdown();
      },
      "Cmd-S": function () {
        saveMarkdown();
      },
      "Ctrl-Shift-S": function () {
        saveMarkdown(true);
      },
      "Cmd-Shift-S": function () {
        saveMarkdown(true);
      },
    },
  });

  cm.on("change", function () {
    markDirty();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderMarkdown, 90);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  });

  /* ---------------------------------------------------------------- render */

  marked.setOptions({ gfm: true, breaks: false });

  function renderMarkdown() {
    var markdown = cm.getValue();
    var empty = markdown.trim() === "";

    if (empty) {
      els.doc.innerHTML = "";
    } else {
      var html = marked.parse(markdown);
      els.doc.innerHTML = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["align", "target"],
      });
      Array.prototype.forEach.call(
        els.doc.querySelectorAll('input[type="checkbox"]'),
        function (box) {
          box.disabled = true;
          if (box.parentElement) box.parentElement.classList.add("task-list-item");
        }
      );
      Array.prototype.forEach.call(els.doc.querySelectorAll("a[href]"), function (a) {
        a.target = "_blank";
        a.rel = "noreferrer noopener";
      });

      var LONG_TOKEN = /[A-Za-z0-9_\-./:@?&=%+#]{24,}/;
      Array.prototype.forEach.call(els.doc.querySelectorAll("td, th"), function (cell) {
        if (LONG_TOKEN.test(cell.textContent || "")) {
          cell.classList.add("cell-wrap-anywhere");
        }
      });
    }

    els.paper.setAttribute("data-empty", empty ? "true" : "false");
    els.emptyState.hidden = !empty;

    updateStats(markdown);
  }

  function updateStats(markdown) {
    if (typeof markdown !== "string") markdown = cm.getValue();
    var chars = Array.from(markdown).length;
    var lines = markdown === "" ? 0 : markdown.split(/\r?\n/).length;
    els.statWords.textContent = formatNumber(chars) + " 字";
    els.statLines.textContent = formatNumber(lines) + " 行";

    var size = DocExport.metrics(options.paper, Number(options.margin));
    var hasBands = !!resolveHeaderTitle() || options.footer;
    var usable =
      size.heightPx - size.marginPx * 2 - (hasBands ? size.headerHeight + size.footerHeight : 0);
    var zoom = getZoom();
    var docHeight = els.doc.getBoundingClientRect().height / (zoom || 1);
    var pages = Math.max(1, Math.ceil(docHeight / Math.max(1, usable)));
    els.statPages.textContent = "≈ " + pages + " 页";
  }

  function formatNumber(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* --------------------------------------------------------------- options */

  function loadOptions() {
    try {
      var raw = localStorage.getItem(STORAGE_OPTIONS);
      if (!raw) return Object.assign({}, DEFAULT_OPTIONS);
      return Object.assign({}, DEFAULT_OPTIONS, JSON.parse(raw));
    } catch (error) {
      return Object.assign({}, DEFAULT_OPTIONS);
    }
  }

  function saveOptions() {
    try {
      localStorage.setItem(STORAGE_OPTIONS, JSON.stringify(options));
    } catch (error) {
      /* storage may be unavailable under file:// */
    }
  }

  function readOptionsFromControls() {
    return {
      paper: els.optPaper.value,
      margin: els.optMargin.value,
      title: els.optTitle.value.trim(),
      footer: els.optFooter.checked,
      cover: els.optCover.checked,
      h1Break: els.optH1Break.checked,
      compress: els.optCompress.checked,
      theme: els.optTheme.value || "paper",
      background: els.optBg.value || "#ffffff",
      css: els.optCss.value,
      sync: els.optSync.checked,
    };
  }

  function writeOptionsToControls() {
    els.optPaper.value = options.paper;
    els.optMargin.value = options.margin;
    els.optTitle.value = options.title;
    els.optFooter.checked = !!options.footer;
    els.optCover.checked = !!options.cover;
    els.optH1Break.checked = !!options.h1Break;
    els.optCompress.checked = !!options.compress;
    els.optSync.checked = options.sync !== false;
    els.optBg.value = options.background || "#ffffff";
    els.optCss.value = options.css || "";

    var themes = window.MOYE_THEMES || {};
    els.optTheme.value = themes[options.theme] ? options.theme : "paper";
  }

  function getTheme() {
    var themes = window.MOYE_THEMES || {};
    return themes[options.theme] || themes.paper || {
      label: "纸张",
      background: "#ffffff",
      headerColor: "#6b7279",
      footerColor: "#8a9199",
      css: "",
    };
  }

  function populateThemes() {
    var themes = window.MOYE_THEMES || {};
    els.optTheme.innerHTML = "";
    Object.keys(themes).forEach(function (key) {
      var option = document.createElement("option");
      option.value = key;
      option.textContent = themes[key].label || key;
      els.optTheme.appendChild(option);
    });
  }

  function isDark(color) {
    var match = /^#?([0-9a-f]{6})$/i.exec(String(color || ""));
    if (!match) return false;
    var value = parseInt(match[1], 16);
    var r = (value >> 16) & 255;
    var g = (value >> 8) & 255;
    var b = value & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  }

  function applyDocumentStyles() {
    var theme = getTheme();
    var background = options.background || theme.background || "#ffffff";

    els.docTheme.textContent =
      (theme.css ? theme.css + "\n" : "") + (options.css || "");

    els.paper.style.setProperty("--paper", background);
    els.paper.setAttribute("data-dark", isDark(background) ? "true" : "false");
    updateStats();
  }

  function applyPaperMetrics() {
    var size = DocExport.metrics(options.paper, Number(options.margin));
    els.paper.style.setProperty("--paper-w", size.widthPx + "px");
    els.paper.style.setProperty("--paper-h", size.heightPx + "px");
    els.paper.style.setProperty("--paper-pad", size.marginPx + "px");
    fitZoom();
    updateStats();
  }

  function fitZoom() {
    var size = DocExport.metrics(options.paper, Number(options.margin));
    var available = els.previewPane.clientWidth - 52;
    var zoom = Math.min(1, available / size.widthPx);
    zoom = Math.max(0.2, zoom);
    els.paper.style.setProperty("--zoom", String(Math.round(zoom * 1000) / 1000));
  }

  function getZoom() {
    return parseFloat(getComputedStyle(els.paper).zoom) || 1;
  }

  function resolveHeaderTitle() {
    if (options.title) return options.title;
    var match = cm.getValue().match(/^#\s+(.+)$/m);
    if (!match) return "";
    return match[1].replace(/[*_`~]/g, "").trim();
  }

  /* ---------------------------------------------------------------- status */

  function setStatus(text, state) {
    els.statusText.textContent = text;
    els.statusDot.setAttribute("data-state", state || "saved");
  }

  function markDirty() {
    dirty = true;
    setStatus("未保存", "dirty");
  }

  /* ----------------------------------------------------------------- toast */

  function showToast(title, detail, kind, actions) {
    kind = kind || "info";
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("data-kind", kind);
    toast.setAttribute("role", kind === "error" ? "alert" : "status");

    var icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.innerHTML =
      kind === "error"
        ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="7.5" x2="12" y2="12.5"/><line x1="12" y1="16.2" x2="12.01" y2="16.2"/></svg>'
        : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><polyline points="8 12.4 11 15.2 16 9.4"/></svg>';

    var body = document.createElement("div");
    body.className = "toast-body";

    var titleEl = document.createElement("span");
    titleEl.className = "toast-title";
    titleEl.textContent = title;
    body.appendChild(titleEl);

    if (detail) {
      var detailEl = document.createElement("span");
      detailEl.className = "toast-detail";
      detailEl.textContent = detail;
      body.appendChild(detailEl);
    }

    if (actions && actions.length) {
      var actionRow = document.createElement("div");
      actionRow.className = "toast-actions";
      actions.forEach(function (action) {
        var button = document.createElement("button");
        button.className = "toast-action";
        button.type = "button";
        button.textContent = action.label;
        if (action.primary) button.setAttribute("data-primary", "true");
        button.addEventListener("click", function () {
          try {
            action.onClick();
          } finally {
            if (!action.keepOpen) dismissToast(toast);
          }
        });
        actionRow.appendChild(button);
      });
      body.appendChild(actionRow);
    }

    var close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "关闭提示");
    close.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    close.addEventListener("click", function () {
      dismissToast(toast);
    });

    toast.appendChild(icon);
    toast.appendChild(body);
    toast.appendChild(close);
    els.toastStack.appendChild(toast);

    var timer = setTimeout(function () {
      dismissToast(toast);
    }, kind === "error" ? 12000 : 10000);

    toast.addEventListener("pointerenter", function () {
      clearTimeout(timer);
    });

    return toast;
  }

  function dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.transition = "opacity 140ms ease, transform 140ms ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(4px)";
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 150);
  }

  /* ------------------------------------------------------------- documents */

  function normalizeFileName(name) {
    var trimmed = (name || "").trim() || "未命名.md";
    return /\.(md|markdown|txt)$/i.test(trimmed) ? trimmed : trimmed + ".md";
  }

  function baseName(name) {
    return normalizeFileName(name)
      .replace(/\.(md|markdown|txt)$/i, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim();
  }

  function suggestFileName() {
    return normalizeFileName(els.fileName.value).replace(/[\\/:*?"<>|]/g, "-");
  }

  function loadText(text, name, handle) {
    fileHandle = handle || null;
    cm.setValue(text.replace(/\r\n/g, "\n"));
    cm.clearHistory();
    clearTimeout(renderTimer);
    clearTimeout(saveTimer);
    els.fileName.value = normalizeFileName(name);
    syncFileName();
    renderMarkdown();
    saveDraft();
    dirty = false;
    setStatus(
      fileHandle ? "已打开 " + fileHandle.name : "已载入 " + els.fileName.value,
      "saved"
    );
    cm.focus();
  }

  async function readFile(file, handle) {
    if (!/\.(md|markdown|txt)$/i.test(file.name) && file.type.indexOf("text") !== 0) {
      showToast("无法打开这个文件", "请选择 .md / .markdown / .txt 文件。", "error");
      return;
    }
    try {
      var text = await file.text();
      loadText(text, file.name, handle || null);
      showToast("已打开 " + file.name, null, "info");
    } catch (error) {
      showToast("读取文件失败", error.message, "error");
    }
  }

  async function openFile() {
    if (!canOpenWithPicker) {
      els.fileInput.value = "";
      els.fileInput.click();
      return;
    }
    try {
      var handles = await window.showOpenFilePicker({
        multiple: false,
        types: MARKDOWN_TYPES,
      });
      if (!handles || !handles[0]) return;
      var handle = handles[0];
      var file = await handle.getFile();
      await readFile(file, handle);
    } catch (error) {
      if (error && error.name === "AbortError") return;
      showToast("打开文件失败", error.message || String(error), "error");
    }
  }

  els.fileInput.addEventListener("change", function () {
    var file = els.fileInput.files && els.fileInput.files[0];
    if (!file) return;
    readFile(file, null);
  });

  async function ensurePermission(handle) {
    if (!handle || typeof handle.queryPermission !== "function") return true;
    var descriptor = { mode: "readwrite" };
    var state = await handle.queryPermission(descriptor);
    if (state === "granted") return true;
    state = await handle.requestPermission(descriptor);
    return state === "granted";
  }

  async function writeToHandle(handle, text) {
    var writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch (abortError) {
        /* ignore */
      }
      throw error;
    }
  }

  async function saveMarkdown(saveAs) {
    if (saving) return;
    saving = true;
    var text = cm.getValue();
    var name = suggestFileName();

    try {
      if (!saveAs && fileHandle) {
        if (!(await ensurePermission(fileHandle))) {
          showToast("没有写入权限", "浏览器拒绝了写回原文件，本次保存已取消。", "error");
          setStatus("没有写入权限", "error");
          return;
        }
        clearTimeout(saveTimer);
        await writeToHandle(fileHandle, text);
        els.fileName.value = normalizeFileName(fileHandle.name);
        syncFileName();
        dirty = false;
        saveDraft();
        setStatus("已保存到 " + fileHandle.name, "saved");
        return;
      }

      if (canSaveWithPicker) {
        var handle;
        try {
          handle = await window.showSaveFilePicker({
            suggestedName: name,
            types: MARKDOWN_TYPES,
          });
        } catch (error) {
          if (error && error.name === "AbortError") return;
          throw error;
        }
        clearTimeout(saveTimer);
        await writeToHandle(handle, text);
        fileHandle = handle;
        els.fileName.value = normalizeFileName(handle.name);
        syncFileName();
        dirty = false;
        saveDraft();
        setStatus("已保存到 " + handle.name, "saved");
        return;
      }

      clearTimeout(saveTimer);
      downloadBlob(new Blob([text], { type: "text/markdown;charset=utf-8" }), name);
      els.fileName.value = name;
      syncFileName();
      dirty = false;
      saveDraft();
      setStatus("已下载 " + name, "saved");
    } catch (error) {
      console.error(error);
      if (error && error.name === "AbortError") return;
      showToast("保存失败", error.message || String(error), "error");
      setStatus("保存失败", "error");
    } finally {
      saving = false;
    }
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  function saveDraft() {
    try {
      localStorage.setItem(
        STORAGE_DRAFT,
        JSON.stringify({
          name: normalizeFileName(els.fileName.value),
          content: cm.getValue(),
          at: Date.now(),
        })
      );
      if (!dirty) return;
      if (fileHandle) {
        setStatus("草稿已暂存", "dirty");
      } else {
        dirty = false;
        setStatus("已保存到本地", "saved");
      }
    } catch (error) {
      setStatus("本地草稿不可用", "error");
    }
  }

  function syncFileName() {
    var name = normalizeFileName(els.fileName.value);
    els.statusFile.textContent = name;
    document.title = name + " · 墨页";
  }

  els.fileName.addEventListener("change", function () {
    var next = normalizeFileName(els.fileName.value);
    els.fileName.value = next;

    var detached = false;
    if (fileHandle && next !== fileHandle.name) {
      fileHandle = null;
      detached = true;
    }

    syncFileName();
    saveDraft();

    if (detached) {
      dirty = true;
      setStatus("文件名已修改，保存时会新建文件", "dirty");
    }
  });

  els.fileName.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      els.fileName.blur();
    }
  });

  function refreshFsState() {
    if (canOpenWithPicker && canSaveWithPicker) {
      els.fsState.textContent = "文件写回：支持 · Ctrl+S 直接写回原文件";
      els.saveBtn.title = "保存到原文件（Ctrl/⌘ S）；另存为 Ctrl/⌘ ⇧ S";
    } else {
      els.fsState.textContent = "文件写回：当前浏览器不支持，保存会下载副本";
      els.saveBtn.title = "保存副本（Ctrl/⌘ S）";
    }
  }

  window.addEventListener("beforeunload", function (event) {
    if (dirty && fileHandle) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  /* ------------------------------------------------------------------ font */

  function loadFont() {
    els.fontState.textContent = "中文字体：正在加载…";
    fontPromise = fetch("fonts/SourceHanSansSC-Regular.ttf")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        fontBytes = new Uint8Array(buffer);
        els.fontState.textContent = "中文字体：Source Han Sans SC · 已嵌入";
        return fontBytes;
      })
      .catch(function () {
        els.fontState.textContent = "中文字体：未加载（请通过本地服务打开）";
        setStatus("字体未加载，中文可能缺字", "error");
        throw new Error("字体加载失败");
      });
    return fontPromise;
  }

  /* ---------------------------------------------------------------- export */

  function handleProgress(progress) {
    if (!progress) return;
    if (progress.stage === "collecting") {
      setProgress(true, true, 0);
      setStatus("正在读取版面…", "dirty");
      els.exportLabel.textContent = "读取中…";
    } else if (progress.stage === "countingPages") {
      setProgress(true, true, 0);
      setStatus("正在计算页数…", "dirty");
      els.exportLabel.textContent = "计算中…";
    } else if (progress.stage === "rendering") {
      var total = progress.totalPages || 0;
      var current = progress.currentPage || 0;
      var percent = total ? Math.min(99, Math.round((current / total) * 100)) : 0;
      setProgress(true, !total, percent);
      setStatus(total ? "正在生成第 " + current + " / " + total + " 页" : "正在生成 PDF…", "dirty");
      els.exportLabel.textContent = total ? current + " / " + total : "生成中…";
    } else if (progress.stage === "done") {
      lastPages = progress.totalPages || lastPages;
      setProgress(true, false, 100);
      setStatus("已生成 " + lastPages + " 页", "saved");
      els.exportLabel.textContent = "完成";
    }
  }

  function setProgress(active, indeterminate, percent) {
    els.progress.setAttribute("data-active", active ? "true" : "false");
    els.progress.setAttribute("data-indeterminate", indeterminate ? "true" : "false");
    els.progressBar.style.width = Math.max(0, Math.min(100, percent || 0)) + "%";
  }

  function exportPdf() {
    if (exporting) return Promise.resolve();

    if (!cm.getValue().trim()) {
      showToast("没有内容可导出", "先写一点内容，或点击预览区的「载入示例」。", "error");
      return Promise.resolve();
    }

    if (!window.dompdf) {
      showToast("PDF 引擎未加载", "vendor/dompdf.min.js 缺失，请确认文件完整。", "error");
      return Promise.resolve();
    }

    var preparedFont = fontBytes
      ? Promise.resolve(fontBytes)
      : fontPromise;

    if (!preparedFont) {
      showToast(
        "中文字体尚未就绪",
        "请用 start.cmd 启动本地服务后再导出，否则中文会缺字。",
        "error"
      );
      return Promise.resolve();
    }

    exporting = true;
    els.exportBtn.disabled = true;
    els.exportLabel.textContent = "导出中…";
    setProgress(true, true, 0);

    var title = resolveHeaderTitle();
    var name = baseName(els.fileName.value) + ".pdf";
    var theme = getTheme();

    clearTimeout(progressHideTimer);

    return preparedFont
      .then(function (bytes) {
        return DocExport.exportElement(els.doc, {
          paper: options.paper,
          marginPt: Number(options.margin),
          headerTitle: title,
          pageNumbers: !!options.footer,
          cover: !!options.cover,
          pageBreakOnH1: !!options.h1Break,
          compress: !!options.compress,
          background: options.background || theme.background || "#ffffff",
          headerColor: theme.headerColor,
          footerColor: theme.footerColor,
          fontBytes: bytes,
          metadata: {
            title: title || baseName(els.fileName.value),
            creator: "墨页",
            producer: "dompdf.js",
            keywords: ["Markdown", "PDF"],
          },
          onProgress: handleProgress,
        });
      })
      .then(function (blob) {
        downloadBlob(blob, name);

        var url = URL.createObjectURL(blob);

        // onProgress totalPages is 1 whenever the config does not need a
        // per-page pass, so read the real page count from the PDF itself.
        return DocExport.countPages(blob)
          .catch(function () {
            return lastPages;
          })
          .then(function (pages) {
            if (pages) lastPages = pages;
            var summary = (lastPages ? lastPages + " 页 · " : "") + formatSize(blob.size);
            showToast("PDF 已生成", summary + " · " + name, "info", [
              {
                label: "打开",
                primary: true,
                onClick: function () {
                  window.open(url, "_blank", "noopener");
                },
              },
            ]);
            setTimeout(function () {
              URL.revokeObjectURL(url);
            }, 120000);

            setStatus("已导出 " + name, dirty ? "dirty" : "saved");
          });
      })
      .catch(function (error) {
        console.error(error);
        if (error && error.message === "字体加载失败") {
          showToast(
            "中文字体未加载",
            "通过 file:// 直接打开时浏览器会拦截字体。运行 start.cmd 后从 http://127.0.0.1:8777 打开即可。",
            "error"
          );
          setStatus("字体未加载", "error");
          return;
        }
        showToast("导出失败", error && error.message ? error.message : String(error), "error");
        setStatus("导出失败", "error");
      })
      .finally(function () {
        exporting = false;
        els.exportBtn.disabled = false;
        els.exportLabel.textContent = "导出 PDF";
        progressHideTimer = setTimeout(function () {
          setProgress(false, false, 0);
        }, 900);
      });
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  /* -------------------------------------------------------------- toolbar */

  function wrapSelection(before, after, placeholder) {
    var selection = cm.getSelection();
    var text = selection || placeholder || "";
    cm.replaceSelection(before + text + after);
    if (!selection && text) {
      var end = cm.getCursor();
      cm.setSelection(
        { line: end.line, ch: end.ch - after.length - text.length },
        { line: end.line, ch: end.ch - after.length }
      );
    }
    cm.focus();
  }

  function prefixLines(prefix, stripPattern) {
    var from = cm.getCursor("from");
    var to = cm.getCursor("to");
    var lines = [];
    for (var i = from.line; i <= to.line; i += 1) lines.push(cm.getLine(i) || "");

    var allPrefixed = lines.every(function (line) {
      return line.indexOf(prefix) === 0;
    });

    for (var j = from.line; j <= to.line; j += 1) {
      var line = cm.getLine(j) || "";
      var body = stripPattern ? line.replace(stripPattern, "") : line;
      var next = allPrefixed
        ? body.replace(new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "")
        : prefix + body;
      cm.replaceRange(next, { line: j, ch: 0 }, { line: j, ch: line.length });
    }
    cm.focus();
  }

  function insertBlock(text) {
    var cursor = cm.getCursor();
    var line = cm.getLine(cursor.line) || "";
    var prefix = line.trim() === "" ? "" : "\n\n";
    cm.replaceSelection(prefix + text);
  }

  var ACTIONS = {
    h1: function () {
      prefixLines("# ", /^#{1,6}\s+/);
    },
    h2: function () {
      prefixLines("## ", /^#{1,6}\s+/);
    },
    h3: function () {
      prefixLines("### ", /^#{1,6}\s+/);
    },
    bold: function () {
      wrapSelection("**", "**", "加粗文字");
    },
    italic: function () {
      wrapSelection("*", "*", "斜体文字");
    },
    strike: function () {
      wrapSelection("~~", "~~", "删除文字");
    },
    inlineCode: function () {
      wrapSelection("`", "`", "code");
    },
    link: function () {
      wrapSelection("[", "](https://)", "链接文字");
    },
    ul: function () {
      prefixLines("- ", /^[-*+]\s+(?!\[[ xX]\])/);
    },
    ol: function () {
      prefixLines("1. ", /^\d+\.\s+/);
    },
    task: function () {
      prefixLines("- [ ] ", /^- \[[ xX]\]\s+/);
    },
    quote: function () {
      prefixLines("> ", /^>\s?/);
    },
    codeBlock: function () {
      var selection = cm.getSelection();
      cm.replaceSelection("```\n" + (selection || "") + "\n```");
      if (!selection) {
        var cursor = cm.getCursor();
        cm.setCursor({ line: cursor.line - 1, ch: 0 });
      }
      cm.focus();
    },
    table: function () {
      insertBlock(
        "| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n"
      );
    },
    hr: function () {
      insertBlock("---\n");
    },
  };

  document.querySelectorAll(".tool[data-action]").forEach(function (button) {
    button.addEventListener("click", function () {
      var action = ACTIONS[button.getAttribute("data-action")];
      if (action) action();
    });
  });

  /* ------------------------------------------------------------- settings */

  function openSettings() {
    els.settingsPanel.hidden = false;
    els.settingsBtn.setAttribute("aria-expanded", "true");
    var rect = els.settingsBtn.getBoundingClientRect();
    var width = 306;
    var left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
    els.settingsPanel.style.top = rect.bottom + 8 + "px";
    els.settingsPanel.style.left = left + "px";
    els.optTitle.focus({ preventScroll: true });
  }

  function closeSettings(returnFocus) {
    if (els.settingsPanel.hidden) return;
    els.settingsPanel.hidden = true;
    els.settingsBtn.setAttribute("aria-expanded", "false");
    if (returnFocus) els.settingsBtn.focus();
  }

  els.settingsBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    if (els.settingsPanel.hidden) openSettings();
    else closeSettings(false);
  });

  els.closeSettings.addEventListener("click", function () {
    closeSettings(true);
  });

  document.addEventListener("pointerdown", function (event) {
    if (els.settingsPanel.hidden) return;
    if (els.settingsPanel.contains(event.target) || els.settingsBtn.contains(event.target)) return;
    closeSettings(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !els.settingsPanel.hidden) {
      closeSettings(true);
    }
  });

  window.addEventListener("resize", function () {
    if (!els.settingsPanel.hidden) closeSettings(false);
    fitZoom();
  });

  [els.optPaper, els.optMargin, els.optFooter, els.optCover, els.optH1Break, els.optCompress].forEach(
    function (control) {
      control.addEventListener("change", function () {
        options = readOptionsFromControls();
        saveOptions();
        applyPaperMetrics();
      });
    }
  );

  els.optTitle.addEventListener("input", function () {
    options = readOptionsFromControls();
    saveOptions();
    updateStats();
  });

  els.optTheme.addEventListener("change", function () {
    var theme = (window.MOYE_THEMES || {})[els.optTheme.value];
    if (theme && theme.background) els.optBg.value = theme.background;
    options = readOptionsFromControls();
    saveOptions();
    applyDocumentStyles();
  });

  els.optBg.addEventListener("input", function () {
    options = readOptionsFromControls();
    saveOptions();
    applyDocumentStyles();
  });

  els.optCss.addEventListener("input", function () {
    options = readOptionsFromControls();
    applyDocumentStyles();
    clearTimeout(cssTimer);
    cssTimer = setTimeout(saveOptions, 300);
  });

  els.optCss.addEventListener("change", function () {
    clearTimeout(cssTimer);
    options = readOptionsFromControls();
    saveOptions();
    applyDocumentStyles();
  });

  els.clearCss.addEventListener("click", function () {
    els.optCss.value = "";
    options = readOptionsFromControls();
    saveOptions();
    applyDocumentStyles();
    els.optCss.focus();
  });

  els.optSync.addEventListener("change", function () {
    options = readOptionsFromControls();
    saveOptions();
    syncSuppress = null;
    if (options.sync) syncRatio(cmScroller, els.previewPane);
  });

  /* --------------------------------------------------------------- layout */

  var cmScroller = cm.getScrollerElement();

  function syncRatio(from, to) {
    if (!options.sync) return;
    if (!from.clientHeight || !to.clientHeight) return;

    var fromMax = from.scrollHeight - from.clientHeight;
    var toMax = to.scrollHeight - to.clientHeight;
    if (fromMax <= 0 || toMax <= 0) return;

    var value = (from.scrollTop / fromMax) * toMax;
    if (Math.abs(to.scrollTop - value) < 1.5) return;

    syncSuppress = { element: to, value: value };
    to.scrollTop = value;
  }

  function onSyncedScroll(from, to) {
    if (!options.sync) return;

    if (
      syncSuppress &&
      syncSuppress.element === from &&
      Math.abs(from.scrollTop - syncSuppress.value) < 3
    ) {
      syncSuppress = null;
      return;
    }

    syncSuppress = null;
    syncRatio(from, to);
  }

  cmScroller.addEventListener(
    "scroll",
    function () {
      onSyncedScroll(cmScroller, els.previewPane);
    },
    { passive: true }
  );

  els.previewPane.addEventListener(
    "scroll",
    function () {
      onSyncedScroll(els.previewPane, cmScroller);
    },
    { passive: true }
  );

  function setSplit(percent) {
    var clamped = Math.max(26, Math.min(74, percent));
    document.documentElement.style.setProperty("--split", clamped + "%");
    els.gutter.setAttribute("aria-valuenow", String(Math.round(clamped)));
    try {
      localStorage.setItem(STORAGE_SPLIT, String(clamped));
    } catch (error) {
      /* ignore */
    }
  }

  (function initSplit() {
    var stored = null;
    try {
      stored = parseFloat(localStorage.getItem(STORAGE_SPLIT));
    } catch (error) {
      stored = null;
    }
    if (stored && stored >= 26 && stored <= 74) setSplit(stored);
  })();

  var dragging = false;

  els.gutter.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    dragging = true;
    els.gutter.setPointerCapture(event.pointerId);
    els.gutter.setAttribute("data-dragging", "true");
    document.body.setAttribute("data-resizing", "true");
    event.preventDefault();
  });

  els.gutter.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    var rect = els.workbench.getBoundingClientRect();
    setSplit(((event.clientX - rect.left) / rect.width) * 100);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    els.gutter.removeAttribute("data-dragging");
    document.body.removeAttribute("data-resizing");
  }

  els.gutter.addEventListener("pointerup", endDrag);
  els.gutter.addEventListener("pointercancel", endDrag);

  els.gutter.addEventListener("dblclick", function () {
    setSplit(50);
  });

  els.gutter.addEventListener("keydown", function (event) {
    var current = parseFloat(els.gutter.getAttribute("aria-valuenow")) || 50;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplit(current - 2);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplit(current + 2);
    } else if (event.key === "Home") {
      event.preventDefault();
      setSplit(50);
    }
  });

  document.querySelectorAll(".view-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var view = tab.getAttribute("data-view");
      els.workbench.setAttribute("data-view", view);
      document.querySelectorAll(".view-tab").forEach(function (other) {
        other.setAttribute("aria-selected", other === tab ? "true" : "false");
      });
      if (view === "preview") fitZoom();
      updateStats();
    });
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      fitZoom();
    }).observe(els.previewPane);
  }

  /* ------------------------------------------------------------- commands */

  els.openBtn.addEventListener("click", function () {
    openFile();
  });
  els.saveBtn.addEventListener("click", function () {
    saveMarkdown();
  });
  els.exportBtn.addEventListener("click", exportPdf);
  els.sampleBtn.addEventListener("click", function () {
    loadText(SAMPLE, "季度经营分析.md", null);
  });

  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented) return;
    var mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    var key = event.key.toLowerCase();

    if (key === "s" && event.shiftKey) {
      event.preventDefault();
      saveMarkdown(true);
    } else if (key === "s") {
      event.preventDefault();
      saveMarkdown();
    } else if (key === "o") {
      event.preventDefault();
      openFile();
    } else if (key === "e" && event.shiftKey) {
      event.preventDefault();
      exportPdf();
    }
  });

  document.addEventListener("dragover", function (event) {
    if (!event.dataTransfer) return;
    var types = event.dataTransfer.types || [];
    if (Array.prototype.indexOf.call(types, "Files") >= 0) {
      event.preventDefault();
    }
  });

  document.addEventListener("drop", function (event) {
    if (!event.dataTransfer) return;
    var types = event.dataTransfer.types || [];
    if (Array.prototype.indexOf.call(types, "Files") < 0) return;
    event.preventDefault();

    var file = event.dataTransfer.files && event.dataTransfer.files[0];
    var item = event.dataTransfer.items && event.dataTransfer.items[0];
    var handlePromise = Promise.resolve(null);

    if (item && typeof item.getAsFileSystemHandle === "function") {
      try {
        handlePromise = item.getAsFileSystemHandle().catch(function () {
          return null;
        });
      } catch (error) {
        handlePromise = Promise.resolve(null);
      }
    }

    handlePromise.then(function (handle) {
      var isFileHandle = handle && handle.kind === "file";
      var filePromise = file
        ? Promise.resolve(file)
        : isFileHandle
          ? handle.getFile().catch(function () {
              return null;
            })
          : Promise.resolve(null);

      return filePromise.then(function (resolved) {
        if (resolved) readFile(resolved, isFileHandle ? handle : null);
      });
    });
  });

  /* ----------------------------------------------------------------- boot */

  (function boot() {
    populateThemes();
    writeOptionsToControls();
    applyPaperMetrics();
    applyDocumentStyles();
    refreshFsState();

    var draft = null;
    try {
      var raw = localStorage.getItem(STORAGE_DRAFT);
      draft = raw ? JSON.parse(raw) : null;
    } catch (error) {
      draft = null;
    }

    var content = draft && typeof draft.content === "string" ? draft.content : SAMPLE;
    var name = (draft && draft.name) || "季度经营分析.md";

    cm.setValue(content);
    cm.clearHistory();
    clearTimeout(renderTimer);
    clearTimeout(saveTimer);
    els.fileName.value = normalizeFileName(name);
    syncFileName();
    renderMarkdown();
    dirty = false;
    setStatus(draft ? "已恢复本地草稿" : "示例文档", "saved");

    loadFont().catch(function () {
      showToast(
        "中文字体未加载",
        "通过 file:// 直接打开时浏览器会拦截字体。运行 start.cmd 后从 http://127.0.0.1:8777 打开即可。",
        "error"
      );
    });

    setTimeout(fitZoom, 0);
  })();

  /* Test hook: used by the headless verification script. */
  window.__moye = {
    getMarkdown: function () {
      return cm.getValue();
    },
    setMarkdown: function (value) {
      cm.setValue(value);
      renderMarkdown();
    },
    getOptions: function () {
      return Object.assign({}, options);
    },
    exportPdf: exportPdf,
    saveMarkdown: function (saveAs) {
      return saveMarkdown(saveAs);
    },
    openFile: openFile,
    getFileHandleName: function () {
      return fileHandle ? fileHandle.name : null;
    },
    isDirty: function () {
      return dirty;
    },
    sample: SAMPLE,
  };
})();
