/**
 * probe-pairing2.cjs — 用模块自己的 isTitleText 完整复刻 splitBlocksInRow 循环
 * 并把每次 push 的 k 打出来。
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
const content = P.extractContentStream(new Uint8Array(buf));
const matrix = P.readContentMatrix(content);
const texts = P.extractTexts(content, 0, 0, 0).map((t) => {
  const p = P.applyMatrix(t.x, t.y, matrix);
  return { x: p.x, y: p.y, text: t.text };
});
const rows = P.buildWeekdayRows(texts, [1, 0, 0, 1, 0, 0]);
const { buckets } = P.bucketByWeekday(texts, rows, [1, 0, 0, 1, 0, 0]);
const items = (buckets[wantWeekday] || []).filter((t) => !P.isTitleText(t.text));

// ---- 完整复刻 ----
const sorted = items.slice().sort((a, b) => a.x - b.x || b.y - a.y);
const STAR_TAIL_RE = /[★☆■◆□◇]\s*$/;
const DETAIL_SECTION_RE = /(\d{1,2})\s*[-–—~]\s*(\d{1,2})\s*节|(?<![\d-])(\d{1,2})\s*节(?![\d-])/;
const isDetail = (t) => {
  const m = DETAIL_SECTION_RE.exec(t.text);
  return !!m && m.index <= 4;
};

const starIdx = [];
sorted.forEach((t, i) => {
  if (P.isTitleText(t.text)) return;
  if (STAR_TAIL_RE.test(t.text)) starIdx.push(i);
});
const detailIdx = [];
sorted.forEach((t, i) => {
  console.log("LOOP", i, P.isTitleText(t.text), isDetail(t));
  if (P.isTitleText(t.text)) return;
  if (isDetail(t.text)) detailIdx.push(i);
});
console.log(">>> 循环后立即打印 detailIdx =", JSON.stringify(detailIdx), "sorted.length =", sorted.length);
[2, 3].forEach((i) => {
  console.log(`  >>> guard[${i}] isTitleText=${P.isTitleText(sorted[i].text)} typeof=${typeof P.isTitleText(sorted[i].text)}`);
});
console.log("DETAIL_SECTION_RE.source =", DETAIL_SECTION_RE.source);
sorted.slice(0, 5).forEach((t, i) => {
  const m = DETAIL_SECTION_RE.exec(t.text);
  console.log(`  chk ${i} m=${m ? m.index : "null"} isDetail=${isDetail(t)} text=${JSON.stringify(t.text).slice(0, 26)}`);
});
const firstStarX = sorted[starIdx[0]].x;
const orphanDetails = detailIdx.filter((di) => sorted[di].x < firstStarX - 1e-6);
const pairedDetails = detailIdx.filter((di) => sorted[di].x >= firstStarX - 1e-6);
const starOfDetail = {};
pairedDetails.forEach((di, k) => {
  if (k < starIdx.length) starOfDetail[di] = starIdx[k];
});

console.log("starIdx =", starIdx, " detailIdx =", detailIdx, " starOfDetail =", starOfDetail);

const blocksMap = starIdx.map(() => []);
const orphans = [];
starIdx.forEach((si, k) => blocksMap[k].push(sorted[si]));

sorted.forEach((t, i) => {
  if (P.isTitleText(t.text)) return;
  if (starIdx.indexOf(i) >= 0) return;
  if (starOfDetail[i] !== undefined) {
    const k = starIdx.indexOf(starOfDetail[i]);
    console.log(`  push i=${i} x=${t.x} -> 块${k} (starOfDetail=${starOfDetail[i]})`);
    blocksMap[k].push(t);
    return;
  }
  if (orphanDetails.length) {
    const lastOrphanX = Math.max.apply(null, orphanDetails.map((di) => sorted[di].x));
    if (t.x <= lastOrphanX + 1e-6) { orphans.push(t); return; }
  }
  let k = -1;
  for (let j = 0; j < starIdx.length; j += 1) {
    if (sorted[starIdx[j]].x <= t.x) k = j;
    else break;
  }
  if (k < 0) { orphans.push(t); return; }
  console.log(`  push i=${i} x=${t.x} -> 块${k} (fallback)`);
  blocksMap[k].push(t);
});

console.log("\n每块片数 =", blocksMap.map((g) => g.length));
blocksMap.forEach((g, k) => {
  if (!g.length) return;
  console.log(`块${k}: ${g.map((t) => t.text.slice(0, 14)).join(" | ")}`);
});
