#!/usr/bin/env node
/**
 * Static build for 墨页.
 *
 *   node build.mjs                 → dist/
 *   node build.mjs --out docs      → docs/  (GitHub Pages “branch /docs” mode)
 *   node build.mjs --domain md.example.com
 *
 * The app is already 100% static; this only copies the runtime files and adds
 * .nojekyll / CNAME. No bundler, no dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

function arg(name, fallback) {
  const inline = argv.find((value) => value.startsWith("--" + name + "="));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf("--" + name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return fallback;
}

const outDir = path.resolve(root, arg("out", "dist"));
const domain = (arg("domain", "") || "").trim();

if (outDir === root || root.startsWith(outDir + path.sep)) {
  console.error(`拒绝写入 ${outDir}：会覆盖源码目录。请使用 dist/ 或 docs/。`);
  process.exit(1);
}

const FILES = [
  "index.html",
  "app.js",
  "prepare.js",
  "export-doc.js",
  "themes.js",
  "favicon.svg",
  "THIRD-PARTY.md",
];

const DIRS = ["styles", "vendor", "fonts"];

function copyFile(relative) {
  const source = path.join(root, relative);
  const target = path.join(outDir, relative);
  if (!fs.existsSync(source)) throw new Error("缺少文件：" + relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return fs.statSync(target).size;
}

function copyDir(relative) {
  const source = path.join(root, relative);
  let bytes = 0;
  fs.mkdirSync(path.join(outDir, relative), { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) bytes += copyDir(child);
    else bytes += copyFile(child);
  }
  return bytes;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let total = 0;
for (const file of FILES) total += copyFile(file);
for (const dir of DIRS) total += copyDir(dir);

// GitHub Pages: skip Jekyll entirely (faster builds, no underscore rules).
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

if (domain) {
  fs.writeFileSync(path.join(outDir, "CNAME"), domain + "\n");
}

const mb = (total / 1024 / 1024).toFixed(1);
console.log(`✔ 静态站点已生成：${outDir}`);
console.log(`  ${FILES.length + DIRS.length} 个入口，${mb} MB`);
if (domain) console.log(`  CNAME → ${domain}`);
console.log("");
console.log("本地预览：node serve.mjs --dir " + path.relative(root, outDir));
