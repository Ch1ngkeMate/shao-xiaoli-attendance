import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/auth";

const LoginSchema = z.object({
  username: z.string().min(1, "请输入账号"),
  password: z.string().min(1, "请输入密码"),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  await createSessionCookie({
    sub: user.id,
    role: user.role,
    displayName: user.displayName,
    username: user.username,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
}

