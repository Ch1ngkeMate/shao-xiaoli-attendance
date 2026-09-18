import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMemberMonthlyStats } from "@/lib/monthly-report";

type Params = { id: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userModel() {
  return (prisma as { user?: any }).user;
}

/** 最多允许一次查多少个月（含当前月），避免被用来遍历全部历史 */
const MAX_MONTHS = 24;

/** 生成从 startMonth 到 endMonth 的月份序列（含两端，YYY-MM） */
function buildMonthRange(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  let year = sy;
  let month = sm;
  while (year < ey || (year === ey && month <= em)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (out.length > MAX_MONTHS) break;
  }
  return out;
}

/**
 * 查看某个成员的「个人主页」：基本信息 + 考勤统计 + 活动明细。
 *
 * 权限：任意登录成员都可以查看（任务详情页点同学头像即进此页）。
 * 只暴露展示所需字段（姓名、角色、头像、活动名与积分），不含手机号、密码等敏感信息。
 *
 * 查询参数：
 *   month=YYYY-MM            单月模式（默认，兼容旧调用）
 *   months=YYYY-MM,YYYY-MM   多月模式，用于「按月折叠」展示
 *   from / to                区间模式，生成 from..to 的连续月份
 */
export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month")?.trim();
  const monthsParam = url.searchParams.get("months")?.trim();
  const fromParam = url.searchParams.get("from")?.trim();
  const toParam = url.searchParams.get("to")?.trim();

  // 组装要查询的月份列表，末尾去重（同一月份只算一次）
  let months: string[] = [];
  if (monthsParam) {
    months = monthsParam.split(",").map((m) => m.trim()).filter(Boolean);
  } else if (fromParam && toParam) {
    months = buildMonthRange(fromParam, toParam);
  } else if (monthParam) {
    months = [monthParam];
  }
  // 没传 / 传了空白串 / 区间为空 → 兜底当前月（不要 400，旧客户端与空串场景都可能命中）
  if (months.length === 0) {
    const now = new Date();
    months = [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`];
  }
  months = [...new Set(months)];
  if (months.length > MAX_MONTHS) {
    return NextResponse.json({ message: `month/months/from,to 无效，或超过 ${MAX_MONTHS} 个月上限` }, { status: 400 });
  }
  const invalid = months.find((m) => !/^\d{4}-\d{2}$/.test(m));
  if (invalid) {
    return NextResponse.json({ message: `月份格式错误：${invalid}（应为 YYYY-MM）` }, { status: 400 });
  }

  const U = userModel();
  if (!U?.findFirst) {
    return NextResponse.json({ message: "服务未就绪：请执行 prisma migrate deploy + prisma generate" }, { status: 503 });
  }
  const user = await U.findFirst({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      avatarUrl: true,
      profileBgUrl: true,
      isActive: true,
    },
  });
  if (!user) return NextResponse.json({ message: "用户不存在" }, { status: 404 });

  // 非活跃成员没有考勤数据，直接给空统计，避免下游判空
  const rows = user.isActive
    ? await Promise.all(months.map((m) => computeMemberMonthlyStats(m, id).catch(() => null)))
    : months.map(() => null);

  const monthly = months.map((m, i) => ({ month: m, row: rows[i] }));
  const latest = [...monthly].reverse().find((x) => x.row) || monthly[monthly.length - 1];

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      profileBgUrl: user.profileBgUrl,
      isActive: user.isActive,
    },
    /** 兼容旧字段：返回列表里最新一个有数据月份的统计 */
    row: latest ? latest.row : null,
    /** 按月分组的数据，前端用于折叠面板 */
    monthly: monthly.filter((x) => x.row).map((x) => ({ month: x.month, ...x.row })),
  });
}
