/**
 * 课表 PDF 解析回归测试（Node 环境，直接调小程序的解析模块）
 *
 * 为什么用 Node 跑：小程序里没有测试框架，但这套解析是纯函数 + 只在末尾
 * 触碰 wx API 之外的东西，可以直接 require 进来跑。这样改一行解析逻辑就能
 * 立刻用真实 PDF 验证，不用每次去微信开发者工具里手动点。
 *
 * 用法：
 *   node scripts/test-pdf-schedule.cjs
 *   node scripts/test-pdf-schedule.cjs <某个.pdf>     # 指定单份
 *
 * 退出码：0 = 全部通过；1 = 有断言失败。
 */

const fs = require("fs");
const path = require("path");
const fixtures = require("./_pdf-fixtures.cjs");

const ROOT = path.resolve(__dirname, "..");
const MOD = path.join(ROOT, "miniprogram", "utils", "pdf-schedule.js");

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log(`  [OK]   ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** 小程序模块用了 module.exports，Node 可直接 require */
function loadParser() {
  delete require.cache[require.resolve(MOD)];
  return require(MOD);
}

// ---------------------------------------------------------------------------
// 1. 坐标换算：实测结论是「不做换算」
// ---------------------------------------------------------------------------
console.log("\n=== 1. rotatePoint 行为（实测：恒等，不做换算）===");
{
  const { rotatePoint, readPageRotation, readMediaBox } = loadParser()._internal;
  const W = 595;
  const H = 842;

  // 所有 rotation 值都原样返回。
  // 原因：教务课表虽带 /Rotate 90，但内容流坐标本来就是阅读方向，
  // 换算反而会把详情行翻到课程名上面 → 切片顺序错乱。
  [0, 90, 180, 270].forEach((rot) => {
    const p = rotatePoint(100, 200, rot, W, H);
    check(`R=${rot} 坐标原样保留`, p.x === 100 && p.y === 200, JSON.stringify(p));
  });

  // readPageRotation / readMediaBox 仅作诊断，不应影响结果
  check("readPageRotation 是函数", typeof readPageRotation === "function");
  const mb = readMediaBox(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  check("无 MediaBox 时回退 A4", mb.w === 595 && mb.h === 842, JSON.stringify(mb));
}

// ---------------------------------------------------------------------------
// 1b. 内容流拼接（旧实现只取最大的一条 → 丢表头）
// ---------------------------------------------------------------------------
console.log("\n=== 1b. 内容流拼接 ===");
{
  // 旧实现用「取最大」策略，实测郭亦菲课表表头在 stream 0（较小），
  // 正文在 stream 1（最大），导致表头被整个丢掉 → 报「没识别到星期表头」。
  // 现在改为全部拼接，这里用真实 PDF 验证「抓到段数明显多于单条流」。
  const p = fixtures.resolve("郭亦菲");
  if (fs.existsSync(p)) {
    const { extractContentStream, extractTexts } = loadParser()._internal;
    const buf = fs.readFileSync(p);
    const content = extractContentStream(buf);
    const texts = extractTexts(content, 0, 595, 842);
    // 单条最大流实测只能抓到 109 段，拼接后可到 200+ 段
    check("拼接后抓到 > 180 段文字", texts.length > 180, `${texts.length} 段`);
    const hdr = texts.filter((t) => /^星期[一二三四五六日]$/.test(t.text));
    check("7 个星期表头全部在位", hdr.length === 7, `${hdr.length} 个`);
  } else {
    console.log("  [SKIP] 真实 PDF 不在本机");
  }
}

// ---------------------------------------------------------------------------
// 2. 单元测试：列定位（旧实现的主要 bug 点）
// ---------------------------------------------------------------------------
console.log("\n=== 2. locateColumn 列归属 ===");
{
  const { locateColumn } = loadParser()._internal;
  // 复刻实测到的郭亦菲课表列边界（表头 x - 33.92）
  const cols = [
    { weekday: 1, left: 99.08 },
    { weekday: 2, left: 202.93 },
    { weekday: 3, left: 306.77 },
    { weekday: 4, left: 410.62 },
    { weekday: 5, left: 514.46 },
    { weekday: 6, left: 618.31 },
    { weekday: 7, left: 722.16 },
  ];
  const colWidth = 103.85;

  check("列左边界 → 该列", locateColumn(99.08, cols, colWidth) === 1);
  check("列中心 → 该列", locateColumn(150, cols, colWidth) === 1);
  // 202.93 是第 1 列右边界/第 2 列左边界，落在两列正中。
  // 语义：PDF 文字的 x 是起点、左对齐，压在边界上应属于右侧列（第 2 列）。
  // 旧实现会返回 0（判不出）把文字丢掉，这里固化「偏向右侧」的行为。
  check(
    "两列正中 → 偏向右侧列（第 2 列）",
    locateColumn(202.93, cols, colWidth) === 2,
    `得到 ${locateColumn(202.93, cols, colWidth)}`,
  );
  check("第 2 列中心 → 第 2 列", locateColumn(254.85, cols, colWidth) === 2);
  check("第五列 → 第五列", locateColumn(550, cols, colWidth) === 5);
  check("第七列 → 第七列", locateColumn(760, cols, colWidth) === 7);
  check("第七列左边界 → 第七列", locateColumn(722.16, cols, colWidth) === 7);

  // 旧实现在这里会兜底成 1，把「星期六」的课并进「星期一」
  check(
    "落在星期六列的文字不会被错误归到星期一",
    locateColumn(640, cols, colWidth) === 6,
    `得到 ${locateColumn(640, cols, colWidth)}`,
  );

  // 明显在表格之外的坐标应返回 0（无法判断），而不是硬塞给第一列
  check(
    "远在表外的坐标返回 0（不硬塞第一列）",
    locateColumn(10, cols, colWidth) === 0,
    `得到 ${locateColumn(10, cols, colWidth)}`,
  );
}

// ---------------------------------------------------------------------------
// 3. 单元测试：v5 星期行模型 + 绘制顺序分块
//
// v4 的「节次锚点 / 最近节次 / 单元格归属」几何模型已废弃并删除，本段改为
// 覆盖 v5 的四个关键件：
//   · applyMatrix    —— 内容流 cm 变换（90° 旋转模板）
//   · buildWeekdayRows —— 由星期表头推出行带边界
//   · bucketByWeekday  —— 只用 y 判星期（关键：margin 必须极紧）
//   · splitBlocksInRow —— **只靠绘制顺序** 分块（几何重合时唯一可行解）
// ---------------------------------------------------------------------------
console.log("\n=== 3. v5 cm 变换 ===");
{
  const { applyMatrix, readContentMatrix } = loadParser()._internal;

  // 实测三份 PDF 都是 `0 1 -1 0 595 0 cm`：90° 旋转 + 平移
  const m = [0, 1, -1, 0, 595, 0];
  const p = applyMatrix(100, 200, m);
  // x' = 0*100 + (-1)*200 + 595 = 395
  // y' = 1*100 + 0*200 + 0     = 100
  check("applyMatrix: x' = 595 - y", p.x === 395, JSON.stringify(p));
  check("applyMatrix: y' = x", p.y === 100, JSON.stringify(p));

  const id = applyMatrix(100, 200, [1, 0, 0, 1, 0, 0]);
  check("单位矩阵不变换坐标", id.x === 100 && id.y === 200, JSON.stringify(id));

  check("readContentMatrix 是函数", typeof readContentMatrix === "function");
}

console.log("\n=== 3b. buildWeekdayRows 行带边界 ===");
{
  const { buildWeekdayRows, applyMatrix } = loadParser()._internal;
  const m = [0, 1, -1, 0, 595, 0];

  // 三份 PDF 的星期表头（原始坐标）：device x 是星期方向
  // 变换后 x' = 595 - y，y' = x —— 表头的 device x 就是行中心
  const headers = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
    x: 133 + (wd - 1) * 103.85,
    y: 74,
    text: `星期${"一二三四五六日"[wd - 1]}`,
  }));

  const rows = buildWeekdayRows(headers, m);
  check("抽出 7 个星期行", rows.length === 7, `${rows.length} 个`);
  check("行按星期升序", rows.every((r, i) => r.weekday === i + 1));
  check(
    "行带互不重叠",
    rows.every((r, i) => i === 0 || r.y0 >= rows[i - 1].y1 - 0.01),
    rows.map((r) => `${r.weekday}:${r.y0.toFixed(1)}-${r.y1.toFixed(1)}`).join(" "),
  );
  check(
    "行高≈103.85",
    Math.abs(rows[0].rowH - 103.85) < 0.5,
    String(rows[0].rowH),
  );
}

console.log("\n=== 3c. bucketByWeekday 只用 y 判星期 ===");
{
  const { bucketByWeekday, buildWeekdayRows } = loadParser()._internal;
  const m = [0, 1, -1, 0, 595, 0];
  const headers = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
    x: 133 + (wd - 1) * 103.85,
    y: 74,
    text: `星期${"一二三四五六日"[wd - 1]}`,
  }));
  const rows = buildWeekdayRows(headers, m);

  // ⚠️ 坐标轴提醒：bucketByWeekday 内部会做 cm 变换，
  //    device x  → 变换后 y'（= 星期方向）
  //    device y  → 变换后 x'（= 节次/阅读方向）
  // 所以「落在星期 N」要设置 **device x** = 行中心；device y 随便给个表内值即可。
  const centerX = (wd) => 133 + (wd - 1) * 103.85;
  const texts = [
    { x: centerX(1), y: 100, text: "周1课A" },
    { x: centerX(2), y: 100, text: "周2课B" },
    { x: centerX(4), y: 300, text: "周4课C" },
    { x: 5, y: 5, text: "页脚" }, // device x=5 → 在所有行带之外
  ];
  const { buckets, unassigned } = bucketByWeekday(texts, rows, m);
  check("周1 命中 1 条", (buckets[1] || []).length === 1, JSON.stringify(buckets[1]));
  check("周2 命中 1 条", (buckets[2] || []).length === 1, JSON.stringify(buckets[2]));
  check("周4 命中 1 条", (buckets[4] || []).length === 1, JSON.stringify(buckets[4]));
  check("行外文字进 unassigned（不静默丢弃）", unassigned.length === 1, JSON.stringify(unassigned));

  // ⚠️ 关键回归：节次编号行 device x=75.4 / 78.1，距周1 行带下界 81.075 仅 3pt。
  //    若 margin 放宽到「行高×12%」(≈12.5pt)，编号行会被吸进周1 并污染分块。
  const numLine = [{ x: 78.1, y: 100, text: "1" }];
  const r2 = bucketByWeekday(numLine, rows, m);
  check(
    "节次编号行(device x=78.1)不被吸进周1",
    (r2.buckets[1] || []).length === 0,
    JSON.stringify(r2.buckets[1]),
  );
}

console.log("\n=== 3d. splitBlocksInRow 绘制顺序分块 ===");
{
  const { splitBlocksInRow } = loadParser()._internal;

  // 场景 A：标准情况 —— 课名行(以★结尾)打头，详情跟随
  const A = [
    { text: "中医基础理论★", x: 89.5, drawOrder: 0 },
    { text: "(1-2节)3-5周", x: 101.5, drawOrder: 1 },
    { text: "/场地:3505/教师:张景明", x: 113.5, drawOrder: 2 },
    { text: "大学英语（一）★", x: 190, drawOrder: 3 },
    { text: "(3-4节)3-5周", x: 202, drawOrder: 4 },
  ];
  const blocksA = splitBlocksInRow(A);
  check("场景A：切成 2 块", blocksA.length === 2, `${blocksA.length} 块`);
  check(
    "场景A：块0 = 中医基础理论",
    blocksA[0].map((t) => t.text).join("").startsWith("中医基础理论★"),
    blocksA[0].map((t) => t.text).join(""),
  );
  check(
    "场景A：块1 = 大学英语（一）",
    blocksA[1].map((t) => t.text).join("").startsWith("大学英语（一）★"),
  );

  // 场景 B：⚠️ 决定性反例 —— 两门课的碎片 x/y 完全相同，只能靠 drawOrder 区分。
  //   实测高毅周1：孤儿A #108 x=28.0 y=104.080 与 孤儿B #193 x=28.0 y=104.080
  //   若按 x 排序或做几何聚类，这两门课必然混在一起。
  const B = [
    { text: "医古文★", x: 89.5, y: 104.08, drawOrder: 10 },
    { text: "(3-4节)9-12周", x: 101.5, y: 104.08, drawOrder: 11 },
    { text: "(3-4节)13-17周", x: 28.0, y: 104.08, drawOrder: 12 }, // 与下面 x/y 全等
    { text: "旧记录碎片", x: 28.0, y: 104.08, drawOrder: 13 },
  ];
  const blocksB = splitBlocksInRow(B);
  check(
    "场景B：坐标重合的碎片不被按 x 重排（按 drawOrder 保持原序）",
    blocksB.length === 0 || blocksB[0].map((t) => t.text).join("").indexOf("9-12周") <
      blocksB[0].map((t) => t.text).join("").indexOf("13-17周"),
    JSON.stringify(blocksB.map((g) => g.map((t) => t.text).join(""))),
  );

  // 场景 C：★ 之前的碎片是孤儿；只有含节次的孤儿才成块
  const C = [
    { text: "(3-4节)10-11周/场地:5710/教师:王域辰", x: 28.0, drawOrder: 0 },
    { text: "(3-4节)12-13周/场地:5710/教师:林洁", x: 40.0, drawOrder: 1 },
  ];
  const blocksC = splitBlocksInRow(C);
  check(
    "场景C：含节次的孤儿自成一类（不丢弃）",
    blocksC.length === 1,
    `${blocksC.length} 块`,
  );

  // 场景 D：★ 出现在块中间 → 归一化（★ 移到该块块首）
  //   注意：★ 之前的碎片若是**孤儿**（没有前置 ★），会独立成孤儿块而不是被并进 ★ 块。
  //   这不是 bug —— 实测陈亚楠周2 的「孤儿详情」正是这种形态（左侧被裁切、无 ★）。
  const D = [
    { text: "医古文★", x: 30, drawOrder: 0 },
    { text: "/场地:5601", x: 50, drawOrder: 1 },
    { text: "(1-2节)3-4周", x: 40, drawOrder: 2 }, // ★ 之后但被乱序绘制
  ];
  const blocksD = splitBlocksInRow(D);
  check(
    "场景D：★ 块内乱序时 ★ 仍在块首",
    blocksD.length === 1 && blocksD[0][0].text === "医古文★",
    JSON.stringify(blocksD.map((g) => g.map((t) => t.text).join(""))),
  );

  // 场景 E：★ 之前就有碎片 → 那些碎片是孤儿（左侧被裁切的课），不并入 ★ 块
  const E = [
    { text: "(1-2节)3-4周", x: 40, drawOrder: 0 }, // 孤儿，绘制在前
    { text: "医古文★", x: 30, drawOrder: 1 },
    { text: "/场地:5601", x: 50, drawOrder: 2 },
  ];
  const blocksE = splitBlocksInRow(E);
  check(
    "场景E：★ 之前的碎片独立成孤儿块（不误并入后一门课）",
    blocksE.length === 2,
    JSON.stringify(blocksE.map((g) => g.map((t) => t.text).join(""))),
  );

  check("空输入返回空数组", splitBlocksInRow([]).length === 0);
}

// ---------------------------------------------------------------------------
// 3b. 课程名清洗（实测残留：「中医基础理论★2027-1)-130008-01」）
// ---------------------------------------------------------------------------
console.log("\n=== 3b. cleanCourseName 清洗 ===");
{
  const { cleanCourseName, isCourseNameLine, pickSemesterLabel, splitFields, cleanFieldValue, parseCell } =
    loadParser()._internal;

  check("去掉尾部装饰星号", cleanCourseName("中医基础理论★") === "中医基础理论", cleanCourseName("中医基础理论★"));
  check(
    "截断粘连的课程号残片",
    cleanCourseName("中医基础理论★2027-1)-130008-01") === "中医基础理论",
    cleanCourseName("中医基础理论★2027-1)-130008-01"),
  );
  check(
    "截断粘连的学时详情",
    cleanCourseName("大学体育（一）★:80/周学时:6/总学时:80/学分") === "大学体育（一）",
    cleanCourseName("大学体育（一）★:80/周学时:6/总学时:80/学分"),
  );
  check(
    "截断粘连的班级串",
    cleanCourseName("医古文★医2603;中西医2604/考核方") === "医古文",
    cleanCourseName("医古文★医2603;中西医2604/考核方"),
  );
  check("保留带括号的完整课名", cleanCourseName("人体解剖学（一）★") === "人体解剖学（一）", cleanCourseName("人体解剖学（一）★"));
  check("过短返回空串", cleanCourseName("★") === "", cleanCourseName("★"));
  check("空输入返回空串", cleanCourseName("") === "");

  // isCourseNameLine 负例（详情碎片）
  const detailFrags = [
    "地:5803/教师:外聘1,李维强",
    "成:中医定向2601/考核方式",
    ":考试/选课备注:/课程学时",
    "组成:理论:32/周学时:2/总学",
    "时:32/学分:1",
    "2027-1)-130008-01/教学班组",
    "(1-2节)3-5周,9-19周/校区:南",
    "学号：526010801548",
    "2601/考核方式:未安排/选课",
  ];
  detailFrags.forEach((f) => {
    check(`碎片不算课程名：[${f.slice(0, 20)}]`, isCourseNameLine(f) === false);
  });
  // 正例
  ["中医基础理论★", "大学英语（一）★", "人体解剖学（一）★", "医古文★"].forEach((f) => {
    check(`真实课名被识别：[${f}]`, isCourseNameLine(f) === true);
  });

  // pickSemesterLabel
  const titles = [
    { text: "学号：526010801548" },
    { text: "郭亦菲课表" },
    { text: "2026-2027学年第1学期" },
  ];
  check(
    "优先选学期名",
    pickSemesterLabel(titles) === "2026-2027学年第1学期",
    pickSemesterLabel(titles),
  );
  check("无学期名时退化为课表名", pickSemesterLabel([{ text: "学号：1" }, { text: "张三课表" }]) === "张三课表");
  check("无可用标题返回空串", pickSemesterLabel([{ text: "学号：1" }, { text: "打印时间:2026-09-17" }]) === "");

  // -------------------------------------------------------------------------
  // 3c. 详情字段清洗（教师 / 房间）
  //
  // 这些用例全部来自真实 PDF 的实测污染形态：碎片被按字符块切开后重新粘连，
  // 上一个字段名的残片会插进下一个字段值里。裸正则处理不了，必须靠
  // splitFields + cleanFieldValue 两步。
  // -------------------------------------------------------------------------
  const teacherCases = [
    ["石馨心学班组成", "石馨心", "`教学班组成` 的残片 `学班组成`"],
    ["张川,华永兰时", "张川,华永兰", "`学时` 的残片 `时`"],
    ["张:2.0川,华永兰", "张川,华永兰", "学分 2.0 被切碎插进姓名中间"],
    ["史旋100319-05", "史旋", "粘连课程号"],
    /*
     * ⚠️ 这条曾经写成期望 `黄鹤师` 不变 —— 那是**把 bug 当成规格**。
     * 实测原文是 `教师:黄鹤` + `师:霍丁鹏`（下一条碎片的 `教师:` 被切成 `师:`），
     * 拼接后成 `黄鹤师`。正确结果是 `黄鹤`。
     */
    ["黄鹤师", "黄鹤", "`教师:霍丁鹏` 的残片 `师`"],
    ["外聘", "外聘", "两字正常值"],
    ["外聘1,李维强", "外聘1,李维强", "多人含序号"],
    ["崔营,张", "崔营,张", "被截断的第二个名字保留"],
  ];
  teacherCases.forEach(([input, want, why]) => {
    const got = cleanFieldValue(input, "teacher");
    check(`教师清洗 [${input}] → [${want}]（${why}）`, got === want, got);
  });

  const roomCases = [
    ["-130008-01", "", "课程号不得当教室"],
    ["2027-1)-130008-01", "", "课程号残片不得当教室"],
    ["2405", "2405", "真实教室号保留"],
    ["操场", "操场", "中文场地保留"],
    ["南校区", "南校区", "校区保留"],
  ];
  roomCases.forEach(([input, want, why]) => {
    const got = cleanFieldValue(input, "room");
    check(`房间清洗 [${input}] → [${want || "空"}]（${why}）`, got === want, got);
  });

  // splitFields：值须在下一个字段名处截断
  const fields = splitFields(
    "3-5周/校区:南校区/场地:5501/教师:黄鹤师:霍丁鹏/学分:2.0",
  );
  check("splitFields 取到场地", fields["场地"] === "5501", fields["场地"]);
  check("splitFields 截断后被下一个字段名污染", fields["教师"] === "黄鹤师", fields["教师"]);
  check("splitFields 取到校区", fields["校区"] === "南校区", fields["校区"]);

  // parseCell：周次不得取到课程号里的数字
  const cell = parseCell("中医基础理论★2027-1)-130008-01/教学班组(1-2节)3-5周,9-19周/校区:南成:中医定向2601/考核方式校区/场地:3505/教师:张景明");
  check("parseCell 周次不含课程号", cell.weeks === "3-5周,9-19周", cell.weeks);
  check("parseCell 节次正确", cell.startSection === 1 && cell.endSection === 2);
  check("parseCell 场地正确", cell.room === "3505", cell.room);
  check("parseCell 教师正确", cell.teacher === "张景明", cell.teacher);

  // -------------------------------------------------------------------------
  // parseCell：单双周标记必须保留（Task #6）
  //
  // 旧 WEEKS_RE 只抓「数字+周」，`11-13周(单)` 被解析成 `11-13周`，
  // 单周信息**在上游就丢了**，下游课表逻辑无法恢复。
  // -------------------------------------------------------------------------
  const parityCases = [
    ["(11-12节)11-13周(单)/校区:南校区/场地:2004/教师:常", "单", "郭亦菲/高毅 国家安全教育"],
    ["(11-12节)3周(双)/校区:南校区/场地:2001/教师:宋文佳", "双", "双周课"],
    ["(11-12节)16-18周/校区:南校区/场地:体育馆/教师:外聘1", "", "无标记 = 每周"],
    ["(1-2节)3-5周,9-19周/校区:南校区/场地:3505/教师:张景明", "", "多段周次且无标记"],
  ];
  parityCases.forEach(([input, want, why]) => {
    const got = parseCell(input).parity;
    check(`parseCell 单双周 [${input.slice(0, 22)}…] → [${want || "无"}]（${why}）`, got === want, got);
  });
  // 周次本体不受单双周捕获影响
  const p1 = parseCell("(11-12节)11-13周(单)/校区:南校区/场地:2004/教师:常");
  check("parseCell 带(单)时周次仍完整", p1.weeks === "11-13周", p1.weeks);
  check("parseCell 带(单)时教室正确", p1.room === "2004", p1.room);
  check("parseCell 带(单)时教师正确", p1.teacher === "常", p1.teacher);
}

// ---------------------------------------------------------------------------
// 4. 真实 PDF 端到端
// ---------------------------------------------------------------------------
const REAL_PDFS = ["郭亦菲", "高毅", "陈亚楠", "李奕然"];

const cliArg = process.argv[2];

console.log("\n=== 4. 真实 PDF 端到端 ===");
if (cliArg) {
  const buf = fs.readFileSync(cliArg);
  const { parseSchedulePdf } = loadParser();
  const res = parseSchedulePdf(buf);
  check(
    `${path.basename(cliArg)} 解析出课程`,
    (res.courses || []).length > 0,
    `${(res.courses || []).length} 条`,
  );
} else {
  // 找不到 PDF 直接失败退出，不静默 SKIP（静默 SKIP = 假绿灯）
  const paths = fixtures.requireAll(REAL_PDFS, "结构性测试 · 真实 PDF 端到端");
  for (const label of REAL_PDFS) {
    const t = { label, file: paths[label] };
    console.log(`\n--- ${t.label} ---`);
    const buf = fs.readFileSync(t.file);
    const { parseSchedulePdf } = loadParser();

    let result = null;
    let err = null;
    try {
    result = parseSchedulePdf(buf);
  } catch (e) {
    err = e;
  }

  check(`${t.label}：解析不抛错`, !err, err && err.message);
  if (err) continue;

  const courses = result.courses;
  check(`${t.label}：识别到课程`, courses.length > 0, `${courses.length} 条`);

  // 每门课必须有名字、星期合法
  const noName = courses.filter((c) => !c.courseName || !c.courseName.trim());
  check(`${t.label}：课程名都不为空`, noName.length === 0, `${noName.length} 条空名`);

  const badDay = courses.filter((c) => !(c.weekday >= 1 && c.weekday <= 7));
  check(`${t.label}：星期都在 1-7`, badDay.length === 0, `${badDay.length} 条越界`);

  const badSec = courses.filter(
    (c) => !(c.startSection >= 1 && c.startSection <= 12 && c.endSection >= c.startSection),
  );
  check(`${t.label}：节次范围合法`, badSec.length === 0, `${badSec.length} 条越界`);

  // 课程名不应含详情关键字（说明切片起点选错了）
  const dirty = courses.filter((c) => /场地|教师|教学班|学分|周学时/.test(c.courseName));
  check(`${t.label}：课程名未混入详情字段`, dirty.length === 0, dirty.map((c) => c.courseName).slice(0, 3).join(" | "));

  // 课程名不应超过合理长度（说明把整格详情都当成了名字）
  const longName = courses.filter((c) => c.courseName.length > 40);
  check(`${t.label}：课程名长度合理(≤40)`, longName.length === 0, longName.map((c) => c.courseName).slice(0, 2).join(" | "));

  // 分布检查：一周课不应全挤在一天
  const byDay = {};
  courses.forEach((c) => {
    byDay[c.weekday] = (byDay[c.weekday] || 0) + 1;
  });
  const days = Object.keys(byDay).length;
  check(`${t.label}：课程分布在天数 ≥ 2`, days >= 2, JSON.stringify(byDay));

  const maxDay = Math.max.apply(null, Object.values(byDay));
  check(
    `${t.label}：单日占比未超 65%（无严重串列）`,
    maxDay / courses.length <= 0.65,
    `最多一天 ${maxDay}/${courses.length} = ${Math.round((maxDay / courses.length) * 100)}%`,
  );

  // 学期名不该是详情碎片（旧实现会把「2601/考核方式:未安排/选课」当学期名）
  check(
    `${t.label}：学期名不含详情特征`,
    !/考核|选课|场地|教师|学时|学分|教学班|\(\d+节\)/.test(result.semesterLabel),
    result.semesterLabel,
  );

  // 课程名里不该出现连续的中文+数字粘连（如「医2603」「护理2604」）
  const polluted = courses.filter((c) => /(医|护理|中西医|中医)\d{4}/.test(c.courseName));
  check(`${t.label}：课程名无班级串污染`, polluted.length === 0, polluted.map((c) => c.courseName).slice(0, 3).join(" | "));

  console.log(`  学期：${result.semesterLabel}`);
  console.log(`  课程 ${courses.length} 条，分布 ${JSON.stringify(byDay)}`);
  courses.slice(0, 6).forEach((c) => {
    console.log(
      `    · 周${c.weekday} 第${c.startSection}-${c.endSection}节 ${c.courseName} | ${c.teacher || "-"} | ${c.room || "-"} | ${c.weeks || "-"}`,
    );
  });
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  console.log("失败项：");
  failures.forEach((f) => console.log(`  - ${f}`));
}
process.exit(fail ? 1 : 0);
