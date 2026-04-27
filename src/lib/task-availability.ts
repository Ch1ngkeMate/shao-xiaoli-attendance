/**
 * 任务「是否还能接新」的展示，与 /api/tasks/[id]/claim 的校验尽量一致
 *（发布起至整段结束时间前均可接，不要求已到各段 start）
 */
export function getTaskClaimVisibility(args: {
  status: "OPEN" | "CLOSED";
  endTime: string | Date;
  headcountHint: number | null;
  /** 当前为 CLAIMED 的人数 */
  claimedCount: number;
  /**
   * 所有已接取人员的提交均已被通过（与自动 CLOSED 语义一致；用于在仍为 OPEN/名额满等时仍显示顶栏「已结束」）
   */
  allClaimantsApproved?: boolean;
  /** 多段名额时：各段名额均已满，无人可新接 */
  slotsOrTaskFull?: boolean;
}): { text: string; color: "green" | "default" | "orange" | "blue" } {
  if (args.status === "CLOSED") {
    return { text: "已结束", color: "default" };
  }
  if (args.allClaimantsApproved) {
    return { text: "已结束", color: "default" };
  }
  const end = new Date(args.endTime).getTime();
  if (Number.isFinite(end) && Date.now() > end) {
    /** 已截止但尚未全员提交并通过：部长未确认完或有人未提交，与滞留提醒条件一致 */
    if (args.status === "OPEN" && args.claimedCount > 0 && !args.allClaimantsApproved) {
      return { text: "待处理", color: "orange" };
    }
    return { text: "已结束", color: "default" };
  }
  /** 由父级根据每段或任务级算好，true=无人可再接 */
  if (args.slotsOrTaskFull) {
    return { text: "名额已满", color: "orange" };
  }
  if (args.headcountHint != null && args.headcountHint > 0) {
    if (args.claimedCount >= args.headcountHint) {
      return { text: "名额已满", color: "orange" };
    }
  }
  return { text: "可接取", color: "green" };
}

export function isClaimCapacityFull(
  headcountHint: number | null,
  claimedCount: number,
): boolean {
  if (headcountHint == null || headcountHint <= 0) return false;
  return claimedCount >= headcountHint;
}
