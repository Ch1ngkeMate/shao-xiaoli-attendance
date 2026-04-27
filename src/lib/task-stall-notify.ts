import { prisma } from "@/lib/prisma";
import { isAllClaimantsSubmittedAndApproved } from "@/lib/task-all-claimants-state";

/** 截止后经过多少小时仍滞留则发一次站内信 */
const STALL_HOURS_AFTER_END = 12;

/**
 * 扫描「已截止满 12 小时、仍为 OPEN、有人接取、且非全员已通过」的任务，
 * 向未完成结算的干事与全体管理人员各发一条可跳转任务详情的消息，并写入 stallNotifiedAt 幂等。
 * 应由计划任务定期调用（如每小时）访问 /api/cron/task-stall-notify。
 */
export async function runTaskStallNotifications(): Promise<{ notifiedTasks: number }> {
  const now = Date.now();
  const threshold = new Date(now - STALL_HOURS_AFTER_END * 60 * 60 * 1000);

  const candidates = await prisma.task.findMany({
    where: {
      status: "OPEN",
      stallNotifiedAt: null,
      endTime: { lte: threshold },
    },
    select: { id: true, title: true },
  });

  let notifiedTasks = 0;

  for (const t of candidates) {
    const allDone = await isAllClaimantsSubmittedAndApproved(t.id);
    if (allDone) continue;

    const claimRows = await prisma.taskClaim.findMany({
      where: { taskId: t.id, status: "CLAIMED" },
      select: { userId: true },
    });
    const claimUserIds = [...new Set(claimRows.map((c) => c.userId))];
    if (claimUserIds.length === 0) continue;

    const subs = await prisma.taskSubmission.findMany({
      where: { taskId: t.id },
      select: { userId: true, review: { select: { result: true } } },
    });
    const byUser = new Map(subs.map((s) => [s.userId, s]));

    /** 已接取但尚无「已通过」的提交（未交、待审、已驳回） */
    const memberIdsToNotify = claimUserIds.filter((uid) => {
      const s = byUser.get(uid);
      if (!s) return true;
      if (!s.review || s.review.result !== "APPROVED") return true;
      return false;
    });

    const managers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MINISTER"] } },
      select: { id: true },
    });

    const memberTitle = "任务结算提醒";
    const memberBody = `你参与的「${t.title}」任务长时间未提交结算！请关注`;
    const managerTitle = "任务滞留提醒";
    const managerBody = `「${t.title}」任务滞留时间过长，请关注`;

    const messageRows: {
      toUserId: string;
      type: string;
      title: string;
      body: string;
      read: boolean;
      taskId: string;
    }[] = [];

    for (const toUserId of memberIdsToNotify) {
      messageRows.push({
        toUserId,
        type: "TASK_STALL_MEMBER",
        title: memberTitle,
        body: memberBody,
        read: false,
        taskId: t.id,
      });
    }
    for (const m of managers) {
      messageRows.push({
        toUserId: m.id,
        type: "TASK_STALL_MANAGER",
        title: managerTitle,
        body: managerBody,
        read: false,
        taskId: t.id,
      });
    }

    if (messageRows.length === 0) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const gate = await tx.task.updateMany({
          where: {
            id: t.id,
            status: "OPEN",
            stallNotifiedAt: null,
            endTime: { lte: threshold },
          },
          data: { stallNotifiedAt: new Date() },
        });
        if (gate.count !== 1) return;

        await tx.inAppMessage.createMany({ data: messageRows });
      });
      notifiedTasks += 1;
    } catch (e) {
      void console.error("[task-stall-notify]", t.id, e);
    }
  }

  return { notifiedTasks };
}
