/**
 * 诊断：给定一段粘连 blob，打印 splitFields 与 parseCell 的结果。
 * 用法：node scripts/probe-fields.cjs
 */
const mod = require("../miniprogram/utils/pdf-schedule.js");
const I = mod._internal;

const cases = [
  // 郭亦菲 周一 中医基础理论（真实顺序拼接）
  "中医基础理论★2027-1)-130008-01/教学班组(1-2节)3-5周,9-19周/校区:南成:中医定向2601/考核方式校区/场地:3505/教师:张景明:考试/选课备注:/课程学时/教学班:(2026-2027-1)-组成:理论:32/周学时:2/总学110263-11/教学班组成:中时:32/学分:1定向2601/考核方式:考试/选",
  // 高毅 周一 大学体育
  "大学体育（一）★(7-8节)3周/校区:南校区/场地:操场/教师:张川,华永兰时:32/学分:2.0",
  // 陈亚楠 周一 思想道德与法治
  "思想道德与法治★(11-12节)3-5周,9-17周/校区:南校区/场地:5501/教师:黄鹤师:霍丁鹏/学分:2.0",
];

cases.forEach((blob, i) => {
  console.log(`\n===== case ${i + 1} =====`);
  console.log("blob:", JSON.stringify(blob.slice(0, 120)));
  console.log("fields:", JSON.stringify(I.splitFields(blob), null, 0));
  const cell = I.parseCell(blob);
  console.log("parseCell:", JSON.stringify(cell));
});
