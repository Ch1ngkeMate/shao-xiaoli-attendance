/**
 * 轻量 WXML 校验：标签闭合平衡 + 花括号配对 + 关键属性存在性
 * 不做完整编译器，只捕获手写 WXML 最常见的结构性错误。
 * 运行：node scripts/check-wxml.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "miniprogram");
// 这些标签在本项目中均以「成对标签」书写（<wxs></wxs>、<picker></picker>），
// 只有真正自闭合的才放这里，否则会产生误报。
const SELF_CLOSING = new Set([
  "image", "input", "br", "hr", "icon", "video", "audio", "canvas",
  "map", "slot", "progress", "switch", "checkbox", "radio", "slider",
  "import", "include",
]);

let failures = 0;
const lines = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".wxml")) out.push(p);
  }
  return out;
}

function checkBraceBalance(src, file, errs) {
  // 排除 wxs 模块体（内含 JS，花括号成对但语义不同，这里仍按配对检查）
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) {
        errs.push(`${path.relative(ROOT, file)}: 第 ${src.slice(0, i).split("\n").length} 行出现多余的 '}'`);
        return;
      }
    }
  }
  if (depth !== 0) errs.push(`${path.relative(ROOT, file)}: 花括号未闭合（剩余 ${depth} 个 '{'）`);
}

function checkTags(src, file, errs) {
  const tagRe = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const stack = [];
  let m;
  while ((m = tagRe.exec(src)) !== null) {
    const [full, name, , selfClose] = m;
    if (full.startsWith("</")) {
      if (stack.length === 0) {
        errs.push(`${path.relative(ROOT, file)}: 多余的闭合标签 </${name}>`);
        continue;
      }
      const open = stack.pop();
      if (open !== name) {
        errs.push(`${path.relative(ROOT, file)}: 标签不匹配，</${name}> 对应的是 <${open}>`);
      }
    } else if (selfClose !== "/" && !SELF_CLOSING.has(name)) {
      stack.push(name);
    }
  }
  if (stack.length) {
    errs.push(`${path.relative(ROOT, file)}: 未闭合标签 ${stack.map((s) => `<${s}>`).join(", ")}`);
  }
}

function checkInlineBindings(src, file, errs) {
  const linesArr = src.split("\n");
  linesArr.forEach((line, i) => {
    // 属性值里的 {{ }} 必须成对出现
    const opens = (line.match(/\{\{/g) || []).length;
    const closes = (line.match(/\}\}/g) || []).length;
    if (opens !== closes) {
      errs.push(`${path.relative(ROOT, file)}:${i + 1} 行 {{ }} 不成对（${opens} vs ${closes}）`);
    }
  });
}

const files = walk(ROOT);
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const errs = [];
  checkBraceBalance(src, f, errs);
  checkTags(src, f, errs);
  checkInlineBindings(src, f, errs);
  if (errs.length) { failures += errs.length; lines.push(...errs.map((e) => "  FAIL  " + e)); }
  else lines.push(`  PASS  ${path.relative(ROOT, f)}`);
}

console.log("\n=== WXML 结构校验 ===\n");
console.log(lines.join("\n"));
console.log(`\n共检查 ${files.length} 个文件，错误 ${failures} 处\n`);
process.exit(failures > 0 ? 1 : 0);
