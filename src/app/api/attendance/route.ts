import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { computeMonthlyReportStats } from "@/lib/monthly-report";

export async function GET(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!month) return NextResponse.json({ message: "缺少 month 参数" }, { status: 400 });

  const stats = await computeMonthlyReportStats(month);
  return NextResponse.json({ stats });
}

