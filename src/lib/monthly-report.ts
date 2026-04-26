import dayjs from "dayjs";
import { groupAdjustSumsByUserForMonth, sumAdjustForUserInMonth } from "@/lib/attendance-adjust-queries";
import { prisma } from "@/lib/prisma";
import { getAttendingTaskIds } from "@/lib/attendance-allowed-tasks";

/** 月度内、与会议关联的旷会扣分一条（展示用） */
export type MeetingAbsenceMonthlyEntry = {
  id: string;
  meetingId: string | null;
  /** 如「2026-04-20 会议旷会（例会标题）」 */
  label: string;
  amount: number;
  recordedAt: string;
};

function buildMeetingAbsenceEntry(adj: {
  id: string;
  meetingId: string | null;
  amount: number;
  createdAt: Date;
  reason: string;
  meeting: { title: string; startTime: Date } | null;
}): MeetingAbsenceMonthlyEntry {
  const label =
    adj.meeting != null
      ? `${dayjs(adj.meeting.startTime).format("YYYY-MM-DD")} 会议旷会（${adj.meeting.title}）`
      : adj.reason || "例会旷会扣分";
  return {
    id: adj.id,
    meetingId: adj.meetingId,
    label,
    amount: adj.amount,
    recordedAt: adj.createdAt.toISOString(),
  };
}

export type MonthlyReportStats = {
  month: string; // YYYY-MM
  generatedAt: string;
  people: Array<{
    userId: string;
    username: string;
    displayName: string;
    role: "ADMIN" | "MINISTER" | "MEMBER";
    claimCount: number;
    submitCount: number;
    approvedCount: number;
    approvedPoints: number;
    approvedTasks: Array<{
      taskId: string;
      title: string;
      points: number;
      reviewTime: string;
    }>;
    /** 当月登记的例会旷会扣分明细（与 otherPoints 中会议部分对应） */
    meetingAbsences: MeetingAbsenceMonthlyEntry[];
    /** 例会变动的加减分等（旷会为负） */
    otherPoints: number;
    /** 部员累计可用：任务确认分 + 其它分 */
    totalPoints: number;
  }>;
};

export function getMonthRange(month: string) {
  const start = dayjs(`${month}-01`).startOf("month");
  const end = start.add(1, "month");
  if (!start.isValid()) {
    throw new Error("月份格式错误，应为 YYYY-MM");
  }
  return { start: start.toDate(), end: end.toDate() };
}

