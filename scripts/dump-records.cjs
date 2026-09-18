/*
 * dump-records.cjs —— 打印课表 PDF 的全部解析记录（按学生分组，按星期排序）
 * 用途：把「解析器实际输出」与「测试期望表」逐条对照，订正期望表。
 * 用法：node scripts/dump-records.cjs [学生名]
 *
 * 路径由 _pdf-fixtures.cjs 多目录查找，不写死（微信会清临时目录）。
 */
const fs = require("fs");
const path = require("path");
const fixtures = require("./_pdf-fixtures.cjs");
const { parseSchedulePdf } = require("../miniprogram/utils/pdf-schedule.js");

const TARGETS = ["郭亦菲", "高毅", "陈亚楠", "李奕然"];

const only = process.argv[2];

for (const name of TARGETS) {
  if (only && name !== only) continue;
  const file = fixtures.resolve(name);
  if (!file) {
    console.log(`\n!! 找不到 ${name} 的课表 PDF（已查找：${fixtures.ROOTS.join(" | ")}）`);
    continue;
  }
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const res = parseSchedulePdf(ab);

  const list = res.courses || res || [];
  console.log(`\n${"=".repeat(100)}`);
  console.log(`### ${name}  共 ${list.length} 条    ${file}`);
  console.log("=".repeat(100));

  const sorted = list.slice().sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    if (a.startSection !== b.startSection) return a.startSection - b.startSection;
    return String(a.courseName).localeCompare(String(b.courseName), "zh");
  });

  sorted.forEach((c) => {
    console.log(
      `周${c.weekday} ${String(c.startSection).padStart(2)}-${String(
        c.endSection
      ).padStart(2)}节  ${String(c.courseName).padEnd(16)} 师:${String(
        c.teacher || "-"
      ).padEnd(18)} 室:${String(c.room || "-").padEnd(8)} 周:${String(
        c.weeks || "-"
      ).padEnd(20)} 单双:${c.parity || "-"}`
    );
  });

  (res.warnings || []).forEach((w) => {
    console.log(`  [${w.level}] ${w.code} ×${w.count}  ${w.message}`);
    if (w.code === "OTHER_COURSES" && w.items) {
      w.items.forEach((i) => console.log(`      · ${i.courseName} | ${i.teacher || "-"} | ${i.weeks || "-"}`));
    }
  });
}

