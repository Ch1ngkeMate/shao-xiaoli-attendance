import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { notifyTaskCompletedToApprovedClaimants } from "@/lib/in-app-notify";
import { isAllClaimantsSubmittedAndApproved } from "@/lib/task-all-claimants-state";

type Params = { id: string };

const BodySchema = z.object({
  /**
   * `true`：提前结束，任务整体不计入部员月报/考勤；`false`：收工关单，所有接取者自动计分（已被手动驳回的除外）
   * 未传时默认 `true`（兼容历史调用，界面应显式传 `false` 收工）
   */
  excludeFromAttendance: z.boolean().optional().default(true),
});

/**
 * 管理人员关单：「收工」传 excludeFromAttendance: false；「提前结束(不计考勤)」传 true
 */
export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id: taskId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });
  if (!task) return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  if (task.status !== "OPEN") {
    return NextResponse.json({ message: "任务已结束" }, { status: 400 });
  }

  if (await isAllClaimantsSubmittedAndApproved(taskId)) {
    return NextResponse.json(
      { message: "全员已确认完成，请等待关单；无需再收工" },
      { status: 400 },
    );
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "CLOSED",
      excludeFromAttendance: parsed.data.excludeFromAttendance,
    },
  });

  if (!parsed.data.excludeFromAttendance) {
    // 收工：给所有接取者自动计分（除非已被手动驳回），无论是否提交工作
    const claims = await prisma.taskClaim.findMany({
      where: { taskId, status: "CLAIMED" },
      select: { userId: true },
    });
    const claimantIds = [...new Set(claims.map((c) => c.userId))];

    // 查询各接取者的已有提交和审核状态
    const existingSubs = await prisma.taskSubmission.findMany({
      where: { taskId, userId: { in: claimantIds } },
      select: { id: true, userId: true, review: { select: { result: true } } },
    });
    const subByUser = new Map(existingSubs.map((s) => [s.userId, s]));

    for (const userId of claimantIds) {
      const sub = subByUser.get(userId);

      // 已被手动驳回 → 跳过，不覆盖管理员的决定
      if (sub?.review?.result === "REJECTED") continue;

      let submissionId = sub?.id;

      // 没有提交的 → 自动创建一条提交记录
      if (!submissionId) {
        const newSub = await prisma.taskSubmission.create({
          data: { taskId, userId, submitTime: new Date() },
        });
        submissionId = newSub.id;
      }

      // 已通过 → 跳过
      if (sub?.review?.result === "APPROVED") continue;

      // 待审核或无提交 → 自动通过
      await prisma.taskReview.upsert({
        where: { submissionId },
        create: {
          submissionId,
          result: "APPROVED",
          reason: "收工自动确认",
          reviewerId: session.sub,
        },
        update: {
          result: "APPROVED",
          reason: "收工自动确认",
          reviewerId: session.sub,
        },
      });
    }

    await notifyTaskCompletedToApprovedClaimants(taskId);
  }
  return NextResponse.json({ task: { id: updated.id, status: updated.status, excludeFromAttendance: updated.excludeFromAttendance } });
}
