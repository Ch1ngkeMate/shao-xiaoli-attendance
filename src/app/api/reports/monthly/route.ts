import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMonthlyReportStats, hydrateMonthlyReportPeopleFromDb } from "@/lib/monthly-report";
import type { MonthlyReportStats } from "@/lib/monthly-report";

export async function GET(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!month) return NextResponse.json({ message: "缺少 month 参数" }, { status: 400 });

  const snapshot = await prisma.monthlyReport.findUnique({ where: { month } });
  if (snapshot) {
    const parsed = JSON.parse(snapshot.statsJson) as MonthlyReportStats;
    const stats = await hydrateMonthlyReportPeopleFromDb(parsed);
    return NextResponse.json({
      month,
      snapshot: true,
      stats,
    });
  }

  const stats = await computeMonthlyReportStats(month);
  return NextResponse.json({ month, snapshot: false, stats });
}

