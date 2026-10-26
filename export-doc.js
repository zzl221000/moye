/* export-doc.js — one code path used by the editor button and by the CLI.
   Requires window.dompdf (UMD build, WASM + worker inlined) and prepare.js. */
(function (global) {
  "use strict";

  var FONT_FAMILY = "SourceHanSansSC-Regular";
  var PT_TO_PX = 96 / 72;

  var PAPERS = {
    a4: { widthPt: 595.5, heightPt: 842.25, format: "a4" },
    "a4-landscape": { widthPt: 842.25, heightPt: 595.5, format: [842.25, 595.5] },
    letter: { widthPt: 612, heightPt: 792, format: "letter" }
  };

  var HEADER_HEIGHT = 34;
  var FOOTER_HEIGHT = 28;

  function paperOf(name) {
    return PAPERS[name] || PAPERS.a4;
  }

  function metrics(paperName, marginPt) {
    var paper = paperOf(paperName);
    var margin = Math.max(0, Number(marginPt) || 0);
    return {
      widthPt: paper.widthPt,
      heightPt: paper.heightPt,
      marginPt: margin,
      marginPx: margin * PT_TO_PX,
      widthPx: Math.round(paper.widthPt * PT_TO_PX),
      heightPx: Math.round(paper.heightPt * PT_TO_PX),
      contentWidthPx: Math.round((paper.widthPt - margin * 2) * PT_TO_PX),
      headerHeight: HEADER_HEIGHT,
      footerHeight: FOOTER_HEIGHT
    };
  }

  function waitForImages(root) {
    var images = Array.prototype.slice.call(root.querySelectorAll("img"));
    var pending = images.map(function (img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (resolve) {
        var done = function () {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, 8000);
      });
    });
    return Promise.all(pending);
  }

  function buildPageConfig(options, hasHeader, hasFooter) {
    if (!hasHeader && !hasFooter) {
      // Documented escape hatch: a per-page resolver returning null disables
      // both bands (and, unlike omitting the option, does not fall back to the
      // default 50px header/footer).
      return function () {
        return null;
      };
    }

    var config = {};
    if (options.cover) config.excludePages = [1];

    config.header = hasHeader
      ? {
          content: options.headerTitle || "",
          height: HEADER_HEIGHT,
          contentPosition: "leftTop",
          contentColor: options.headerColor || "#6b7279",
          contentFontSize: 10,
          padding: [0, 0, 0, 0]
        }
      : { height: 0, content: "", padding: [0, 0, 0, 0] };

    config.footer = hasFooter
      ? {
          content: "第 ${currentPage} 页 / 共 ${totalPages} 页",
          height: FOOTER_HEIGHT,
          contentPosition: "center",
          contentColor: options.footerColor || "#8a9199",
          contentFontSize: 9,
          padding: [0, 0, 0, 0]
        }
      : { height: 0, content: "", padding: [0, 0, 0, 0] };

    return config;
  }

  /**
   * dompdf has no "keep with next" rule, so a heading can be stranded at the
   * bottom of a page while its section starts overleaf. Ask the engine for its
   * own break positions and force a break before any heading that lands within
   * roughly four lines of a boundary.
   */
  function avoidOrphanHeadings(root, pdfOptions) {
    var api = global.dompdf;
    if (!api || typeof api.computePageBreaks !== "function") return;

    var headings = Array.prototype.slice.call(root.querySelectorAll("h1, h2, h3, h4"));
    if (headings.length === 0) return;

    for (var pass = 0; pass < 3; pass += 1) {
      var breaks;
      try {
        breaks = api.computePageBreaks(root, pdfOptions);
      } catch (error) {
        return;
      }
      if (!breaks || !breaks.length) return;

      var rootTop = root.getBoundingClientRect().top;
      var changed = false;

      headings.forEach(function (heading) {
        if (heading.hasAttribute("pageBreak")) return;

        var rect = heading.getBoundingClientRect();
        var top = rect.top - rootTop;
        var bottom = rect.bottom - rootTop;
        var boundary = null;

        for (var i = 0; i < breaks.length; i += 1) {
          if (breaks[i] > top + 0.5) {
            boundary = breaks[i];
            break;
          }
        }

        if (boundary === null || boundary >= bottom + 96) return;

        // Only rescue a heading that introduces a block the pager cannot
        // start below it. Moving headings that are followed by prose makes
        // pages emptier, and moving a heading followed by another heading
        // cascades into a nearly blank page.
        var next = heading.nextElementSibling;
        if (!next) return;
        if (!/^(TABLE|PRE|FIGURE|IMG)$/.test(next.tagName)) return;

        heading.setAttribute("pageBreak", "");
        changed = true;
      });

      if (!changed) return;
    }
  }

  function countPagesInBytes(bytes) {
    var text = new TextDecoder("latin1").decode(bytes);
    var pageObjects = text.match(/\/Type\s*\/Page(?![s])/g);
    if (pageObjects) return pageObjects.length;
    var countMatch = text.match(/\/Count\s+(\d+)/);
    return countMatch ? Number(countMatch[1]) : 0;
  }

  function countPages(blob) {
    return blob.arrayBuffer().then(function (buffer) {
      return countPagesInBytes(new Uint8Array(buffer));
    });
  }

  /**
   * Render a DOM element to a PDF Blob.
   *
   * @param {HTMLElement} sourceEl  the document root (normally .pdf-doc)
   * @param {object} options
   *   paper            'a4' | 'a4-landscape' | 'letter'
   *   marginPt         page margin in PDF points
   *   headerTitle      header text ('' disables the header band)
   *   pageNumbers      render the page-number footer
   *   cover            hide header/footer on page 1
   *   pageBreakOnH1    start each h1 (except the first) on a new page
   *   compress         DEFLATE the PDF streams
   *   fontBytes        Uint8Array of a TTF, or null
   *   metadata         { title, author, subject, keywords }
   *   onProgress       dompdf progress callback
   */
  function exportElement(sourceEl, options) {
    var opts = options || {};
    var paper = paperOf(opts.paper);
    var size = metrics(opts.paper, opts.marginPt);

    var hasHeader = !!opts.headerTitle;
    var hasFooter = !!opts.pageNumbers;

    var clone = sourceEl.cloneNode(true);
    var background = opts.background || "#ffffff";

    clone.style.width = size.contentWidthPx + "px";
    clone.style.maxWidth = "none";
    clone.style.margin = "0";
    clone.style.padding = "0";

    var host = document.createElement("div");
    host.setAttribute("data-pdf-host", "");
    host.style.cssText =
      "position:fixed;left:-100000px;top:0;z-index:-1;" +
      "background:" +
      background +
      ";width:" +
      size.contentWidthPx +
      "px;";
    host.appendChild(clone);
    document.body.appendChild(host);

    // Measure only once the clone has a real width and is laid out.
    global.PrepareDoc.prepare(clone, opts);

    var fontConfig = opts.fontBytes
      ? {
          fontFamily: FONT_FAMILY,
          fontBytes: opts.fontBytes,
          fontStyle: "normal",
          fontWeight: 400
        }
      : undefined;

    var pdfOptions = {
      format: paper.format,
      pagination: true,
      marginPt: size.marginPt,
      backgroundColor: background,
      compress: opts.compress !== false,
      precision: 2,
      useCORS: true,
      fontConfig: fontConfig,
      pageConfig: buildPageConfig(opts, hasHeader, hasFooter),
      onProgress: opts.onProgress
    };

    if (opts.fontBytes) {
      // The browser lays the page out with this font, so the PDF must use the
      // same face for *every* script — otherwise Latin runs are measured with
      // Helvetica and the pre-computed line breaks overflow the column.
      pdfOptions.langFontConfig = [
        {
          fontFamily: FONT_FAMILY,
          fontBytes: opts.fontBytes,
          isDefault: true
        }
      ];
    }

    if (opts.metadata) {
      pdfOptions.metadata = opts.metadata;
    }

    return Promise.resolve()
      .then(function () {
        return document.fonts ? document.fonts.ready : null;
      })
      .then(function () {
        return waitForImages(clone);
      })
      .then(function () {
        avoidOrphanHeadings(clone, pdfOptions);
      })
      .then(function () {
        return global.dompdf(clone, pdfOptions);
      })
      .then(function (blob) {
        if (host.parentNode) host.parentNode.removeChild(host);
        return blob;
      })
      .catch(function (error) {
        if (host.parentNode) host.parentNode.removeChild(host);
        throw error;
      });
  }

  global.DocExport = {
    FONT_FAMILY: FONT_FAMILY,
    HEADER_HEIGHT: HEADER_HEIGHT,
    FOOTER_HEIGHT: FOOTER_HEIGHT,
    papers: PAPERS,
    metrics: metrics,
    buildPageConfig: buildPageConfig,
    countPages: countPages,
    countPagesInBytes: countPagesInBytes,
    exportElement: exportElement
  };
})(window);
