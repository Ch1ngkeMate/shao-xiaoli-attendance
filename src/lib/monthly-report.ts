import dayjs from "dayjs";
import { prisma } from "@/lib/prisma";

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

  const claims = await prisma.taskClaim.findMany({
    where: {
      status: "CLAIMED",
      claimTime: { gte: start, lt: end },
    },
    select: { userId: true },
  });

  const submissions = await prisma.taskSubmission.findMany({
    where: {
      submitTime: { gte: start, lt: end },
    },
    select: { userId: true },
  });

  const approvedReviews = await prisma.taskReview.findMany({
    where: {
      result: "APPROVED",
      reviewTime: { gte: start, lt: end },
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
  });

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

  return {
    month,
    generatedAt: new Date().toISOString(),
    people: users.map((u) => ({
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      claimCount: claimCountMap.get(u.id) ?? 0,
      submitCount: submitCountMap.get(u.id) ?? 0,
      approvedCount: approvedCountMap.get(u.id) ?? 0,
      approvedPoints: approvedPointsMap.get(u.id) ?? 0,
      approvedTasks: approvedTasksMap.get(u.id) ?? [],
    })),
  };
}

