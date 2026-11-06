#!/usr/bin/env node
/**
 * PDF export baseline — compare the current CLI output against golden values.
 *
 *   node tests/compare.mjs            compare every tests/fixtures/*.md
 *   node tests/compare.mjs --update   regenerate tests/golden/*.json
 *   node tests/compare.mjs --keep     keep the exported PDFs for inspection
 *
 * `--update` also accepts `--source <git-ref>` (default: the checked-out
 * commit) to record which implementation produced the golden values.
 *
 * The golden file records the page count (read from the PDF) and the text
 * extracted by pdftotext, one string per page.
 *
 * Zero npm dependencies: Node built-ins plus the external `pdftotext`, and
 * `pdfinfo` when it happens to be installed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(__dirname, "fixtures");
const goldenDir = path.join(__dirname, "golden");
const exportScript = path.join(repoRoot, "export.mjs");

const argv = process.argv.slice(2);
const update = argv.includes("--update");
const keep = argv.includes("--keep");

function flagValue(name) {
  const prefix = "--" + name;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === prefix) return argv[i + 1];
    if (argv[i].startsWith(prefix + "=")) return argv[i].slice(prefix.length + 1);
  }
  return null;
}

const sourceRef = flagValue("source");

const unknownFlags = argv.filter(
  (arg) => arg.startsWith("-") && arg !== "--update" && arg !== "--keep" && arg !== "--source" && !arg.startsWith("--source=")
);

if (unknownFlags.length > 0 || (argv.includes("--source") && (!sourceRef || sourceRef.startsWith("-")))) {
  console.error(`未知参数：${unknownFlags.join(" ") || "--source（缺少值）"}\n可用参数：--update  --keep  --source <git-ref>`);
  process.exit(2);
}

if (sourceRef && !update) {
  console.error("--source 只能与 --update 一起使用。");
  process.exit(2);
}

/* ------------------------------------------------------------- environment */

