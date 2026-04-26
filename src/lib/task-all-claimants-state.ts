import { prisma } from "@/lib/prisma";

/**
 * 判断：该任务下每位「已接取」人员是否均已提交，且其提交均已被通过。
 * 用于「正常关单」展示（与 tryAutoCloseTaskIfAllClaimantsApproved 条件一致）
 */
function computeAllClaimantsFullyDone(
  claimUserIds: string[],
  subs: { userId: string; review: { result: string } | null }[],
): boolean {
  if (claimUserIds.length === 0) return false;
  const byUser = new Map(subs.map((s) => [s.userId, s]));
  for (const uid of claimUserIds) {
    const s = byUser.get(uid);
    if (!s) return false; // 未提交
    if (!s.review || s.review.result !== "APPROVED") return false;
  }
  return true;
}

/** 单任务：用于详情页 */
export async function isAllClaimantsSubmittedAndApproved(taskId: string): Promise<boolean> {
  const claims = await prisma.taskClaim.findMany({
    where: { taskId, status: "CLAIMED" },
    select: { userId: true },
  });
  const claimUserIds = [...new Set(claims.map((c) => c.userId))];
  if (claimUserIds.length === 0) return false;
  const subs = await prisma.taskSubmission.findMany({
    where: { taskId },
    select: { userId: true, review: { select: { result: true } } },
  });
  return computeAllClaimantsFullyDone(claimUserIds, subs);
}

/**
 * 批量：用于任务列表 API，按 taskId 填 Map
 * @param taskIds 与列表查询结果 id 一致
 */
export async function batchAllClaimantsSubmittedAndApproved(taskIds: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (const id of taskIds) out.set(id, false);
  if (taskIds.length === 0) return out;

  const claims = await prisma.taskClaim.findMany({
    where: { taskId: { in: taskIds }, status: "CLAIMED" },
    select: { taskId: true, userId: true },
  });
  const claimByTask = new Map<string, string[]>();
  for (const c of claims) {
    const a = claimByTask.get(c.taskId) ?? [];
    if (!a.includes(c.userId)) a.push(c.userId);
    claimByTask.set(c.taskId, a);
  }

  const subs = await prisma.taskSubmission.findMany({
    where: { taskId: { in: taskIds } },
    select: { taskId: true, userId: true, review: { select: { result: true } } },
  });
  const subsByTask = new Map<string, { userId: string; review: { result: string } | null }[]>();
  for (const s of subs) {
    const arr = subsByTask.get(s.taskId) ?? [];
    arr.push({ userId: s.userId, review: s.review });
    subsByTask.set(s.taskId, arr);
  }

  for (const id of taskIds) {
    const cids = claimByTask.get(id) ?? [];
    out.set(id, computeAllClaimantsFullyDone(cids, subsByTask.get(id) ?? []));
  }
  return out;
}
