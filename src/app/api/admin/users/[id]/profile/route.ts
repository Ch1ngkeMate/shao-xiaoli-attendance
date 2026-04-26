import { NextResponse } from "next/server";
import { readSessionCookie, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMemberMonthlyStats } from "@/lib/monthly-report";
import type { UserRole } from "@/generated/prisma/client";

type Params = { id: string };

/**
 * 部长/管理员查看他人「个人主页」用：基本信息 + 指定月份考勤（口径同 /api/me/attendance）
 */
export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (!hasRole(session.role as UserRole, ["ADMIN", "MINISTER"])) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const month = url.searchParams.get("month")?.trim();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ message: "缺少或无效的 month（格式 YYYY-MM）" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      avatarUrl: true,
      isActive: true,
    },
  });
  if (!user) return NextResponse.json({ message: "用户不存在" }, { status: 404 });

  const row = user.isActive ? await computeMemberMonthlyStats(month, id) : null;

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
    },
    row,
  });
}
