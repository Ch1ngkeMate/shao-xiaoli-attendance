/*
 * probe-raw-weekday.cjs —— 打印指定学生 + 指定星期行的「原始碎片」清单
 * 用途：核对解析器输出是否 = PDF 原文（当期望表与实际不符时，看原文裁决）
 * 用法：node scripts/probe-raw-weekday.cjs 陈亚楠 1
 */
const fs = require("fs");
const path = require("path");
const u = require("../miniprogram/utils/pdf-schedule.js");
const I = u._internal;

const BASE =
  "C:/Users/95345/Documents/xwechat_files/wxid_7a7kdwgqe36t22_6212/temp/RWTemp/2026-09";

const MAP = {
  郭亦菲: "4762501c30c8f93654ccd562696edd21/郭亦菲(2026-2027-1)课表.pdf",
  高毅: "7f8fd6e23d92b11491b808c65f5ac8d5/高毅(2026-2027-1)课表.pdf",
  陈亚楠: "69fc4f919837f5dbc514d6c62242b0c6/陈亚楠(2026-2027-1)课表.pdf",
};

const name = process.argv[2];
const wantWd = Number(process.argv[3]);

const file = path.join(BASE, MAP[name]);
const buf = fs.readFileSync(file);
// extractContentStream 接收「字节数组」，不是 ArrayBuffer
const stream = I.extractContentStream(new Uint8Array(buf));
const matrix = I.readContentMatrix(stream);
console.log(`matrix = ${JSON.stringify(matrix)}`);

const rawTexts = I.extractTexts(stream);
// ⚠️ bucketByWeekday 内部会自己做 applyMatrix —— 必须传「原始坐标」
const texts = rawTexts.map((t, i) => ({
  x: t.x,
  y: t.y,
  text: t.text,
  drawOrder: i,
}));

const rows = I.buildWeekdayRows(rawTexts, matrix);
console.log("rows =", JSON.stringify(rows));

const { buckets } = I.bucketByWeekday(texts, rows, matrix);
const items = buckets[wantWd] || [];
console.log(`\n### ${name} 周${wantWd}（共 ${items.length} 个碎片，按 drawOrder 排列）`);
const sorted = items.slice().sort((a, b) => a.drawOrder - b.drawOrder);
sorted.forEach((t) => {
  console.log(
    `#${String(t.drawOrder).padStart(3)} x=${String(t.x).padStart(7)} y=${String(
      t.y
    ).padStart(8)}  ${t.text}`
  );
});

const blocks = I.splitBlocksInRow(items);
console.log(`\n--- splitBlocksInRow → ${blocks.length} 个块 ---`);
blocks.forEach((g, k) => {
  console.log(`\n[块${k}] ${g.map((t) => t.text).join("")}`);
});
