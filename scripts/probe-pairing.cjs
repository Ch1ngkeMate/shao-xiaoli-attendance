/**
 * probe-pairing.cjs — 打印某份 PDF 某星期的 星/详情 原始坐标，
 * 并在内存里复刻 splitBlocksInRow 的关键中间数组，定位配对失效点。
 */
const fs = require("fs");
const path = require("path");
const P = require("../miniprogram/utils/pdf-schedule.js")._internal;

const BASE = "C:/Users/95345/Documents/xwechat_files/wxid_7a7kdwgqe36t22_6212/temp/RWTemp/2026-09";
const FILES = {
  chen: path.join(BASE, "69fc4f919837f5dbc514d6c62242b0c6", "陈亚楠(2026-2027-1)课表.pdf"),
  gao: path.join(BASE, "7f8fd6e23d92b11491b808c65f5ac8d5", "高毅(2026-2027-1)课表.pdf"),
};

const target = process.argv[2] || "chen";
const wantWeekday = Number(process.argv[3] || 1);

const buf = fs.readFileSync(FILES[target]);

// 复用模块内部函数：这里直接调用导出的解析主流程拿不到中间量，
// 所以重新走一遍内部逻辑（用模块导出的辅助函数）
const content = P.extractContentStream(new Uint8Array(buf));
const matrix = P.readContentMatrix(content);
const rawTexts = P.extractTexts(content, 0, 0, 0);
const texts = rawTexts.map((t) => {
  const p = P.applyMatrix(t.x, t.y, matrix);
  return { x: p.x, y: p.y, text: t.text };
});
const rows = P.buildWeekdayRows(texts, [1, 0, 0, 1, 0, 0]);
const { buckets } = P.bucketByWeekday(texts, rows, [1, 0, 0, 1, 0, 0]);

const items = (buckets[wantWeekday] || []).filter((t) => !P.isTitleText(t.text));
const sorted = items.slice().sort((a, b) => a.x - b.x || b.y - a.y);

console.log(`=== ${target} 周${wantWeekday} 共 ${sorted.length} 片 ===`);
sorted.forEach((t, i) => {
  const flag = P.isTitleText(t.text) ? "T" : " ";
  console.log(`[${String(i).padStart(2)}]${flag} x=${t.x.toFixed(1).padStart(7)} y=${t.y.toFixed(1).padStart(5)}  ${JSON.stringify(t.text)}`);
});

const STAR_TAIL_RE = /[★☆■◆□◇]\s*$/;
const starIdx = [];
sorted.forEach((t, i) => {
  if (P.isTitleText(t.text)) return;
  if (STAR_TAIL_RE.test(t.text)) starIdx.push(i);
});
console.log("\nstarIdx =", starIdx);

const SECTION_RE = /\((\d{1,2})\s*[-–—~]\s*(\d{1,2})\s*节\)/;
const DETAIL_SECTION_RE = /(\d{1,2})\s*[-–—~]\s*(\d{1,2})\s*节|(?<![\d-])(\d{1,2})\s*节(?![\d-])/;
const isDetail = (t) => {
  const str = typeof t === "string" ? t : (t && t.text) || "";
  if (!str) return false;
  const m = DETAIL_SECTION_RE.exec(str);
  return !!m && m.index <= 4;
};
console.log("正则源 =", DETAIL_SECTION_RE.source);
console.log("直接测 =", JSON.stringify(DETAIL_SECTION_RE.exec(sorted[2].text)));
console.log("index =", DETAIL_SECTION_RE.exec(sorted[2].text).index);

const detailIdx = [];
sorted.forEach((t, i) => {
  if (P.isTitleText(t.text)) return;
  const m = DETAIL_SECTION_RE.exec(t.text);
  console.log(`  [dbg ${i}] isDetail=${isDetail(t)} idx=${m ? m.index : "-"} same=${t === sorted[i]} text=${JSON.stringify(t.text).slice(0, 24)}`);
  if (isDetail(t)) detailIdx.push(i);
});
console.log("detailIdx =", detailIdx);

// 逐片复核：把每片的正则匹配结果打出来，排除「数组为空但字符串能匹配」的诡异情况
const recheck = sorted.map((t, i) => {
  const m = DETAIL_SECTION_RE.exec(t.text);
  return `${i}:${m ? m.index : "-"}`;
});
console.log("每片正则 index =", recheck.join(" "));

const firstStarX = sorted[starIdx[0]].x;
const orphanDetails = detailIdx.filter((di) => sorted[di].x < firstStarX - 1e-6);
const pairedDetails = detailIdx.filter((di) => sorted[di].x >= firstStarX - 1e-6);
console.log("firstStarX =", firstStarX);
console.log("orphanDetails =", orphanDetails, "pairedDetails =", pairedDetails);

const starOfDetail = {};
pairedDetails.forEach((di, k) => {
  if (k < starIdx.length) starOfDetail[di] = starIdx[k];
});
console.log("starOfDetail =", starOfDetail);

console.log("\n--- 实际 splitBlocksInRow 结果 ---");
const blocks = P.splitBlocksInRow(items);
blocks.forEach((g, bi) => {
  console.log(`块${bi} x=${g[0].x.toFixed(1)} 首=${JSON.stringify(g[0].text)} 含 ${g.length} 片`);
  g.forEach((t) => console.log(`      x=${t.x.toFixed(1).padStart(7)} ${JSON.stringify(t.text)}`));
});
