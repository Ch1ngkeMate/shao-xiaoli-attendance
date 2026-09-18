/**
 * 诊断 v3：在设备空间重建网格，并验证「每个单元格应归属哪些文字」
 *
 * 设备空间语义（已由 probe-rect-transform.cjs 证实）：
 *   x 轴 = 节次方向（左小右大 = 节次从早到晚）
 *   y 轴 = 星期方向（下小上大 = 星期一在底部？还是顶部？见下）
 *
 * 表头「星期一」在 y=133，「星期日」在 y=756
 *   → 星期一 y 最小、星期日 y 最大 ⇒ 星期 = 沿 +y 递增
 *
 * 节次编号都在 y≈78（表头上方的编号行），x 从 29(节6) … 567(节5)
 *   → 但这些 x 是「编号文字」的位置，不是列边界。需要另找列边界。
 *
 * 用法：node scripts/probe-grid.cjs
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
    try {
      out.push(zlib.inflateSync(bytes.slice(s, e)).toString("latin1"));
    } catch (_) {}
  }
  return out;
}

function applyCm(x, y, M) {
  return { x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] };
}

function extract(bytes) {
  const content = streams(bytes).join("\n");
  // 找 cm（可能不止一条；这里先取第一条成立的，并检测一致性）
  const cms = [];
  {
    const re = /((?:[\d.\-]+\s+){6})cm/g;
    let m;
    while ((m = re.exec(content)) !== null) cms.push(m[1].trim().split(/\s+/).map(Number));
  }
  const M = cms.length ? cms[0] : [1, 0, 0, 1, 0, 0];

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

  const rectsDev = rectsUser.map((r) => {
    const pts = [
      applyCm(r.x, r.y, M), applyCm(r.x + r.w, r.y, M),
      applyCm(r.x, r.y + r.h, M), applyCm(r.x + r.w, r.y + r.h, M),
    ];
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, top: y1, right: x1, area: (x1 - x0) * (y1 - y0) };
  }).filter((r) => r.w > 0.5 && r.h > 0.5);

  const textsDev = textsUser.map((t) => {
    const p = applyCm(t.x, t.y, M);
    return { x: p.x, y: p.y, text: t.text };
  });

  return { M, cms, rectsDev, textsDev };
}

Object.keys(FILES).forEach((name) => {
  const bytes = fs.readFileSync(path.join(PDF_BASE, FILES[name]));
  const { M, cms, rectsDev, textsDev } = extract(bytes);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`### ${name}   cm 数量=${cms.length}  使用 M=[${M.join(" ")}]`);
  console.log(`  矩形 ${rectsDev.length} 个, 文字 ${textsDev.length} 片`);

  const hdrs = textsDev.filter((t) => /^星期[一二三四五六日天]$/.test(t.text));
  console.log(`  表头: ${hdrs.map((t) => `${t.text.replace("星期","")}@y=${t.y.toFixed(1)}`).join(" ")}`);

  // 设备空间矩形边界聚类（合并相近值）
  function cluster(key) {
    const vals = rectsDev.map((r) => r[key]).sort((a, b) => a - b);
    const out = [];
    vals.forEach((v) => {
      if (!out.length || v - out[out.length - 1].v > 1.5) out.push({ v, n: 1 });
      else { out[out.length - 1].n += 1; out[out.length - 1].v = (out[out.length - 1].v + v) / 2; }
    });
    return out;
  }
  console.log(`  矩形 x 边界簇: ${cluster("x").filter(c=>c.n>=2).map((c) => `${c.v.toFixed(1)}×${c.n}`).join("  ")}`);
  console.log(`  矩形 y 边界簇: ${cluster("y").filter(c=>c.n>=2).map((c) => `${c.v.toFixed(1)}×${c.n}`).join("  ")}`);
});
