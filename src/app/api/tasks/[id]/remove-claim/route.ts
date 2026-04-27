import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { getTaskTimeBoundsFromSlots } from "@/lib/task-time-bounds";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/**
 * 管理员/部长将指定接取记为 CANCELLED。
 * 多时段任务须传 claimId；仅一段或无时段表时可只传 userId（兼容旧客户端）。
 */
export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  let body: { userId?: string; claimId?: string };
  try {
    body = (await req.json()) as { userId?: string; claimId?: string };
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

  const multiSlot = task.timeSlots.length > 1;
  let claim: { id: string; userId: string; status: string } | null = null;

  if (typeof body.claimId === "string" && body.claimId.trim()) {
    claim = await prisma.taskClaim.findFirst({
      where: { id: body.claimId.trim(), taskId },
      select: { id: true, userId: true, status: true },
    });
  } else if (typeof body.userId === "string" && body.userId.trim()) {
    const targetUserId = body.userId.trim();
    if (multiSlot) {
      return NextResponse.json(
        { message: "多时段任务请指定 claimId（在对应时段下点击移出）" },
        { status: 400 },
      );
    }
    claim = await prisma.taskClaim.findFirst({
      where: { taskId, userId: targetUserId, status: "CLAIMED" },
      select: { id: true, userId: true, status: true },
    });
  } else {
    return NextResponse.json({ message: "缺少 claimId 或 userId" }, { status: 400 });
  }

  if (!claim) {
    return NextResponse.json({ message: "未找到有效接取记录" }, { status: 400 });
  }
  if (claim.status !== "CLAIMED") {
    return NextResponse.json({ message: "无有效接取记录，无需移出" }, { status: 400 });
  }

  const sub = await prisma.taskSubmission.findUnique({
    where: { taskId_userId: { taskId, userId: claim.userId } },
    include: { review: true },
  });

  if (sub) {
    // 待审核：不能移出，避免与审核流冲突
    if (!sub.review) {
      return NextResponse.json(
        { message: "该干事有待审核提交，请先「通过」或「驳回」后再移出" },
        { status: 400 },
      );
    }
    // 已通过：不能移出（已计入考勤口径）
    if (sub.review.result === "APPROVED") {
      return NextResponse.json(
        { message: "该干事提交已被确认通过，无法移出" },
        { status: 400 },
      );
    }
    // 已驳回：允许移出，并删除提交记录（级联删审核与凭证），避免驳回后仍占「已提交」状态
    await prisma.$transaction([
      prisma.taskSubmission.delete({ where: { id: sub.id } }),
      prisma.taskClaim.update({
        where: { id: claim.id },
        data: { status: "CANCELLED" },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  await prisma.taskClaim.update({
    where: { id: claim.id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
