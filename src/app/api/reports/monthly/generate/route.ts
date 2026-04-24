import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMonthlyReportStats } from "@/lib/monthly-report";

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!month) return NextResponse.json({ message: "缺少 month 参数" }, { status: 400 });

  const stats = await computeMonthlyReportStats(month);

  const saved = await prisma.monthlyReport.upsert({
    where: { month },
    create: {
      month,
      generatedBy: session.sub,
      generatedAt: new Date(),
      statsJson: JSON.stringify(stats),
    },
    update: {
      generatedBy: session.sub,
      generatedAt: new Date(),
      statsJson: JSON.stringify(stats),
    },
  });

  return NextResponse.json({ ok: true, month: saved.month });
}

