import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionCookie, readSessionCookie } from "@/lib/auth";

const PatchMeSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6, "新密码至少 6 位").optional(),
    avatarUrl: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const hasPwd = data.newPassword !== undefined || data.currentPassword !== undefined;
    if (hasPwd) {
      if (!data.currentPassword) {
        ctx.addIssue({ code: "custom", message: "修改密码需填写当前密码", path: ["currentPassword"] });
      }
      if (!data.newPassword) {
        ctx.addIssue({ code: "custom", message: "请填写新密码", path: ["newPassword"] });
      }
    }
    if (!hasPwd && data.avatarUrl === undefined) {
      ctx.addIssue({ code: "custom", message: "无有效更新字段" });
    }
  });

function isAllowedAvatarUrl(url: string) {
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/uploads/");
}

export async function GET() {
  const session = await readSessionCookie();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, username: true, displayName: true, role: true, avatarUrl: true, isActive: true },
  });
  if (!dbUser || !dbUser.isActive) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // 管理员在后台改角色/姓名/账号后，JWT 仍可能是旧值：刷新会话，避免「菜单能进管理页但接口 403」或与中间件不一致
  if (
    dbUser.role !== session.role ||
    dbUser.displayName !== session.displayName ||
    dbUser.username !== session.username
  ) {
    await createSessionCookie({
      sub: dbUser.id,
      role: dbUser.role,
      displayName: dbUser.displayName,
      username: dbUser.username,
    });
  }

  return NextResponse.json({
    user: {
      id: dbUser.id,
      username: dbUser.username,
      displayName: dbUser.displayName,
      role: dbUser.role,
      avatarUrl: dbUser.avatarUrl,
    },
  });
}

export async function PATCH(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = PatchMeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword, avatarUrl } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) {
    return NextResponse.json({ message: "用户不存在或已停用" }, { status: 403 });
  }

  const data: { passwordHash?: string; avatarUrl?: string | null } = {};

  if (newPassword !== undefined && currentPassword !== undefined) {
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ message: "当前密码错误" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  if (avatarUrl !== undefined) {
    if (!isAllowedAvatarUrl(avatarUrl)) {
      return NextResponse.json({ message: "头像地址无效" }, { status: 400 });
    }
    data.avatarUrl = avatarUrl;
  }

  const updated = await prisma.user.update({
    where: { id: session.sub },
    data,
    select: { id: true, username: true, displayName: true, role: true, avatarUrl: true },
  });

  return NextResponse.json({ user: updated });
}
