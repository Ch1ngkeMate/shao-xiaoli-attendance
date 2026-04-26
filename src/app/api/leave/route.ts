import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { notifyManagersNewLeave } from "@/lib/in-app-notify";

const CreateSchema = z
  .object({
    category: z.enum(["DUTY", "MEETING"]),
    reason: z.string().min(1, "请说明原因"),
    meetingId: z.string().optional().nullable(),
    dutyWeekday: z.number().int().min(0).max(4).optional().nullable(),
    dutyPeriod: z.number().int().min(0).max(4).optional().nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.category === "MEETING" && !d.meetingId) {
      ctx.addIssue({ code: "custom", message: "会议请假请选择会议", path: ["meetingId"] });
    }
    if (d.category === "DUTY" && (d.dutyWeekday == null || d.dutyPeriod == null)) {
      ctx.addIssue({ code: "custom", message: "请选择已为您安排的值班时段", path: ["dutyWeekday"] });
    }
  });

export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const isMgr = session.role === "ADMIN" || session.role === "MINISTER";
  if (isMgr) {
    const list = await prisma.leaveRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { displayName: true, username: true, avatarUrl: true } },
        meeting: { select: { title: true, startTime: true } },
        decider: { select: { displayName: true } },
      },
    });
    return NextResponse.json({ list });
  }
  const list = await prisma.leaveRequest.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      meeting: { select: { title: true, startTime: true } },
      decider: { select: { displayName: true } },
    },
  });
  return NextResponse.json({ list });
}

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "MEMBER") {
    return NextResponse.json({ message: "仅部员可提交此类请假" }, { status: 403 });
  }
  const json = await req.json().catch(() => null);
  const p = CreateSchema.safeParse(json);
  if (!p.success) {
    return NextResponse.json({ message: p.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }
  if (p.data.meetingId) {
    const m = await prisma.meeting.findUnique({ where: { id: p.data.meetingId } });
    if (!m) return NextResponse.json({ message: "会议不存在" }, { status: 400 });
  }
  if (p.data.category === "DUTY" && p.data.dutyWeekday != null && p.data.dutyPeriod != null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const duty = (prisma as { dutyAssignment?: { findFirst: (a: any) => Promise<unknown> } }).dutyAssignment;
    if (duty?.findFirst) {
      const slot = await duty.findFirst({
        where: {
          userId: session.sub,
          weekday: p.data.dutyWeekday,
          period: p.data.dutyPeriod,
        },
      });
      if (!slot) {
        return NextResponse.json(
          { message: "该时段不是您在值班表中的安排，无法请值班假" },
          { status: 400 },
        );
      }
    }
  }
  const row = await prisma.leaveRequest.create({
    data: {
      userId: session.sub,
      category: p.data.category,
      reason: p.data.reason.trim(),
      meetingId: p.data.meetingId || null,
      dutyWeekday: p.data.dutyWeekday ?? null,
      dutyPeriod: p.data.dutyPeriod ?? null,
    },
    include: { user: { select: { displayName: true } } },
  });
  await notifyManagersNewLeave(row.id);
  return NextResponse.json({ request: row });
}
