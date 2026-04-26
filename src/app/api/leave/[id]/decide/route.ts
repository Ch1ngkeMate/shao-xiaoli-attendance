import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { notifyLeaveDecided } from "@/lib/in-app-notify";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  approve: z.boolean(),
  rejectReason: z.string().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const p = BodySchema.safeParse(body);
  if (!p.success) {
    return NextResponse.json({ message: p.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }
  const found = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!found) return NextResponse.json({ message: "不存在" }, { status: 404 });
  if (found.status !== "PENDING") {
    return NextResponse.json({ message: "已处理" }, { status: 400 });
  }
  await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: p.data.approve ? "APPROVED" : "REJECTED",
      decidedAt: new Date(),
      decidedById: session.sub,
      rejectReason: p.data.approve ? null : (p.data.rejectReason?.trim() || null),
    },
  });
  await notifyLeaveDecided(id);
  return NextResponse.json({ ok: true });
}
