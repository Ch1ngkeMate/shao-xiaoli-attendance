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

const UpdateCheckInSchema = z.object({
  action: z.literal("updateCheckIn"),
  checkInPlace: z.string().optional(),
  checkInLat: z.number().min(-90).max(90).optional(),
  checkInLng: z.number().min(-180).max(180).optional(),
  checkInRadius: z.number().int().min(10).max(5000).optional(),
});

const PostSchema = z.discriminatedUnion("action", [EndSchema, UpdateCheckInSchema]);

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

  // 签到数据
  let checkIns: { userId: string; lat: number | null; lng: number | null; createdAt: Date }[] = [];
  try {
    checkIns = await prisma.meetingCheckIn.findMany({
      where: { meetingId: id },
      orderBy: { createdAt: "asc" },
    });
  } catch { /* Client 过旧时跳过 */ }

  return NextResponse.json({
    meeting: m,
    members,
    leaves,
    absences: adjustments,
    checkIns: checkIns.map((c) => ({
      userId: c.userId,
      lat: c.lat,
      lng: c.lng,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const p = PostSchema.safeParse(json);
  if (!p.success) {
    return NextResponse.json({ message: p.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  switch (p.data.action) {
    case "end": {
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
    case "updateCheckIn": {
      const m = await prisma.meeting.findUnique({ where: { id } });
      if (!m) return NextResponse.json({ message: "不存在" }, { status: 404 });
      if (m.status === "ENDED") {
        return NextResponse.json({ message: "会议已结束，无法修改签到配置" }, { status: 400 });
      }
      await prisma.meeting.update({
        where: { id },
        data: {
          checkInPlace: p.data.checkInPlace ?? undefined,
          checkInLat: p.data.checkInLat ?? undefined,
          checkInLng: p.data.checkInLng ?? undefined,
          checkInRadius: p.data.checkInRadius ?? undefined,
        },
      });
      return NextResponse.json({ ok: true });
    }
  }
}
