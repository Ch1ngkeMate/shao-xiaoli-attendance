import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

const AddSchema = z.object({
  weekday: z.number().int().min(0).max(4),
  period: z.number().int().min(0).max(4),
  userId: z.string().min(1),
  deptLabel: z.string().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dutyDel() {
  return (prisma as { dutyAssignment?: any }).dutyAssignment;
}

export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const d = dutyDel();
  if (!d?.findMany) {
    return NextResponse.json({ assignments: [], _hint: "请执行 npx prisma generate" });
  }
  try {
    const rows = await d.findMany({
      orderBy: [{ weekday: "asc" }, { period: "asc" }, { id: "asc" }],
      include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
    });
    return NextResponse.json({ assignments: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "查询失败";
    return NextResponse.json({ message: msg, assignments: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const d = dutyDel();
  if (!d?.create) {
    return NextResponse.json(
      { message: "服务未就绪：请在本机执行 npx prisma generate 与 npx prisma db push" },
      { status: 503 },
    );
  }
  const json = await req.json().catch(() => null);
  const p = AddSchema.safeParse(json);
  if (!p.success) {
    return NextResponse.json({ message: p.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }
  const u = await prisma.user.findUnique({ where: { id: p.data.userId, isActive: true } });
  if (!u) return NextResponse.json({ message: "用户不存在" }, { status: 400 });
  try {
    const row = await d.create({
      data: {
        weekday: p.data.weekday,
        period: p.data.period,
        userId: p.data.userId,
        deptLabel: p.data.deptLabel?.trim() || null,
      },
      include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
    });
    return NextResponse.json({ assignment: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "写入失败";
    return NextResponse.json({ message: msg || "安排失败" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const d = dutyDel();
  if (!d?.deleteMany) {
    return NextResponse.json({ message: "服务未就绪" }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });
  await d.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
