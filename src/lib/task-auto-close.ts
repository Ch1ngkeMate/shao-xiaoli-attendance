import { prisma } from "@/lib/prisma";
import { notifyTaskCompletedToApprovedClaimants } from "@/lib/in-app-notify";
import { isAllClaimantsSubmittedAndApproved } from "./task-all-claimants-state";

/**
 * 当该任务下所有「已接取」的干事均已完成提交，且其提交均已被通过时，将任务标为已结束（CLOSED，正常计考勤）
 * 与列表/详情中 allClaimantsApproved 判定一致
 */
export async function tryAutoCloseTaskIfAllClaimantsApproved(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.status === "CLOSED") return;
  const ok = await isAllClaimantsSubmittedAndApproved(taskId);
  if (!ok) return;
  await prisma.task.update({ where: { id: taskId }, data: { status: "CLOSED" } });
  await notifyTaskCompletedToApprovedClaimants(taskId);
}
