type SlotT = { id: string; headcountHint: number | null; sort: number };
type ClaimT = { timeSlotId: string | null; status: string };

/**
 * 旧数据 timeSlot 为空时：视为第 0 段（与唯一一段）
 */
function claimsForSlot(
  firstSlotId: string | null,
  slotId: string,
  claims: ClaimT[],
): number {
  return claims.filter((c) => c.status === "CLAIMED" && (c.timeSlotId === slotId || (!c.timeSlotId && slotId === firstSlotId))).length;
}

/** 多段时：各段有名额的至少一段未满则仍可接新（未接取前） */
export function isEveryLimitedSlotFull(slots: SlotT[], firstSlotId: string | null, claims: ClaimT[]): boolean {
  if (slots.length === 0) return false;
  for (const s of slots) {
    if (s.headcountHint == null || s.headcountHint <= 0) {
      // 本段不限制 = 总有余位
      return false;
    }
  }
  return slots.every((s) => {
    if (s.headcountHint == null || s.headcountHint <= 0) return true;
    const n = claimsForSlot(firstSlotId, s.id, claims);
    return n >= s.headcountHint;
  });
}

/**
 * 本任务（含旧版仅任务级人数）是否 名额满
 */
export function isTaskFullForClaim(args: {
  timeSlots: SlotT[];
  taskHeadcount: number | null;
  firstSlotId: string | null;
  claimRows: ClaimT[];
}): boolean {
  if (args.timeSlots.length > 0) {
    if (isEveryLimitedSlotFull(args.timeSlots, args.firstSlotId, args.claimRows)) return true;
    return false;
  }
  if (args.taskHeadcount != null && args.taskHeadcount > 0) {
    const n = args.claimRows.filter((c) => c.status === "CLAIMED").length;
    return n >= args.taskHeadcount;
  }
  return false;
}

/**
 * 某段在接取人未满时可再接一人
 */
export function slotCanAccept(
  firstSlotId: string | null,
  slot: SlotT,
  claimRows: ClaimT[],
): boolean {
  if (slot.headcountHint == null || slot.headcountHint <= 0) return true;
  const n = claimsForSlot(firstSlotId, slot.id, claimRows);
  return n < slot.headcountHint;
}
