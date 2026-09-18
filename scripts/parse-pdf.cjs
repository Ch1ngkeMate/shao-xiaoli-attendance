/*
 * parse-pdf.cjs —— 对任意课表 PDF 跑一遍解析器并打印全部记录
 * 用法：node scripts/parse-pdf.cjs <pdf路径> [--json]
 */
const fs = require("fs");
const path = require("path");
const { parseSchedulePdf } = require("../miniprogram/utils/pdf-schedule.js");

const file = process.argv[2];
if (!file) {
  console.error("用法: node scripts/parse-pdf.cjs <pdf路径> [--json]");
  process.exit(1);
}
const asJson = process.argv.includes("--json");

const buf = fs.readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const res = parseSchedulePdf(ab);

if (asJson) {
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

const list = res.courses || [];
console.log("=".repeat(110));
console.log(`### ${path.basename(file)}  共 ${list.length} 条  学期:${res.semesterLabel || "-"}`);
if (res.warnings && res.warnings.length) {
  console.log(`### warnings(${res.warnings.length}):`);
  res.warnings.forEach((w) => console.log("   ! " + (typeof w === "string" ? w : JSON.stringify(w))));
}
console.log("=".repeat(110));

const sorted = list.slice().sort((a, b) => {
  if (a.weekday !== b.weekday) return a.weekday - b.weekday;
  if (a.startSection !== b.startSection) return a.startSection - b.startSection;
  return String(a.courseName).localeCompare(String(b.courseName), "zh");
});

sorted.forEach((c) => {
  console.log(
    `周${String(c.weekday).padEnd(2)} ${String(c.startSection).padStart(2)}-${String(
      c.endSection
    ).padStart(2)}节  ${String(c.courseName).padEnd(16)} 师:${String(
      c.teacher || "-"
    ).padEnd(18)} 室:${String(c.room || "-").padEnd(8)} 周:${String(
      c.weeks || "-"
    ).padEnd(20)} 单双:${c.parity || "-"}`
  );
});
console.log(
  "\n注：解析器不产出「校区」字段 —— 实测所有教务课表的校区都是固定的「南校区」，" +
    "小程序课表模型里也没有这个字段，故不提取。"
);
