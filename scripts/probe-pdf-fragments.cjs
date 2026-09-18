/**
 * 诊断脚本：打印某列 y 区间内的原始文字碎片（含 x/y），
 * 用来确认「同一行的碎片顺序」与「字段被切碎的位置」。
 *
 * 用法：node scripts/probe-pdf-fragments.cjs "某课表.pdf" [weekday]
 */
const fs = require("fs");
const path = require("path");
const mod = require("../miniprogram/utils/pdf-schedule.js");

const file = process.argv[2];
const wantWeekday = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
if (!file) {
  console.error("用法：node scripts/probe-pdf-fragments.cjs <课表.pdf> [weekday]");
  process.exit(2);
}

const bytes = new Uint8Array(fs.readFileSync(path.resolve(file)));
const I = mod._internal;
const content = I.extractContentStream(bytes);
const media = I.readMediaBox(bytes);
const texts = I.extractTexts(content, I.readPageRotation(bytes), media.w, media.h);
const { cols, colWidth, headerY } = I.buildColumns(texts);
const anchors = I.buildSectionAnchors(texts, cols, headerY);

console.log(`列宽=${colWidth.toFixed(1)}  表头 y=${headerY}  列数=${cols.length}`);
console.log(
  "列：",
  cols.map((c) => `${c.weekday}@${c.left.toFixed(1)}`).join(" ")
);
console.log("节次锚点：", JSON.stringify(anchors));
console.log("");

const firstColLeft = cols.length ? Math.min.apply(null, cols.map((c) => c.left)) : 99;
const tol = colWidth * 0.75;
const body = texts.filter((t) => t.y < headerY && t.x >= firstColLeft - tol);

// 按 (y 倒序, x 升序) 打印 —— 模拟「按行阅读」的正确顺序
body.sort((a, b) => (Math.abs(a.y - b.y) > 1 ? b.y - a.y : a.x - b.x));

let lastY = null;
body.forEach((t) => {
  const wd = I.locateColumn(t.x, cols, colWidth);
  if (wantWeekday && wd !== wantWeekday) return;
  if (lastY === null || Math.abs(t.y - lastY) > 1) {
    console.log(`\n--- y=${t.y.toFixed(1)} ---`);
    lastY = t.y;
  }
  console.log(`  [周${wd}] x=${t.x.toFixed(1)}  ${JSON.stringify(t.text)}`);
});
