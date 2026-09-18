/**
 * 诊断：为什么 `re` 矩形不包含它自己的格内文字？
 *
 * 背景：
 *   郭亦菲 周2 列（x≈202.9 ~ 306.8）
 *   矩形 202.92|529|103.85|50   → y ∈ [529, 579]
 *   但该课详情 y=538.5 应落在 [529,579]？538.5 是落在里面的……
 *   而课名 y=550.5 也在里面。
 *   实测却只归入 2 片（555.0 / 550.5），538.5 没进去。
 *
 * 本脚本：
 *   1) 打印 PDF 里所有 `cm` 指令及它们出现的上下文（前后 120 字符）
 *   2) 打印所有 `q` / `Q` 的位置，判断 `re` 是否处在被变换的 q...Q 内
 *   3) 打印 郭亦菲 周2 区域所有矩形（按 y 排序）与所有文字（按 y 排序）
 *   4) 用「矩形包含判定」逐字检验，打印判定结果与失败原因
 *
 * 用法：node scripts/probe-rect-geom.cjs
 */
const fs = require("fs");
const path = require("path");

const PDF_BASE = "C:/Users/95345/Documents/xwechat_files/wxid_7a7kdwgqe36t22_6212/temp/RWTemp/2026-09";
const TARGET = path.join(PDF_BASE, "4762501c30c8f93654ccd562696edd21", "郭亦菲(2026-2027-1)课表.pdf");

const pdf = require(path.resolve(__dirname, "../miniprogram/utils/pdf-schedule.js"));

// 我们需要拿到 zlib 解压后的原始 content。pdf-schedule.js 内部有，但不导出。
// 这里自己解一遍：找 FlateDecode stream。
const zlib = require("zlib");

function bytesToLatin1(buf) {
  return buf.toString("latin1");
}

function extractContentStreams(bytes) {
  const latin1 = bytesToLatin1(bytes);
  const streams = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(latin1)) !== null) {
    const start = m.index + m[0].length;
    const end = latin1.indexOf("endstream", start);
    if (end < 0) continue;
    const raw = bytes.slice(start, end);
    let data = null;
    try {
      data = zlib.inflateSync(raw);
    } catch (e) {
      try {
        data = zlib.inflateRawSync(raw);
      } catch (e2) {
        continue;
      }
    }
    const txt = data.toString("latin1");
    if (/\bTj\b|\bre\b|\bTm\b/.test(txt)) streams.push(txt);
  }
  return streams;
}

const bytes = fs.readFileSync(TARGET);
const streams = extractContentStreams(bytes);
console.log(`=== 找到 ${streams.length} 条候选内容流 ===`);
streams.forEach((s, i) => console.log(`  #${i} len=${s.length}`));

// 拼接全部（去掉换行，便于正则）
const content = streams.join("\n");
console.log(`拼接后总长 ${content.length}\n`);

// ---------- 1) 所有 cm ----------
console.log("=== 1) 所有 cm 指令（含上下文） ===");
{
  const re = /((?:[\d.\-]+\s+){6})cm/g;
  let m;
  let n = 0;
  while ((m = re.exec(content)) !== null) {
    n += 1;
    const ctxBefore = content.slice(Math.max(0, m.index - 60), m.index).replace(/\s+/g, " ").slice(-60);
    const ctxAfter = content.slice(m.index + m[0].length, m.index + m[0].length + 60).replace(/\s+/g, " ");
    console.log(`  [${n}] "${m[1].trim()} cm"`);
    console.log(`      之前: ...${ctxBefore}`);
    console.log(`      之后: ${ctxAfter}...`);
  }
  if (!n) console.log("  （无）");
}

// ---------- 2) q/Q 配对与 re 所在层级 ----------
console.log("\n=== 2) q / Q 与 re 的层级关系 ===");
{
  const re = /\b(q|Q|cm|re)\b/g;
  let m;
  let depth = 0;
  let rectsInDepth = {};
  let cmDepths = [];
  while ((m = re.exec(content)) !== null) {
    const tok = m[1];
    if (tok === "q") depth += 1;
    else if (tok === "Q") depth = Math.max(0, depth - 1);
    else if (tok === "re") rectsInDepth[depth] = (rectsInDepth[depth] || 0) + 1;
    else if (tok === "cm") cmDepths.push(depth);
  }
  console.log(`  re 按层级分布: ${JSON.stringify(rectsInDepth)}`);
  console.log(`  cm 出现时所在的 q 层级: ${JSON.stringify(cmDepths)}`);
}

// ---------- 3) 郭亦菲 周2 区域：矩形 vs 文字 ----------
const rects = pdf.extractRects ? pdf.extractRects(content) : null;
console.log(`\n=== 3) extractRects 共 ${rects ? rects.length : "未导出"} 个矩形 ===`);

if (!rects) {
  console.log("  ✗ extractRects 未导出，检查导出列表");
  console.log("  导出:", Object.keys(pdf).join(", "));
  process.exit(0);
}

