/**
 * probe-cell-orig.cjs — 打印某份 PDF 某星期的碎片的
 * 「原始坐标(x,y) + 变换后坐标」对照，判断真实的排版方向。
 */
const fs = require("fs");
const path = require("path");
const P = require("../miniprogram/utils/pdf-schedule.js")._internal;

const BASE = "C:/Users/95345/Documents/xwechat_files/wxid_7a7kdwgqe36t22_6212/temp/RWTemp/2026-09";
const FILES = {
  chen: path.join(BASE, "69fc4f919837f5dbc514d6c62242b0c6", "陈亚楠(2026-2027-1)课表.pdf"),
  gao: path.join(BASE, "7f8fd6e23d92b11491b808c65f5ac8d5", "高毅(2026-2027-1)课表.pdf"),
  guo: path.join(BASE, "4762501c30c8f93654ccd562696edd21", "郭亦菲(2026-2027-1)课表.pdf"),
};
const target = process.argv[2] || "chen";
const wantWeekday = Number(process.argv[3] || 2);

const buf = fs.readFileSync(FILES[target]);
const content = P.extractContentStream(new Uint8Array(buf));
const matrix = P.readContentMatrix(content);
console.log("matrix =", matrix);

const raw = P.extractTexts(content, 0, 0, 0);
const texts = raw.map((t) => {
  const p = P.applyMatrix(t.x, t.y, matrix);
  return { ox: t.x, oy: t.y, x: p.x, y: p.y, text: t.text };
});
const rows = P.buildWeekdayRows(texts, [1, 0, 0, 1, 0, 0]);
const { buckets } = P.bucketByWeekday(texts, rows, [1, 0, 0, 1, 0, 0]);
const items = (buckets[wantWeekday] || []).filter((t) => !P.isTitleText(t.text)).map((t) => ({
  x: t.x,
  y: t.y,
  text: t.text,
  // 反推原始坐标（matrix = [0,1,-1,0,595,0] ⇒ x' = 595 - oy, y' = ox）
  oy: 595 - t.x,
  ox: t.y,
}));

console.log(`=== ${target} 周${wantWeekday} 共 ${items.length} 片（按 device y 再按 device x 排序）===`);
items
  .slice()
  .sort((a, b) => a.y - b.y || a.x - b.x)
  .forEach((t) => {
    console.log(
      `oy=${t.oy.toFixed(1).padStart(7)} ox=${t.ox.toFixed(1).padStart(7)}  |  x'=${t.x.toFixed(1).padStart(7)} y'=${t.y.toFixed(1).padStart(5)}  ${JSON.stringify(t.text).slice(0, 34)}`
    );
  });
