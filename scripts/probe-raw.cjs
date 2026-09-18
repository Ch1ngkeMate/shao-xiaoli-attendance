/*
 * probe-raw.cjs —— 打印任意课表 PDF 的原始碎片（含 drawOrder + 变换后坐标）
 * 用法：node scripts/probe-raw.cjs <pdf路径> [weekday]
 *   不带 weekday 时打印全部；带 weekday 时只打印该星期行 + 该行的分块结果
 */
const fs = require("fs");
const path = require("path");
const I = require("../miniprogram/utils/pdf-schedule.js")._internal;

const file = process.argv[2];
const only = process.argv[3] ? Number(process.argv[3]) : null;
if (!file) {
  console.error("用法: node scripts/probe-raw.cjs <pdf路径> [weekday]");
  process.exit(1);
}

const buf = fs.readFileSync(file);
const bytes = new Uint8Array(buf);
const stream = I.extractContentStream(bytes);
const matrix = I.readContentMatrix(stream);

console.log("### cm 矩阵:", JSON.stringify(matrix));

// 完全复刻 parseSchedulePdf：texts 已变换，rows 再用 identity 构建
const ID = [1, 0, 0, 1, 0, 0];
const rawTexts = I.extractTexts(stream);
console.log(`### 原始碎片 ${rawTexts.length} 条`);
const texts = rawTexts.map((t, i) => {
  const p = I.applyMatrix(t.x, t.y, matrix);
  return { x: p.x, y: p.y, text: t.text, drawOrder: i };
});

let rows = I.buildWeekdayRows(texts, ID);
let rowSource = "buildWeekdayRows(表头)";
if (!rows.length) {
  const rectsDev = I.extractRects(stream).map((r) => I.applyMatrixToRect(r, matrix));
  rows = I.buildWeekdayRowsFromRects(rectsDev);
  rowSource = "buildWeekdayRowsFromRects(矩形)";
}
console.log(`### 星期行来源: ${rowSource}`);
console.log("### 星期行:", JSON.stringify(rows));

const { buckets, unassigned } = I.bucketByWeekday(texts, rows, ID);

for (const r of rows) {
  if (only && r.weekday !== only) continue;
  const items = (buckets[r.weekday] || []).slice().sort((a, b) => a.drawOrder - b.drawOrder);
  console.log(`\n${"=".repeat(100)}`);
  console.log(`### 周${r.weekday}  碎片 ${items.length} 条  (行带 device y: ${r.y0} ~ ${r.y1})`);
  console.log("=".repeat(100));
  items.forEach((t) => {
    console.log(`  #${String(t.drawOrder).padStart(3)}  x=${String(t.x).padStart(7)}  ${JSON.stringify(t.text)}`);
  });

  const blocks = I.splitBlocksInRow(items);
  console.log(`  --- 分块 ${blocks.length} 块 ---`);
  blocks.forEach((g, gi) => {
    const blob = g.map((t) => t.text).join("");
    console.log(`   块${gi} [${g.length}片]: ${blob}`);
    const parsed = I.parseCell ? I.parseCell(blob) : null;
    if (parsed) console.log(`        -> parseCell: ${JSON.stringify(parsed)}`);
  });
}

if (!only && unassigned.length) {
  console.log(`\n### 表外碎片 ${unassigned.length} 条`);
  unassigned.forEach((t) => console.log(`  #${t.drawOrder} x=${t.x} y=${t.y} ${JSON.stringify(t.text)}`));
}
