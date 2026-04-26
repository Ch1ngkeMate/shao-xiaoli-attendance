import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { getTaskTimeBoundsFromSlots } from "@/lib/task-time-bounds";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/**
 * 管理员/部长将指定**干事**的接取记为 CANCELLED；部员不可再自行 unclaim，须由此入口调整。
 * 与旧 unclaim 条件一致：任务进行中文、已接取、且该人尚未有提交时方可移出。
 */
export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  let targetUserId: string;
  try {
    const body = (await req.json()) as { userId?: string };
    if (typeof body.userId !== "string" || !body.userId.trim()) {
      return NextResponse.json({ message: "缺少被移出用户" }, { status: 400 });
    }
    targetUserId = body.userId.trim();
  } catch {
    return NextResponse.json({ message: "请求体无效" }, { status: 400 });
  }

  const { id: taskId } = await ctx.params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { timeSlots: { orderBy: { sort: "asc" } } },
  });
  if (!task) return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  if (task.status !== "OPEN") {
    return NextResponse.json({ message: "任务已结束" }, { status: 400 });
  }

  const { end: effectiveEnd } = getTaskTimeBoundsFromSlots({
    startTime: task.startTime,
    endTime: task.endTime,
    timeSlots: task.timeSlots,
  });
  if (Date.now() > effectiveEnd.getTime()) {
    return NextResponse.json({ message: "任务已截止，无法移出" }, { status: 400 });
  }

  const claim = await prisma.taskClaim.findUnique({
    where: { taskId_userId: { taskId, userId: targetUserId } },
  });
  if (!claim) {
    return NextResponse.json({ message: "该人员未接取本任务" }, { status: 400 });
  }
  if (claim.status !== "CLAIMED") {
    return NextResponse.json({ message: "无有效接取记录，无需移出" }, { status: 400 });
  }

  const sub = await prisma.taskSubmission.findUnique({
    where: { taskId_userId: { taskId, userId: targetUserId } },
  });
  if (sub) {
    return NextResponse.json(
      { message: "该干事已提交，无法直接移出；可驳回后处理或等任务结项后再行调整" },
      { status: 400 },
    );
  }

  await prisma.taskClaim.update({
    where: { taskId_userId: { taskId, userId: targetUserId } },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