export async function computeMonthlyReportStats(month: string): Promise<MonthlyReportStats> {
  const { start, end } = getMonthRange(month);

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
          where: { status: "CLAIMED", claimTime: { gte: start, lt: end }, taskId: taskIn },
          select: { userId: true },
        })
      : [];

  const submissions =
    allowList.length > 0
      ? await prisma.taskSubmission.findMany({
          where: { submitTime: { gte: start, lt: end }, taskId: taskIn },
          select: { userId: true },
        })
      : [];

  const approvedReviews =
    allowList.length > 0
      ? await prisma.taskReview.findMany({
          where: {
            result: "APPROVED",
            reviewTime: { gte: start, lt: end },
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
  const approvedTasksMap = new Map<string, MonthlyReportStats["people"][number]["approvedTasks"]>();

  for (const r of approvedReviews) {
    const userId = r.submission.user.id;
    approvedCountMap.set(userId, (approvedCountMap.get(userId) ?? 0) + 1);
    approvedPointsMap.set(
      userId,
      (approvedPointsMap.get(userId) ?? 0) + r.submission.task.points,
    );
    const list = approvedTasksMap.get(userId) ?? [];
    list.push({
      taskId: r.submission.task.id,
      title: r.submission.task.title,
      points: r.submission.task.points,
      reviewTime: r.reviewTime.toISOString(),
    });
    approvedTasksMap.set(userId, list);
  }

  const otherMap = await groupAdjustSumsByUserForMonth(month);

  const absenceAdjustRows = await prisma.attendanceAdjust.findMany({
    where: {
      yearMonth: month,
      meetingId: { not: null },
      amount: { lt: 0 },
    },
    include: {
      meeting: { select: { title: true, startTime: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const meetingAbsencesMap = new Map<string, MeetingAbsenceMonthlyEntry[]>();
  for (const adj of absenceAdjustRows) {
    const e = buildMeetingAbsenceEntry(adj);
    const list = meetingAbsencesMap.get(adj.userId) ?? [];
    list.push(e);
    meetingAbsencesMap.set(adj.userId, list);
  }

  return {
    month,
    generatedAt: new Date().toISOString(),
    people: users.map((u) => {
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
        approvedTasks: approvedTasksMap.get(u.id) ?? [],
        meetingAbsences: meetingAbsencesMap.get(u.id) ?? [],
        otherPoints: otherP,
        totalPoints: approvedP + otherP,
      };
    }),
  };
}

/**
 * 快照 JSON 里冻结了生成时的姓名/账号；用户改名后，读快照时用当前 User 表覆盖展示字段（积分等仍用快照内数值）。
 */
export async function hydrateMonthlyReportPeopleFromDb(stats: MonthlyReportStats): Promise<MonthlyReportStats> {
  const ids = [...new Set(stats.people.map((p) => p.userId))];
  if (ids.length === 0) return stats;

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, displayName: true, role: true },
  });
  const map = new Map(users.map((u) => [u.id, u]));

  return {
    ...stats,
    people: stats.people.map((p) => {
      const u = map.get(p.userId);
      const base = {
        ...p,
        meetingAbsences: p.meetingAbsences ?? [],
      };
      if (!u) return base;
      return {
        ...base,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
      };
    }),
  };
}

/** 单月、单人的考勤统计（与个人主页一致口径） */
export type MemberMonthlyRow = MonthlyReportStats["people"][number];

export async function computeMemberMonthlyStats(month: string, userId: string): Promise<MemberMonthlyRow | null> {
  const { start, end } = getMonthRange(month);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  const allowIds = await getAttendingTaskIds();
  const allowList = [...allowIds];
  const taskIn: { in: string[] } = { in: allowList };

  const claimCount =
    allowList.length > 0
      ? await prisma.taskClaim.count({
          where: { userId, status: "CLAIMED", claimTime: { gte: start, lt: end }, taskId: taskIn },
        })
      : 0;

  const submitCount =
    allowList.length > 0
      ? await prisma.taskSubmission.count({
          where: { userId, submitTime: { gte: start, lt: end }, taskId: taskIn },
        })
      : 0;

  const approvedReviews =
    allowList.length > 0
      ? await prisma.taskReview.findMany({
          where: {
            result: "APPROVED",
            reviewTime: { gte: start, lt: end },
            submission: { userId, taskId: taskIn },
          },
          include: {
            submission: {
              include: {
                task: { select: { id: true, title: true, points: true } },
              },
            },
          },
          orderBy: { reviewTime: "asc" },
        })
      : [];

  let approvedPoints = 0;
  const approvedTasks: MemberMonthlyRow["approvedTasks"] = [];
  for (const r of approvedReviews) {
    approvedPoints += r.submission.task.points;
    approvedTasks.push({
      taskId: r.submission.task.id,
      title: r.submission.task.title,
      points: r.submission.task.points,
      reviewTime: r.reviewTime.toISOString(),
    });
  }

  const otherPoints = await sumAdjustForUserInMonth(userId, month);

  const absenceAdjustRows = await prisma.attendanceAdjust.findMany({
    where: {
      userId,
      yearMonth: month,
      meetingId: { not: null },
      amount: { lt: 0 },
    },
    include: {
      meeting: { select: { title: true, startTime: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const meetingAbsences = absenceAdjustRows.map((adj) => buildMeetingAbsenceEntry(adj));

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    claimCount,
    submitCount,
    // 与下方 approvedTasks 条数一致（任务 id 已限制在 getAttendingTaskIds 内）
    approvedCount: approvedTasks.length,
    approvedPoints,
    approvedTasks,
    meetingAbsences,
    otherPoints,
    totalPoints: approvedPoints + otherPoints,
  };
}

