import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

type Params = { id: string };

const PatchUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "MINISTER", "MEMBER"]).optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(6).optional(),
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

  const data: any = {};
  if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.resetPassword !== undefined) {
    data.passwordHash = await bcrypt.hash(parsed.data.resetPassword, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, displayName: true, role: true, isActive: true },
  });

  return NextResponse.json({ user });
}

