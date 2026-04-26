import dayjs from "dayjs";
import { groupAdjustSumsByUserForDateRange } from "@/lib/attendance-adjust-queries";
import { prisma } from "@/lib/prisma";
import { getAttendingTaskIds } from "@/lib/attendance-allowed-tasks";

/** 与月报「人员行」同口径，但时间轴为任意 [start, end]（含端点日全天） */
export type RangePersonRow = {
  userId: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "MINISTER" | "MEMBER";
  claimCount: number;
  submitCount: number;
  approvedCount: number;
  approvedPoints: number;
  otherPoints: number;
  totalPoints: number;
};

export async function computeAttendanceRangePeopleStats(start: Date, end: Date): Promise<RangePersonRow[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { displayName: "asc" }],
    select: { id: true, username: true, displayName: true, role: true },
  });

  const allowIds = await getAttendingTaskIds();
  const allowList = [...allowIds];
  const taskIn: { in: string[] } = { in: allowList };

  const claims =
    allowList.length > 0
      ? await prisma.taskClaim.findMany({
          where: { status: "CLAIMED", claimTime: { gte: start, lte: end }, taskId: taskIn },
          select: { userId: true },
        })
      : [];

  const submissions =
    allowList.length > 0
      ? await prisma.taskSubmission.findMany({
          where: { submitTime: { gte: start, lte: end }, taskId: taskIn },
          select: { userId: true },
        })
      : [];

  const approvedReviews =
    allowList.length > 0
      ? await prisma.taskReview.findMany({
          where: {
            result: "APPROVED",
            reviewTime: { gte: start, lte: end },
            submission: { taskId: taskIn },
          },
          include: {
            submission: {
              include: {
                task: { select: { id: true, title: true, points: true } },
                user: { select: { id: true } },
              },
            },
          },
          orderBy: { reviewTime: "asc" },
        })
      : [];

  const claimCountMap = new Map<string, number>();
  for (const c of claims) claimCountMap.set(c.userId, (claimCountMap.get(c.userId) ?? 0) + 1);

  const submitCountMap = new Map<string, number>();
  for (const s of submissions) submitCountMap.set(s.userId, (submitCountMap.get(s.userId) ?? 0) + 1);

  const approvedCountMap = new Map<string, number>();
  const approvedPointsMap = new Map<string, number>();

  for (const r of approvedReviews) {
    const userId = r.submission.user.id;
    approvedCountMap.set(userId, (approvedCountMap.get(userId) ?? 0) + 1);
    approvedPointsMap.set(
      userId,
      (approvedPointsMap.get(userId) ?? 0) + r.submission.task.points,
    );
  }

  const otherMap = await groupAdjustSumsByUserForDateRange(start, end);

  return users.map((u) => {
    const approvedP = approvedPointsMap.get(u.id) ?? 0;
    const otherP = otherMap.get(u.id) ?? 0;
    return {
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      claimCount: claimCountMap.get(u.id) ?? 0,
      submitCount: submitCountMap.get(u.id) ?? 0,
      approvedCount: approvedCountMap.get(u.id) ?? 0,
      approvedPoints: approvedP,
      otherPoints: otherP,
      totalPoints: approvedP + otherP,
    };
  });
}

export type RangeTaskRow = {
  kind: "TASK";
  taskId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  /** 该时间段内对该任务产生接取记录的去重人数（不同 userId） */
  participantDistinctCount: number;
  /** 上述人员显示名，顿号分隔，与「参与人数」一致 */
  participantNamesText: string;
  points: number;
};

export type RangeAbsenceRow = {
  kind: "MEETING_ABSENCE";
  /** 扣分记录 id，便于追溯 */
  adjustId: string;
  /** 旷会人员（表一「参与人员」列；每条记录一人） */
  userDisplayName: string;
  /** 表一「参与人数」：本条旷会涉及人数（当前恒为 1） */
  participantCount: number;
  /** 表一「标题」：按会议开始日命名，如「2026-04-20 会议旷会」 */
  displayTitle: string;
  meetingTitle: string;
  meetingStart: Date;
  meetingEnd: Date | null;
  recordedAt: Date;
  amount: number;
};

