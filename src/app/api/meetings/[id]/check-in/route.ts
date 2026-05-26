import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { haversine } from "@/lib/geo";

type Ctx = { params: Promise<{ id: string }> };

const CheckInSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** 干事 GPS 签入 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "MEMBER" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "仅干事/部长可签到" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return NextResponse.json({ message: "会议不存在" }, { status: 404 });
  if (meeting.status === "ENDED") {
    return NextResponse.json({ message: "会议已结束" }, { status: 400 });
  }
  if (meeting.checkInLat == null || meeting.checkInLng == null) {
    return NextResponse.json({ message: "该会议未开启 GPS 签到" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const p = CheckInSchema.safeParse(json);
  if (!p.success) {
    return NextResponse.json({ message: "缺少签到坐标" }, { status: 400 });
  }

  const distance = haversine(
    meeting.checkInLat, meeting.checkInLng,
    p.data.lat, p.data.lng,
  );
  const radius = meeting.checkInRadius ?? 150;
  if (distance > radius) {
    return NextResponse.json({
      success: false,
      message: `签到失败：距离签到点约 ${Math.round(distance)} 米（允许 ${radius} 米）`,
      distance: Math.round(distance),
      radius,
    });
  }

  // upsert：已签到则更新坐标，未签到则创建
  try {
    await prisma.meetingCheckIn.upsert({
      where: { meetingId_userId: { meetingId: id, userId: session.sub } },
      create: { meetingId: id, userId: session.sub, lat: p.data.lat, lng: p.data.lng },
      update: { lat: p.data.lat, lng: p.data.lng },
    });
  } catch {
    // 旧 Client 可能无此表
    return NextResponse.json({ message: "签到功能暂不可用，请执行数据库迁移" }, { status: 503 });
  }

  return NextResponse.json({ success: true, distance: Math.round(distance) });
}

/** 管理员查询签到清单 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await ctx.params;

  let checkIns: { userId: string; lat: number | null; lng: number | null; createdAt: Date; user: { displayName: string; username: string; avatarUrl: string | null } }[] = [];
  try {
    checkIns = await prisma.meetingCheckIn.findMany({
      where: { meetingId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { displayName: true, username: true, avatarUrl: true } } },
    });
  } catch {
    return NextResponse.json({ checkIns: [], members: [], _hint: "请执行 npx prisma generate 与数据库迁移" });
  }

  const members = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["MEMBER", "MINISTER"] } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, username: true, avatarUrl: true },
  });

  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: { meetingId: id, status: "APPROVED", category: "MEETING" },
    select: { userId: true },
  });

  const checkedInIds = new Set(checkIns.map((c) => c.userId));
  const leaveIds = new Set(approvedLeaves.map((l) => l.userId));

  return NextResponse.json({
    checkIns: checkIns.map((c) => ({
      userId: c.userId,
      user: c.user,
      lat: c.lat,
      lng: c.lng,
      createdAt: c.createdAt.toISOString(),
    })),
    members: members.map((m) => ({
      ...m,
      checkedIn: checkedInIds.has(m.id),
      onLeave: leaveIds.has(m.id),
    })),
    checkedInCount: checkIns.length,
    totalMembers: members.length,
  });
}
