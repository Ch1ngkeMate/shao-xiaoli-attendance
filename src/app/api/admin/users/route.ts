import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

const CreateUserSchema = z.object({
  username: z.string().min(1, "账号不能为空"),
  displayName: z.string().min(1, "姓名不能为空"),
  role: z.enum(["ADMIN", "MINISTER", "MEMBER"]),
  password: z.string().min(6, "密码至少 6 位"),
});

export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ message: "无权限" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      createdAt: true,
      avatarUrl: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ message: "无权限" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = CreateUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const { username, displayName, role, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        displayName,
        role,
        passwordHash,
        isActive: true,
      },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ message: "创建失败：账号可能已存在" }, { status: 400 });
  }
}

