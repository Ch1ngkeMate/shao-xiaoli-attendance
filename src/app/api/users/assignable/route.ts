import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

/** 发布值班等：可选活跃部员/干事 */
export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    where: { isActive: true, role: "MEMBER" },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, username: true, avatarUrl: true },
  });
  return NextResponse.json({ users });
}