/**
 * 表一上半：与时间段有交集且计入考勤的任务；下半：该时间段内登记的例会旷会扣分（每条 -1 等）
 */
export async function fetchRangeTaskAndAbsenceRows(
  start: Date,
  end: Date,
): Promise<{ tasks: RangeTaskRow[]; absences: RangeAbsenceRow[] }> {
  const allowIds = await getAttendingTaskIds();
  const allowList = [...allowIds];
  if (allowList.length === 0) {
    return { tasks: [], absences: await fetchAbsenceRows(start, end) };
  }

  const tasks = await prisma.task.findMany({
    where: {
      excludeFromAttendance: false,
      id: { in: allowList },
      AND: [{ startTime: { lte: end } }, { endTime: { gte: start } }],
    },
    orderBy: { startTime: "asc" },
    select: { id: true, title: true, startTime: true, endTime: true, points: true },
  });

  const taskIds = tasks.map((t) => t.id);
  const claimsInRange =
    taskIds.length > 0
      ? await prisma.taskClaim.findMany({
          where: {
            taskId: { in: taskIds },
            status: "CLAIMED",
            claimTime: { gte: start, lte: end },
          },
          select: { taskId: true, userId: true },
        })
      : [];
  /** taskId -> 该时段内接取过的不同人数 */
  const distinctUsersByTask = new Map<string, Set<string>>();
  for (const c of claimsInRange) {
    let set = distinctUsersByTask.get(c.taskId);
    if (!set) {
      set = new Set();
      distinctUsersByTask.set(c.taskId, set);
    }
    set.add(c.userId);
  }

  const allClaimUserIds = new Set<string>();
  for (const uidSet of distinctUsersByTask.values()) {
    for (const uid of uidSet) {
      allClaimUserIds.add(uid);
    }
  }
  const claimUsers =
    allClaimUserIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...allClaimUserIds] } },
          select: { id: true, displayName: true },
        })
      : [];
  const displayNameByUserId = new Map(claimUsers.map((u) => [u.id, u.displayName] as const));

  function participantNamesForTask(taskId: string): string {
    const ids = distinctUsersByTask.get(taskId);
    if (!ids || ids.size === 0) return "";
    const names = [...ids]
      .map((id) => displayNameByUserId.get(id) ?? id)
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    return names.join("、");
  }

  const taskRows: RangeTaskRow[] = tasks.map((t) => {
    const idSet = distinctUsersByTask.get(t.id);
    const participantDistinctCount = idSet?.size ?? 0;
    return {
      kind: "TASK" as const,
      taskId: t.id,
      title: t.title,
      startTime: t.startTime,
      endTime: t.endTime,
      participantDistinctCount,
      participantNamesText: participantNamesForTask(t.id),
      points: t.points,
    };
  });

  const absences = await fetchAbsenceRows(start, end);
  return { tasks: taskRows, absences };
}

async function fetchAbsenceRows(start: Date, end: Date): Promise<RangeAbsenceRow[]> {
  const rows = await prisma.attendanceAdjust.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      amount: { lt: 0 },
      meetingId: { not: null },
    },
    include: {
      meeting: { select: { title: true, startTime: true, endTime: true } },
      user: { select: { displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows
    .filter((r) => r.meeting != null)
    .map((r) => {
      const m = r.meeting!;
      const dateLabel = dayjs(m.startTime).format("YYYY-MM-DD");
      return {
        kind: "MEETING_ABSENCE" as const,
        adjustId: r.id,
        userDisplayName: r.user.displayName,
        participantCount: 1,
        displayTitle: `${dateLabel} 会议旷会`,
        meetingTitle: m.title,
        meetingStart: m.startTime,
        meetingEnd: m.endTime,
        recordedAt: r.createdAt,
        amount: r.amount,
      };
    });
}
