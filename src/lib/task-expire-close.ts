import { prisma } from "@/lib/prisma";

/**
 * 扫描所有 OPEN 状态且 endTime 已过的任务，自动标为 CLOSED
 * 同时通知所有已接取且提交已通过的干事
 */
export async function autoCloseExpiredTasks(): Promise<number> {
  const now = new Date();

  // 查找所有到期仍未关闭的任务
  const expired = await prisma.task.findMany({
    where: {
      status: "OPEN",
      endTime: { lte: now },
    },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  await prisma.task.updateMany({
    where: { id: { in: expired.map((t) => t.id) } },
    data: { status: "CLOSED" },
  });

  // 通知已通过的干事
  const { notifyTaskCompletedToApprovedClaimants } = await import(
    "@/lib/in-app-notify"
  );
  for (const t of expired) {
    try {
      await notifyTaskCompletedToApprovedClaimants(t.id);
    } catch {
      // 通知失败不影响主流程
    }
  }

  return expired.length;
}
