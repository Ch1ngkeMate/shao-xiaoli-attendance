/**
 * 诊断 v2：应用 `0 1 -1 0 595 0 cm` 变换后，桌格几何是否自洽？
 *
 * 结论（本脚本要验证的假设）：
 *   这份 PDF 是「横版课表 + 页面旋转」写法：
 *     用户空间：x = 节次方向(左→右是节次递增？待验证)，y = 星期方向
 *     设备空间：x' = 595 - y（星期方向），y' = x（节次方向）
 *   所以 re 矩形在用户空间是「横跨 7 天的大行条」，
 *   只有把 矩形 与 文字 都映射到设备空间，才能做单元格归属。
 *
 * 用法：node scripts/probe-rect-transform.cjs
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PDF_BASE = "C:/Users/95345/Documents/xwechat_files/wxid_7a7kdwgqe36t22_6212/temp/RWTemp/2026-09";
const TARGET = path.join(PDF_BASE, "4762501c30c8f93654ccd562696edd21", "郭亦菲(2026-2027-1)课表.pdf");
const pdf = require(path.resolve(__dirname, "../miniprogram/utils/pdf-schedule.js"));
const { decodePdfString } = pdf._internal;

// ---- 自己解流 ----
function streams(bytes) {
  const l = bytes.toString("latin1");
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(l)) !== null) {
    const s = m.index + m[0].length;
    const e = l.indexOf("endstream", s);
    if (e < 0) continue;
    try {
      out.push(zlib.inflateSync(bytes.slice(s, e)).toString("latin1"));
    } catch (_) {}
  }
  return out;
}

const bytes = fs.readFileSync(TARGET);
const content = streams(bytes).join("\n");

// ---- 应用 cm 变换：新 CTM = M × 旧 CTM；M = [0 1 -1 0 595 0] ----
// PDF 矩阵 [a b c d e f] 作用于点: x' = a*x + c*y + e,  y' = b*x + d*y + f
function applyCm(x, y, M) {
  return { x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] };
}

// 提取所有 re（用户空间）
const rectsUser = [];
{
  const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re\b/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const x = +m[1], y = +m[2], w = +m[3], h = +m[4];
    if (!(w > 0) || !(h > 0)) continue;
    rectsUser.push({ x, y, w, h });
  }
}

// 提取所有 Tm 文字（用户空间）
const textsUser = [];
{
  const re = /((?:[\d.\-]+\s+){6})Tm\s*((?:\/F\d+ [\d.]+ Tf\s*)?)((?:[^T]|T(?!j))*?)Tj/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const n = m[1].trim().split(/\s+/).map(Number);
    if (n.length !== 6 || n.some(Number.isNaN)) continue;
    let t = "";
    const litRe = /\(((?:[^()\\]|\\.)*)\)/g;
    let lm;
    while ((lm = litRe.exec(m[3])) !== null) t += decodePdfString(lm[1]);
    t = t.trim();
    if (!t) continue;
    textsUser.push({ x: n[4], y: n[5], text: t });
  }
}
console.log(`用户空间: ${rectsUser.length} 矩形, ${textsUser.length} 文字\n`);

const M = [0, 1, -1, 0, 595, 0];

// 转设备空间（矩形取四角包围盒）
function rectToDevice(r) {
  const pts = [
    applyCm(r.x, r.y, M),
    applyCm(r.x + r.w, r.y, M),
    applyCm(r.x, r.y + r.h, M),
    applyCm(r.x + r.w, r.y + r.h, M),
  ];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, top: y1, right: x1, area: (x1 - x0) * (y1 - y0) };
}

const rectsDev = rectsUser.map(rectToDevice).filter((r) => r.w > 0.5 && r.h > 0.5);
const textsDev = textsUser.map((t) => {
  const p = applyCm(t.x, t.y, M);
  return { x: p.x, y: p.y, text: t.text };
});

// ---- 设备空间：看 x/y 的取值分布 ----
console.log("=== 设备空间 x 直方图（1pt 桶，只显示有 2 个以上元素的桶 = 表格线位置） ===");
function hist(items, key, label) {
  const b = {};
  items.forEach((it) => {
    const k = Math.round(it[key] * 2) / 2; // 0.5pt 桶
    b[k] = (b[k] || 0) + 1;
  });
  const keys = Object.keys(b).map(Number).sort((a, z) => a - z);
  const hot = keys.filter((k) => b[k] >= 3);
  console.log(`  ${label}: ` + hot.map((k) => `${k}(${b[k]})`).join(" "));
}
hist(rectsDev, "x", "矩形左边界");
hist(rectsDev, "right", "矩形右边界");
hist(rectsDev, "y", "矩形下边界");
hist(rectsDev, "top", "矩形上边界");
console.log();
hist(textsDev, "x", "文字 x");
hist(textsDev, "y", "文字 y");

// ---- 表头文字定位 ----
console.log("\n=== 表头（星期一..星期日）在设备空间的位置 ===");
textsDev
  .filter((t) => /^星期[一二三四五六日天]$/.test(t.text))
  .forEach((t) => console.log(`  "${t.text}"  x=${t.x.toFixed(2)} y=${t.y.toFixed(2)}`));

// ---- 节次编号定位 ----
console.log("\n=== 节次编号在设备空间的位置 ===");
const secs = textsDev.filter((t) => /^\s*\d{1,2}\s*$/.test(t.text));
secs.forEach((t) => console.log(`  "${t.text.trim()}"  x=${t.x.toFixed(2)} y=${t.y.toFixed(2)}`));

// ---- 用设备空间做「最小包含矩形」测试 ----
console.log("\n=== 设备空间：取文字 (207.9, 538.5) 的类型，看是否被正确矩形包含 ===");
const probe = textsUser.filter((t) => /(7-8节)|人体解剖/.test(t.text));
probe.forEach((tu) => {
  const td = applyCm(tu.x, tu.y, M);
  console.log(`\n  "${tu.text.slice(0, 40)}"`);
  console.log(`    用户(${tu.x},${tu.y}) → 设备(${td.x.toFixed(2)},${td.y.toFixed(2)})`);
  const cands = rectsDev.filter(
    (r) => td.x >= r.x - 2 && td.x <= r.right + 2 && td.y >= r.y - 8 && td.y <= r.top + 8
  );
  cands
    .sort((a, b) => a.area - b.area)
    .forEach((r, i) =>
      console.log(
        `    ${i === 0 ? "→" : " "} R x=[${r.x.toFixed(1)},${r.right.toFixed(1)}] y=[${r.y.toFixed(1)},${r.top.toFixed(1)}] area=${r.area.toFixed(0)}`
      )
    );
  if (!cands.length) console.log("    ✗ 无候选");
});
