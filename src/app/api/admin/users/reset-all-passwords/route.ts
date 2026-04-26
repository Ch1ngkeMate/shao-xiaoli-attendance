import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { ADMIN_BULK_RESET_PASSWORD } from "@/lib/admin-default-password";

/** 将所有活跃用户密码重置为统一初始值（仅管理员） */
export async function POST() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ message: "无权限" }, { status: 403 });

  const passwordHash = await bcrypt.hash(ADMIN_BULK_RESET_PASSWORD, 10);
  const result = await prisma.user.updateMany({
    data: { passwordHash },
    where: {},
  });

  return NextResponse.json({
    ok: true,
    updated: result.count,
    passwordPlain: ADMIN_BULK_RESET_PASSWORD,
  });
}