function findExecutable(name) {
  const fromEnv = process.env[name.toUpperCase() + "_PATH"];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const locator = process.platform === "win32" ? "where" : "which";
  try {
    const output = execFileSync(locator, [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const first = output.split(/\r?\n/).find((line) => line.trim());
    return first ? first.trim() : null;
  } catch {
    return null;
  }
}

const pdftotext = findExecutable("pdftotext");
const pdfinfo = findExecutable("pdfinfo");

if (!pdftotext) {
  console.error("✖ 找不到 pdftotext。请安装 poppler-utils 或 xpdf，或用 PDFTOTEXT_PATH 指定可执行文件。");
  process.exit(2);
}

/* --------------------------------------------------------------- page count */

/**
 * Page count precedence:
 *   1. pdfinfo (when installed) — authoritative page tree.
 *   2. `/Type /Page` objects in the PDF bytes (same logic as export.mjs).
 *   3. page tree `/Count N`.
 *   4. the "N 页" line printed by the CLI.
 *   5. form-feed count from pdftotext as a last resort.
 */
function countPages(pdfPath, cliOutput) {
  if (pdfinfo) {
    try {
      const output = execFileSync(pdfinfo, [pdfPath], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const match = output.match(/^Pages:\s+(\d+)\s*$/m);
      if (match) return { count: Number(match[1]), source: "pdfinfo" };
    } catch {
      /* fall through */
    }
  }

  const bytes = fs.readFileSync(pdfPath).toString("latin1");
  const pageObjects = bytes.match(/\/Type\s*\/Page(?![s])/g);
  if (pageObjects && pageObjects.length > 0) {
    return { count: pageObjects.length, source: "pdf /Type /Page objects" };
  }

  const countMatch = bytes.match(/\/Count\s+(\d+)/);
  if (countMatch) return { count: Number(countMatch[1]), source: "pdf page tree /Count" };

  const cliMatch = cliOutput.match(/(\d+)\s*页/);
  if (cliMatch) return { count: Number(cliMatch[1]), source: "CLI summary" };

  return { count: 0, source: "unknown (treated as failure)" };
}

/* ------------------------------------------------------------------- text */

function extractPages(pdfPath, tmpDir, name) {
  const textPath = path.join(tmpDir, `${name}.txt`);
  execFileSync(pdftotext, ["-enc", "UTF-8", pdfPath, textPath], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  return parsePages(fs.readFileSync(textPath, "utf8"));
}

function parsePages(raw) {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const parts = normalized.split("\f");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();

  return parts.map((page) =>
    page
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "")
  );
}

/* ------------------------------------------------------------------- diff */

function sameArray(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function withoutWhitespace(pages) {
  return pages.map((page) => page.replace(/\s+/g, ""));
}

function flatten(pages) {
  const lines = [];
  pages.forEach((text, index) => {
    const label = `p${index + 1} | `;
    const pageLines = text.split("\n");
    if (text === "") {
      lines.push(`${label}(blank)`);
      return;
    }
    for (const line of pageLines) lines.push(label + line);
  });
  return lines;
}

function diffOps(before, after) {
  const n = before.length;
  const m = after.length;

  // Keep the quadratic table bounded; very large documents fall back to a
  // first-mismatch report instead of a full diff.
  if (n * m > 4_000_000) return null;

  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ type: "same", line: before[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: "del", line: before[i] });
      i += 1;
    } else {
      ops.push({ type: "add", line: after[j] });
      j += 1;
    }
  }
  while (i < n) ops.push({ type: "del", line: before[i++] });
  while (j < m) ops.push({ type: "add", line: after[j++] });
  return ops;
}

function renderDiff(before, after, context = 3) {
  const ops = diffOps(before, after);
  if (!ops) {
    const index = before.findIndex((line, i) => line !== after[i]);
    const at = index < 0 ? Math.min(before.length, after.length) : index;
    const start = Math.max(0, at - context);
    const end = Math.min(Math.max(before.length, after.length), at + context + 1);
    const lines = [`@@ 无法逐行比对（文件过大），首个差异在第 ${at + 1} 行 @@`];
    for (let i = start; i < end; i += 1) {
      if (before[i] !== undefined) lines.push(`-${before[i]}`);
      if (after[i] !== undefined) lines.push(`+${after[i]}`);
    }
    return lines.join("\n");
  }

  const changed = ops
    .map((op, index) => (op.type === "same" ? -1 : index))
    .filter((index) => index >= 0);
  if (changed.length === 0) return "";

  const hunks = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(ops.length, changed[0] + context + 1);
  for (const index of changed.slice(1)) {
    const nextStart = Math.max(0, index - context);
    const nextEnd = Math.min(ops.length, index + context + 1);
    if (nextStart <= end) {
      end = Math.max(end, nextEnd);
    } else {
      hunks.push([start, end]);
      start = nextStart;
      end = nextEnd;
    }
  }
  hunks.push([start, end]);

  const output = [];
  let oldLine = 1;
  let newLine = 1;
  let opIndex = 0;

  for (const [hunkStart, hunkEnd] of hunks) {
    while (opIndex < hunkStart) {
      if (ops[opIndex].type !== "add") oldLine += 1;
      if (ops[opIndex].type !== "del") newLine += 1;
      opIndex += 1;
    }

    const body = [];
    let oldCount = 0;
    let newCount = 0;
    for (let index = hunkStart; index < hunkEnd; index += 1) {
      const op = ops[index];
      if (op.type === "same") {
        body.push(` ${op.line}`);
        oldCount += 1;
        newCount += 1;
      } else if (op.type === "del") {
        body.push(`-${op.line}`);
        oldCount += 1;
      } else {
        body.push(`+${op.line}`);
        newCount += 1;
      }
      opIndex = index + 1;
    }

    output.push(`@@ -${oldLine},${oldCount} +${newLine},${newCount} @@`);
    output.push(...body);
    oldLine += oldCount;
    newLine += newCount;
  }

  return output.join("\n");
}

/* ----------------------------------------------------------------- export */

function exportFixture(fixturePath, tmpDir, name) {
  const pdfPath = path.join(tmpDir, `${name}.pdf`);
  let lastError = null;

  // export.mjs can race Chrome's DevToolsActivePort write on Windows (EBUSY).
  // Retry only that transient launch failure; never retry a real export error.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const output = execFileSync(process.execPath, [exportScript, fixturePath, "-o", pdfPath], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`导出未生成 PDF：${pdfPath}\n${output}`);
      }
      if (attempt > 1) console.error(`  ↻ ${name} 第 ${attempt} 次导出成功（Chrome 启动竞态）`);
      return { pdfPath, output };
    } catch (error) {
      lastError = error;
      const transient = /EBUSY|DevToolsActivePort/.test(error.message || "");
      if (!transient || attempt === 3) break;
      console.error(`  ↻ ${name} 导出遇到瞬时启动失败，重试 ${attempt}/3`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 500);
    }
  }

  throw lastError;
}

/* ------------------------------------------------------------------- main */

function discoverFixtures() {
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .sort()
    .map((name) => ({
      name: path.basename(name, path.extname(name)),
      file: path.join(fixturesDir, name),
      relative: path.posix.join("tests/fixtures", name),
    }));
}

