/**
 * 诊断 v4：把设备空间矩形按「星期行」分组，导出每行的矩形条（真实单元格）
 *
 * 已证实：
 *   星期行 y 边界固定 = [99.1, 202.9] 周一 / [202.9,306.8] 周二 / ... / [722.1,826] 周日
 *   节次编号行 y ∈ [62.7, 99.1]
 *   表头「星期一..日」在各自行内 x=74
 *
 * 待查明：
 *   每行的矩形条（x 范围）到底是什么 —— 是「整行一条」还是「每节课一条」？
 *   若是每节课一条，则 x 边界即 = 该课在节次轴上的跨度，可直接换算节次！
 *
 * 用法：node scripts/probe-rows.cjs [姓名]
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PDF_BASE = "C:/Users/95345/Documents/xwechat_files/wxid_7a7kdwgqe36t22_6212/temp/RWTemp/2026-09";
const FILES = {
  郭亦菲: "4762501c30c8f93654ccd562696edd21/郭亦菲(2026-2027-1)课表.pdf",
  高毅: "7f8fd6e23d92b11491b808c65f5ac8d5/高毅(2026-2027-1)课表.pdf",
  陈亚楠: "69fc4f919837f5dbc514d6c62242b0c6/陈亚楠(2026-2027-1)课表.pdf",
};
const pdf = require(path.resolve(__dirname, "../miniprogram/utils/pdf-schedule.js"));
const { decodePdfString } = pdf._internal;

function streams(bytes) {
  const l = bytes.toString("latin1");
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(l)) !== null) {
    const s = m.index + m[0].length;
    const e = l.indexOf("endstream", s);
    if (e < 0) continue;
    try { out.push(zlib.inflateSync(bytes.slice(s, e)).toString("latin1")); } catch (_) {}
  }
  return out;
}
const applyCm = (x, y, M) => ({ x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] });

function extract(bytes) {
  const content = streams(bytes).join("\n");
  const cmM = [];
  { const re = /((?:[\d.\-]+\s+){6})cm/g; let m;
    while ((m = re.exec(content)) !== null) cmM.push(m[1].trim().split(/\s+/).map(Number)); }
  const M = cmM.length ? cmM[0] : [1, 0, 0, 1, 0, 0];
  const ru = [];
  { const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re\b/g; let m;
    while ((m = re.exec(content)) !== null) { const x=+m[1],y=+m[2],w=+m[3],h=+m[4]; if(!(w>0)||!(h>0))continue; ru.push({x,y,w,h}); } }
  const tu = [];
  { const re = /((?:[\d.\-]+\s+){6})Tm\s*((?:\/F\d+ [\d.]+ Tf\s*)?)((?:[^T]|T(?!j))*?)Tj/g; let m;
    while ((m = re.exec(content)) !== null) {
      const n = m[1].trim().split(/\s+/).map(Number);
      if (n.length !== 6 || n.some(Number.isNaN)) continue;
      let t = ""; const litRe = /\(((?:[^()\\]|\\.)*)\)/g; let lm;
      while ((lm = litRe.exec(m[3])) !== null) t += decodePdfString(lm[1]);
      t = t.trim(); if (!t) continue;
      tu.push({ x: n[4], y: n[5], text: t });
    } }
  const rd = ru.map((r) => {
    const pts=[applyCm(r.x,r.y,M),applyCm(r.x+r.w,r.y,M),applyCm(r.x,r.y+r.h,M),applyCm(r.x+r.w,r.y+r.h,M)];
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    return { x:x0, y:y0, w:x1-x0, h:y1-y0, top:y1, right:x1, area:(x1-x0)*(y1-y0) };
  }).filter((r) => r.w > 0.5 && r.h > 0.5);
  const td = tu.map((t) => { const p = applyCm(t.x, t.y, M); return { x: p.x, y: p.y, text: t.text }; });
  return { M, rd, td };
}

const WD = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const ROWS = [
  { wd: 1, y0: 99.1, y1: 202.9 }, { wd: 2, y0: 202.9, y1: 306.8 },
  { wd: 3, y0: 306.8, y1: 410.6 }, { wd: 4, y0: 410.6, y1: 514.5 },
  { wd: 5, y0: 514.5, y1: 618.3 }, { wd: 6, y0: 618.3, y1: 722.1 },
  { wd: 7, y0: 722.1, y1: 826.0 },
];

const who = process.argv[2] || "郭亦菲";
const bytes = fs.readFileSync(path.join(PDF_BASE, FILES[who]));
const { rd, td } = extract(bytes);

console.log(`### ${who}`);
console.log(`\n=== 节次编号行 (y∈[62.7,99.1]) 的所有文字 ===`);
td.filter((t) => t.y >= 55 && t.y <= 100)
  .sort((a, b) => a.x - b.x)
  .forEach((t) => console.log(`  x=${t.x.toFixed(2).padStart(7)} y=${t.y.toFixed(2)}  "${t.text}"`));

ROWS.forEach(({ wd, y0, y1 }) => {
  // 完全落在该行内的矩形（高度 <= 130 避免跨行大框）
  const inRow = rd
    .filter((r) => r.y >= y0 - 2 && r.top <= y1 + 2 && r.h <= 130)
    .sort((a, b) => a.x - b.x);
  const txts = td
    .filter((t) => t.y >= y0 - 6 && t.y <= y1 + 6)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  console.log(`\n--- ${WD[wd]}  y∈[${y0}, ${y1}] ---`);
  console.log(`  矩形 ${inRow.length} 个:`);
  inRow.forEach((r) => console.log(`     x=[${r.x.toFixed(1).padStart(6)}, ${r.right.toFixed(1).padStart(6)}] w=${r.w.toFixed(1).padStart(6)} h=${r.h.toFixed(1).padStart(5)}`));
  console.log(`  文字 ${txts.length} 片（按 y 降序）:`);
  txts.forEach((t) => console.log(`     y=${t.y.toFixed(1).padStart(6)} x=${t.x.toFixed(2).padStart(7)}  "${t.text.slice(0, 56)}"`));
});