const texts = pdf.extractTextsRaw
  ? pdf.extractTextsRaw(content)
  : null;

// extractTexts 未导出的话，自己抓
let allTexts = texts;
if (!allTexts) {
  allTexts = [];
  const tre = /((?:[\d.\-]+\s+){6})Tm\s*((?:\/F\d+ [\d.]+ Tf\s*)?)((?:[^T]|T(?!j))*?)Tj/g;
  let m;
  while ((m = tre.exec(content)) !== null) {
    const nums = m[1].trim().split(/\s+/).map(Number);
    if (nums.length !== 6 || nums.some((n) => Number.isNaN(n))) continue;
    const tx = nums[4];
    const ty = nums[5];
    const body = m[3];
    const lits = [];
    const litRe = /\(((?:[^()\\]|\\.)*)\)/g;
    let lm;
    while ((lm = litRe.exec(body)) !== null) lits.push(lm[1]);
    if (!lits.length) continue;
    let t = "";
    for (const lit of lits) t += pdf.decodePdfString ? pdf.decodePdfString(lit) : lit;
    t = t.trim();
    if (!t) continue;
    allTexts.push({ x: tx, y: ty, text: t });
  }
}
console.log(`  共 ${allTexts.length} 片文字\n`);

// 周2 区间：从 probe 知道 x 约 202.9~306.8；y 我们放宽到 [500, 600]
const X0 = 195, X1 = 315, Y0 = 495, Y1 = 600;

const localRects = rects
  .filter((r) => r.right >= X0 && r.x <= X1 && r.top >= Y0 && r.y <= Y1)
  .sort((a, b) => b.y - a.y);
const localTexts = allTexts
  .filter((t) => t.x >= X0 && t.x <= X1 && t.y >= Y0 && t.y <= Y1)
  .sort((a, b) => b.y - a.y);

console.log(`=== 3a) 周2 区域矩形（x∈[${X0},${X1}] y∈[${Y0},${Y1}]）共 ${localRects.length} ===`);
localRects.forEach((r, i) => {
  console.log(
    `  R${String(i).padStart(2)}  x=[${r.x.toFixed(2)}, ${r.right.toFixed(2)}]  y=[${r.y.toFixed(2)}, ${r.top.toFixed(2)}]   w=${r.w.toFixed(2)} h=${r.h.toFixed(2)}  area=${r.area.toFixed(0)}`
  );
});

console.log(`\n=== 3b) 周2 区域文字（按 y 降序）共 ${localTexts.length} ===`);
localTexts.forEach((t, i) => {
  console.log(`  T${String(i).padStart(2)}  y=${t.y.toFixed(1).padStart(7)}  x=${t.x.toFixed(2).padStart(7)}  "${t.text}"`);
});

console.log(`\n=== 3c) 逐字【最小包含矩形】判定（tolY=8, tolX=2） ===`);
const TOLY = 8, TOLX = 2;
localTexts.forEach((t, i) => {
  let best = null;
  let inside = [];
  rects.forEach((r) => {
    if (t.x < r.x - TOLX || t.x > r.right + TOLX) return;
    if (t.y < r.y - TOLY || t.y > r.top + TOLY) return;
    inside.push(r);
    if (!best || r.area < best.area) best = r;
  });
  if (!best) {
    console.log(`  T${String(i).padStart(2)} y=${t.y.toFixed(1)} "${t.text.slice(0, 34)}"`);
    console.log(`       ✗ 无归属`);
    return;
  }
  console.log(`  T${String(i).padStart(2)} y=${t.y.toFixed(1)} "${t.text.slice(0, 34)}"`);
  console.log(
    `       → R x=[${best.x.toFixed(2)},${best.right.toFixed(2)}] y=[${best.y.toFixed(2)},${best.top.toFixed(2)}] (候选 ${inside.length} 个)`
  );
});

// ---------- 4) 全量：矩形 y 分布 vs 文字 y 分布（找系统性偏移） ----------
console.log(`\n=== 4) 全量 y 值直方（粗粒度 10pt 桶）——看矩形与文字是否同空间 ===`);
{
  const buckets = {};
  rects.forEach((r) => {
    const k = Math.floor(r.y / 10) * 10;
    buckets[k] = buckets[k] || { re: 0, tx: 0 };
    buckets[k].re += 1;
  });
  allTexts.forEach((t) => {
    const k = Math.floor(t.y / 10) * 10;
    buckets[k] = buckets[k] || { re: 0, tx: 0 };
    buckets[k].tx += 1;
  });
  const keys = Object.keys(buckets).map(Number).sort((a, b) => b - a);
  console.log("   y桶    re数   文字数");
  keys.forEach((k) => {
    const b = buckets[k];
    console.log(`  ${String(k).padStart(5)}   ${String(b.re).padStart(4)}   ${String(b.tx).padStart(4)}`);
  });
}