function capture(fixture, tmpDir) {
  const { pdfPath, output } = exportFixture(fixture.file, tmpDir, fixture.name);
  let { count, source } = countPages(pdfPath, output);
  const pages = extractPages(pdfPath, tmpDir, fixture.name);

  if (count <= 0) {
    count = pages.length;
    source = "pdftotext form feeds";
  }
  if (count <= 0) {
    throw new Error(`无法从 PDF 读取页数（${fixture.relative}）`);
  }
  if (pages.length !== count) {
    throw new Error(
      `页数不一致：PDF 显示 ${count} 页（${source}），pdftotext 提取到 ${pages.length} 页（${fixture.relative}）`
    );
  }
  return { pageCount: count, pageCountSource: source, pages };
}

function provenance(ref) {
  const target = ref || "HEAD";
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", target], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const branch = ref
      ? ref
      : execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    return { branch, commit };
  } catch {
    return null;
  }
}

function main() {
  const fixtures = discoverFixtures();
  if (fixtures.length === 0) {
    console.error(`✖ ${path.relative(repoRoot, fixturesDir)} 下没有 .md fixture。`);
    process.exit(2);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "moye-baseline-"));
  const failures = [];
  const source = update ? provenance(sourceRef) : null;

  if (update && !source) {
    console.error("✖ 无法解析 --source 指定的 git 版本；黄金值未更新。");
    process.exit(2);
  }

  console.log(
    `页数来源：${pdfinfo ? "pdfinfo" : "/Type /Page 对象（未安装 pdfinfo）"} · 文本：pdftotext -enc UTF-8`
  );

  try {
    for (const fixture of fixtures) {
      const goldenPath = path.join(goldenDir, `${fixture.name}.json`);

      let actual;
      try {
        actual = capture(fixture, tmpDir);
      } catch (error) {
        failures.push(fixture.name);
        console.error(`\n✖ ${fixture.relative}`);
        console.error(`  ${error.message.split("\n").join("\n  ")}`);
        continue;
      }

      if (update) {
        fs.mkdirSync(goldenDir, { recursive: true });
        const golden = {
          fixture: fixture.relative,
          pageCount: actual.pageCount,
          ...(source ? { capturedFrom: source } : {}),
          pages: actual.pages,
        };
        fs.writeFileSync(goldenPath, JSON.stringify(golden, null, 2) + "\n");
        console.log(
          `✔ ${fixture.name}  ${actual.pageCount} 页  ${actual.pages.length} 页文本  → ${path.posix.join(
            "tests/golden",
            fixture.name + ".json"
          )}`
        );
        continue;
      }

      if (!fs.existsSync(goldenPath)) {
        failures.push(fixture.name);
        console.error(`\n✖ ${fixture.relative}`);
        console.error(`  缺少黄金值 ${path.relative(repoRoot, goldenPath)}；先运行 node tests/compare.mjs --update`);
        continue;
      }

      const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
      const problems = [];

      if (golden.pageCount !== actual.pageCount) {
        problems.push(`页数：黄金值 ${golden.pageCount}，实际 ${actual.pageCount}（${actual.pageCountSource}）`);
      }

      const goldenPages = Array.isArray(golden.pages) ? golden.pages : [];
      if (goldenPages.length !== golden.pageCount) {
        problems.push(`黄金文件自身不一致：pageCount=${golden.pageCount}，pages=${goldenPages.length}`);
      }

      if (!sameArray(goldenPages, actual.pages)) {
        if (sameArray(withoutWhitespace(goldenPages), withoutWhitespace(actual.pages))) {
          problems.push("提取文本仅空白/换行不同（通常来自 pdftotext 版本差异）");
        } else {
          problems.push("提取文本不同");
        }
      }

      if (problems.length === 0) {
        console.log(`✔ ${fixture.name}  ${actual.pageCount} 页`);
        continue;
      }

      failures.push(fixture.name);
      console.error(`\n✖ ${fixture.relative}`);
      for (const problem of problems) console.error(`  ${problem}`);

      if (!sameArray(goldenPages, actual.pages)) {
        const before = flatten(goldenPages);
        const after = flatten(actual.pages);
        const diff = renderDiff(before, after);
        console.error("  --- 黄金值 / 实际（pN = 第 N 页）");
        console.error(
          diff
            .split("\n")
            .map((line) => "  " + line)
            .join("\n")
        );
      }
    }
  } finally {
    if (keep) {
      console.error(`\n保留的临时文件：${tmpDir}`);
    } else {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* ignore */
      }
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n✖ ${failures.length}/${fixtures.length} 个 fixture 不匹配：${failures.join(", ")}${
        update ? "" : "。若是预期的导出行为变化，运行 node tests/compare.mjs --update 后审阅 golden 差异。"
      }`
    );
    process.exit(1);
  }

  if (update) {
    console.log(`\n✔ 已更新 ${fixtures.length} 个 fixture 的黄金值。`);
  } else {
    console.log(`\n✔ ${fixtures.length} 个 fixture 全部匹配。`);
  }
}

main();
