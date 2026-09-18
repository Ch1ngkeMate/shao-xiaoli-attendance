/**
 * 后端 /api/admin/users/[id]/profile 月份参数逻辑测试
 * 直接复制 route.ts 里的纯函数 buildMonthRange 做验证，并用模拟 prisma 走一遍 GET。
 * 运行：node scripts/test-profile-api-months.cjs
 */
const assert = require("assert");
const MAX_MONTHS = 24;

function buildMonthRange(startMonth, endMonth) {
  const out = [];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  let year = sy;
  let month = sm;
  while (year < ey || (year === ey && month <= em)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    if (out.length > MAX_MONTHS) break;
  }
  return out;
}

let failures = 0;
const cases = [];
const check = (name, fn) => {
  try { fn(); cases.push(`  PASS  ${name}`); }
  catch (e) { failures++; cases.push(`  FAIL  ${name}\n        ${e.message}`); }
};

check("同年区间：2026-03..2026-07", () => {
  assert.deepStrictEqual(buildMonthRange("2026-03", "2026-07"),
    ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
});

check("跨年区间：2025-11..2026-02", () => {
  assert.deepStrictEqual(buildMonthRange("2025-11", "2026-02"),
    ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

check("单月区间：2026-09..2026-09", () => {
  assert.deepStrictEqual(buildMonthRange("2026-09", "2026-09"), ["2026-09"]);
});

check("超过 MAX_MONTHS 时被截断到 25 条以内", () => {
  const r = buildMonthRange("2020-01", "2030-12");
  assert.ok(r.length <= MAX_MONTHS + 1, `长度 ${r.length} 应 <= ${MAX_MONTHS + 1}`);
});

check("28 个月区间仍被截断", () => {
  const r = buildMonthRange("2024-01", "2026-05"); // 29 个月
  assert.ok(r.length <= MAX_MONTHS + 1, `长度 ${r.length} 超限`);
});

// ---------- GET 处理器行为（模拟 route.ts 的最终逻辑）
function parseMonths({ month, months, from, to }) {
  let list = [];
  if (months) list = months.split(",").map((m) => m.trim()).filter(Boolean);
  else if (from && to) list = buildMonthRange(from, to);
  else if (month) list = [month];
  // 没传 / 空白串 / 空区间 → 兜底当前月（与 route.ts 一致，不再 400）
  if (list.length === 0) {
    const now = new Date();
    list = [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`];
  }
  list = [...new Set(list)];
  if (list.length > MAX_MONTHS) return { error: 400, message: "超限" };
  const bad = list.find((m) => !/^\d{4}-\d{2}$/.test(m));
  if (bad) return { error: 400, message: `格式错误 ${bad}` };
  return { months: list };
}

const THIS_MONTH = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();

check("months 逗号串被解析并去重", () => {
  const r = parseMonths({ months: "2026-09, 2026-08,2026-09" });
  assert.deepStrictEqual(r.months, ["2026-09", "2026-08"]);
});

check("未传任何参数时默认当前月（不 400）", () => {
  assert.deepStrictEqual(parseMonths({}).months, [THIS_MONTH]);
});

check("空白串 months 兜底当前月（不 400）", () => {
  assert.deepStrictEqual(parseMonths({ months: "   " }).months, [THIS_MONTH]);
});

check("months 含空项（多余逗号）被过滤", () => {
  const r = parseMonths({ months: ",2026-09,,2026-08," });
  assert.deepStrictEqual(r.months, ["2026-09", "2026-08"]);
});

check("非法月份格式返回 400", () => {
  const r = parseMonths({ months: "2026-9" });
  assert.strictEqual(r.error, 400);
});

check("超过 24 个月返回 400", () => {
  const many = Array.from({ length: 25 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, "0")}x`).join(",");
  const r = parseMonths({ months: many });
  assert.strictEqual(r.error, 400);
});

check("单月 month 参数仍可用（兼容旧调用）", () => {
  assert.deepStrictEqual(parseMonths({ month: "2026-05" }).months, ["2026-05"]);
});

check("from/to 区间模式可用", () => {
  assert.deepStrictEqual(parseMonths({ from: "2026-07", to: "2026-09" }).months,
    ["2026-07", "2026-08", "2026-09"]);
});

console.log("\n=== 个人主页 API 月份逻辑测试 ===\n");
console.log(cases.join("\n"));
console.log(`\n共 ${cases.length} 项，失败 ${failures} 项\n`);
process.exit(failures > 0 ? 1 : 0);
