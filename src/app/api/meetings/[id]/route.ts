import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { endMeetingWithAbsences } from "@/lib/meeting-end";

type Ctx = { params: Promise<{ id: string }> };

const EndSchema = z.object({
  action: z.literal("end"),
  /** 被记为旷会的人员 id */
  absentUserIds: z.array(z.string()).default([]),
});

export async function GET(_req: Request, ctx: Ctx) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  const m = await prisma.meeting.findUnique({
    where: { id },
    include: { publisher: { select: { displayName: true } } },
  });
  if (!m) return NextResponse.json({ message: "不存在" }, { status: 404 });
  const members = await prisma.user.findMany({
    where: { isActive: true, role: "MEMBER" },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, username: true, avatarUrl: true },
  });
  const leaves = await prisma.leaveRequest.findMany({
    where: { meetingId: id, category: "MEETING" },
    include: { user: { select: { displayName: true } } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const att = (prisma as { attendanceAdjust?: { findMany: (a: any) => Promise<unknown> } }).attendanceAdjust;
  const adjustments =
    m.status === "ENDED" && att
      ? await att.findMany({
          where: { meetingId: id, amount: { lt: 0 } },
          select: { userId: true, amount: true, reason: true },
        })
      : [];
  return NextResponse.json({ meeting: m, members, leaves, absences: adjustments });
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const p = EndSchema.safeParse(json);
  if (!p.success) {
    return NextResponse.json({ message: p.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }
  try {
    await endMeetingWithAbsences({
      meetingId: id,
      endedBy: session.sub,
      absentUserIds: p.data.absentUserIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "操作失败";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
