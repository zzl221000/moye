/* prepare.js — DOM transforms that must be applied to the export clone only.
   dompdf.js reads plain attributes (pageBreak / divisionDisable), so we never
   touch the live preview. */
(function (global) {
  "use strict";

  function prepare(root, options) {
    var opts = options || {};

    // Elements the author marked as screen-only.
    Array.prototype.forEach.call(
      root.querySelectorAll('[data-export="skip"], .no-export'),
      function (node) {
        node.parentNode.removeChild(node);
      }
    );

    // Long unbroken Latin tokens need `overflow-wrap: anywhere`; normal
    // cells must keep their natural width or numeric columns get chopped.
    var LONG_TOKEN = /[A-Za-z0-9_\-./:@?&=%+#]{24,}/;
    Array.prototype.forEach.call(root.querySelectorAll("td, th"), function (cell) {
      if (LONG_TOKEN.test(cell.textContent || "")) {
        cell.classList.add("cell-wrap-anywhere");
      }
    });

    // Keep checkbox appearance stable; they are already disabled by the renderer.
    Array.prototype.forEach.call(
      root.querySelectorAll('input[type="checkbox"]'),
      function (box) {
        box.setAttribute("disabled", "");
        if (box.parentElement) box.parentElement.classList.add("task-list-item");
      }
    );

    // Try not to split self-contained blocks across pages. Big tables and
    // long code blocks are allowed to break, otherwise they leave half-empty
    // pages (a 900px table would jump to the next page for lack of 200px).
    var KEEP_TOGETHER_LIMIT = 420;
    Array.prototype.forEach.call(root.querySelectorAll("table, pre"), function (node) {
      var height = node.getBoundingClientRect().height;
      if (height && height < KEEP_TOGETHER_LIMIT) {
        node.setAttribute("divisionDisable", "");
      }
    });

    Array.prototype.forEach.call(
      root.querySelectorAll("blockquote, figure, img"),
      function (node) {
        node.setAttribute("divisionDisable", "");
      }
    );

    // Optionally start every top-level section on a new page.
    if (opts.pageBreakOnH1) {
      var seen = 0;
      Array.prototype.forEach.call(root.querySelectorAll("h1"), function (h1) {
        seen += 1;
        if (seen === 1) return;
        h1.setAttribute("pageBreak", "");
      });
    }

    return root;
  }

  global.PrepareDoc = { prepare: prepare };
})(window);
