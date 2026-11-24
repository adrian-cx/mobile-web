#!/usr/bin/env node
/**
 * 零外部依赖构建与完整性校验脚本
 * 输出纯静态目录 dist/，可直接托管至 Cloudflare Pages / Vercel / Netlify / GitHub Pages
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*\n\s*/g, "")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}");
}

console.log("▶ [1/4] 校验题库与 JS 语法...");
for (const rel of ["js/questions.js", "js/app.js", "sw.js"]) {
  const code = fs.readFileSync(path.join(rootDir, rel), "utf8");
  new vm.Script(code, { filename: rel });
}

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(rootDir, "js/questions.js"), "utf8"), sandbox);
const qCount = Array.isArray(sandbox.window.QUESTION_BANK) ? sandbox.window.QUESTION_BANK.length : 0;
if (qCount !== 288) {
  throw new Error(`题库数量校验异常：期望 288 题，实际读取到 ${qCount} 题`);
}
console.log(`  ✓ JS 语法通过，内置静态题库共 ${qCount} 题`);

console.log("▶ [2/4] 校验 PWA manifest.json 与相对路径规范...");
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"));
if (!manifest.start_url.startsWith("./") || !manifest.scope.startsWith("./")) {
  throw new Error("manifest.json 中 start_url / scope 必须使用相对路径 (./)");
}
for (const icon of manifest.icons) {
  const iconPath = path.join(rootDir, icon.src);
  if (!fs.existsSync(iconPath)) {
    throw new Error(`图标文件缺失: ${icon.src}`);
  }
}
const htmlRaw = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const absRefs = htmlRaw.match(/(?:href|src)="\/[^/]/g);
if (absRefs) {
  throw new Error(`index.html 存在根绝对路径引用，可能导致子路径部署 404: ${absRefs.join(", ")}`);
}
console.log("  ✓ PWA 图标与全相对路径检查通过");

console.log("▶ [3/4] 生成纯静态生产包 dist/ ...");
fs.rmSync(distDir, { recursive: true, force: true });
ensureDir(path.join(distDir, "css"));
ensureDir(path.join(distDir, "js"));
ensureDir(path.join(distDir, "icons"));

// Copy & optimize assets
fs.copyFileSync(path.join(rootDir, "index.html"), path.join(distDir, "index.html"));
fs.copyFileSync(path.join(rootDir, "manifest.json"), path.join(distDir, "manifest.json"));
fs.copyFileSync(path.join(rootDir, "sw.js"), path.join(distDir, "sw.js"));
fs.writeFileSync(
  path.join(distDir, "css/app.css"),
  minifyCss(fs.readFileSync(path.join(rootDir, "css/app.css"), "utf8")),
  "utf8"
);
// Compact questions JSON while preserving UTF-8 readability
fs.writeFileSync(
  path.join(distDir, "js/questions.js"),
  `window.QUESTION_BANK=${JSON.stringify(sandbox.window.QUESTION_BANK)};\n`,
  "utf8"
);
fs.copyFileSync(path.join(rootDir, "js/app.js"), path.join(distDir, "js/app.js"));

for (const file of fs.readdirSync(path.join(rootDir, "icons"))) {
  fs.copyFileSync(path.join(rootDir, "icons", file), path.join(distDir, "icons", file));
}

if (fs.existsSync(path.join(rootDir, "_headers"))) {
  fs.copyFileSync(path.join(rootDir, "_headers"), path.join(distDir, "_headers"));
}
fs.writeFileSync(path.join(distDir, ".nojekyll"), "", "utf8");

console.log("▶ [4/4] 统计构建产物大小...");
let totalBytes = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else totalBytes += fs.statSync(full).size;
  }
}
walk(distDir);
console.log(`  ✓ 构建成功！输出目录: mobile-web/dist/ (总大小 ${(totalBytes / 1024).toFixed(1)} KB)`);
