import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { computeMemberMonthlyStats } from "@/lib/monthly-report";

export async function GET(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!month) return NextResponse.json({ message: "缺少 month 参数" }, { status: 400 });

  try {
    const row = await computeMemberMonthlyStats(month, session.sub);
    if (!row) return NextResponse.json({ message: "用户不存在或已停用" }, { status: 404 });
    return NextResponse.json({ row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "统计失败";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
