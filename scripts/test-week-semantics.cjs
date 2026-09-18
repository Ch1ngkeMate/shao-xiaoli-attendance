/*
 * test-week-semantics.cjs —— Task #7 回归测试
 *
 * 背景：旧实现 `isInWeek(course, week) => weeks.length === 0 || includes(week)`
 *       把「全周」和「没有周次信息」都当成「每周都上」。
 *       于是周次丢失 / 解析失败的课会静默出现在每一周 —— 用户看到一门
 *       根本不存在的课，却完全无从察觉。这比少显示一门危险得多。
 *
 * 用法：node scripts/test-week-semantics.cjs
 */
const store = require("../miniprogram/utils/schedule");

let passed = 0;
const failures = [];
function check(label, cond, got) {
  if (cond) {
    passed += 1;
    console.log(`  [OK]   ${label}`);
  } else {
    failures.push(label);
    console.log(`  [FAIL] ${label}${got === undefined ? "" : ` — ${JSON.stringify(got)}`}`);
  }
}

console.log("\n=== 1. parseWeeks 三态语义 ===");
{
  const cases = [
    // [输入, 期望 kind, 期望 numbers, 说明]
    ["3-5周,9-19周", "explicit", [3, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], "常见区间+列表"],
    ["11-13周(单)", "explicit", [11, 13], "单周"],
    ["3-14周(双)", "explicit", [4, 6, 8, 10, 12, 14], "双周"],
    ["每周", "all", [], "明确全周"],
    ["全周", "all", [], "明确全周（另一种说法）"],
    ["", "unknown", [], "空字符串"],
    ["   ", "unknown", [], "纯空白"],
    [null, "unknown", [], "null"],
    [undefined, "unknown", [], "undefined"],
    ["待定", "unknown", [], "有字但没有周次数字 → 不可信"],
    ["第X周", "unknown", [], "乱码/非数字"],
  ];
  cases.forEach(([input, wantKind, wantNumbers, why]) => {
    const got = store.parseWeeks(input);
    check(
      `parseWeeks(${JSON.stringify(input)}) → ${wantKind}（${why}）`,
      got.kind === wantKind &&
        JSON.stringify(got.numbers) === JSON.stringify(wantNumbers),
      got,
    );
  });
}

console.log("\n=== 2. isInWeek 不再把「没周次」当「每周」 ===");
{
  const allWeek = { courseName: "A", weeks: "每周" };
  const explicit = { courseName: "B", weeks: "3-5周" };
  const noWeeks = { courseName: "C", weeks: "" };
  const broken = { courseName: "D", weeks: "待定" };

  check("全周课：第 1 周要上", store.isInWeek(allWeek, 1) === true);
  check("全周课：第 16 周要上", store.isInWeek(allWeek, 16) === true);

  check("3-5周课：第 3 周要上", store.isInWeek(explicit, 3) === true);
  check("3-5周课：第 6 周不上", store.isInWeek(explicit, 6) === false);

  // 🔴 这两条是 Task #7 的核心回归
  check("空周次：第 1 周**不**显示（旧实现会显示）", store.isInWeek(noWeeks, 1) === false);
  check("空周次：第 16 周**不**显示（旧实现会显示）", store.isInWeek(noWeeks, 16) === false);
  check("周次乱码：不许当成每周", store.isInWeek(broken, 1) === false);

  // 兜底：用户手动填了 note 说明他知道情况，仍按每周显示
  check(
    "空周次但有备注 → 仍按每周显示（用户已知情）",
    store.isInWeek({ courseName: "E", weeks: "", note: "大作业" }, 1) === true,
  );
}

console.log("\n=== 3. parseWeekNumbers 老签名保持兼容 ===");
{
  check(
    "全周 → []（老签名不变）",
    JSON.stringify(store.parseWeekNumbers("每周")) === "[]",
  );
  check(
    "空 → []（老签名不变）",
    JSON.stringify(store.parseWeekNumbers("")) === "[]",
  );
  check(
    "3-5周 → [3,4,5]",
    JSON.stringify(store.parseWeekNumbers("3-5周")) === "[3,4,5]",
  );
  check(
    "11-13周(单) → [11,13]",
    JSON.stringify(store.parseWeekNumbers("11-13周(单)")) === "[11,13]",
  );
}

console.log("\n" + "=".repeat(76));
if (failures.length) {
  console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
  console.log("失败项：");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log(`全部通过：${passed} 项（周次语义回归）`);
}
console.log("=".repeat(76));
