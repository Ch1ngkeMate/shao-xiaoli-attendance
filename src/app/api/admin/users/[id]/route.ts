import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

type Params = { id: string };

const PatchUserSchema = z.object({
  /** 登录账号，全局唯一 */
  username: z.string().min(1, "账号不能为空").optional(),
  displayName: z.string().min(1, "姓名不能为空").optional(),
  role: z.enum(["ADMIN", "MINISTER", "MEMBER"]).optional(),
  isActive: z.boolean().optional(),
  /** 由管理员直接设为新密码（会覆盖原密码） */
  resetPassword: z.string().min(6, "新密码至少 6 位").optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ message: "无权限" }, { status: 403 });

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = PatchUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  if (parsed.data.username !== undefined) {
    const exists = await prisma.user.findFirst({
      where: { username: parsed.data.username, id: { not: id } },
    });
    if (exists) {
      return NextResponse.json({ message: "该登录账号已被占用" }, { status: 400 });
    }
  }

  const data: {
    username?: string;
    displayName?: string;
    role?: "ADMIN" | "MINISTER" | "MEMBER";
    isActive?: boolean;
    passwordHash?: string;
  } = {};
  if (parsed.data.username !== undefined) data.username = parsed.data.username;
  if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.resetPassword !== undefined) {
    data.passwordHash = await bcrypt.hash(parsed.data.resetPassword, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "没有要更新的内容" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, displayName: true, role: true, isActive: true },
  });

  return NextResponse.json({ user });
}

