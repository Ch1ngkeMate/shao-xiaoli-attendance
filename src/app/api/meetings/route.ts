import { NextResponse } from "next/server";
import { z } from "zod";
import { readSessionCookie } from "@/lib/auth";
import { notifyMembersNewMeeting } from "@/lib/in-app-notify";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  title: z.string().min(1, "请填写会议主题"),
  startTime: z.string().min(1),
  endTime: z.string().optional(),
  place: z.string().optional(),
  description: z.string().optional(),
});

export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const list = await prisma.meeting.findMany({
    orderBy: { startTime: "desc" },
    take: 100,
    include: { publisher: { select: { displayName: true } } },
  });
  return NextResponse.json({ meetings: list });
}

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }
  const json = await req.json().catch(() => null);
  const p = CreateSchema.safeParse(json);
  if (!p.success) {
    return NextResponse.json({ message: p.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }
  const start = new Date(p.data.startTime);
  const end = p.data.endTime ? new Date(p.data.endTime) : null;
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ message: "开始时间无效" }, { status: 400 });
  }
  if (end && Number.isNaN(end.getTime())) {
    return NextResponse.json({ message: "结束时间无效" }, { status: 400 });
  }
  const m = await prisma.meeting.create({
    data: {
      title: p.data.title.trim(),
      startTime: start,
      endTime: end,
      place: p.data.place?.trim() || null,
      description: p.data.description?.trim() || null,
      publishedBy: session.sub,
    },
    include: { publisher: { select: { displayName: true } } },
  });
  void notifyMembersNewMeeting({
    meetingId: m.id,
    title: m.title,
    startTime: m.startTime,
    endTime: m.endTime,
    place: m.place,
    description: m.description,
    publisherName: m.publisher.displayName,
  }).catch((e) => void console.error("[meetings] notifyMembersNewMeeting", e));
  return NextResponse.json({ meeting: m });
}
