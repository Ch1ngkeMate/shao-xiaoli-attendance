import { prisma } from "@/lib/prisma";

/**
 * 兼容未执行 prisma generate / 旧 Client 中无 attendanceAdjust 的情况，避免 .aggregate / .groupBy 在 undefined 上报错
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAttendanceAdjustDelegate(): any {
  return (prisma as { attendanceAdjust?: unknown }).attendanceAdjust;
}

/** 单月、多人：各 user 的其它分（例会等） */
export async function groupAdjustSumsByUserForMonth(yearMonth: string): Promise<Map<string, number>> {
  const d = getAttendanceAdjustDelegate();
  if (!d?.groupBy) return new Map();
  const rows = await d.groupBy({
    by: ["userId"],
    where: { yearMonth },
    _sum: { amount: true },
  });
  return new Map(
    (rows as { userId: string; _sum: { amount: number | null } }[]).map((a) => [
      a.userId,
      a._sum.amount ?? 0,
    ]),
  );
}

/** 任意时间段：各 user 的考勤调整分合计（按 createdAt 落在区间内） */
export async function groupAdjustSumsByUserForDateRange(start: Date, end: Date): Promise<Map<string, number>> {
  const d = getAttendanceAdjustDelegate();
  if (!d?.findMany) return new Map();
  const rows = (await d.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { userId: true, amount: true },
  })) as { userId: string; amount: number }[];
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.userId, (map.get(r.userId) ?? 0) + r.amount);
  }
  return map;
}

/** 单月、单人：其它分合计 */
export async function sumAdjustForUserInMonth(userId: string, yearMonth: string): Promise<number> {
  const d = getAttendanceAdjustDelegate();
  if (!d?.aggregate) return 0;
  const r = (await d.aggregate({
    where: { userId, yearMonth },
    _sum: { amount: true },
  })) as { _sum: { amount: number | null } };
  return r._sum.amount ?? 0;
}
