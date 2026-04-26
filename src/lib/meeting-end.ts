import dayjs from "dayjs";
import { notifyUsersMeetingAbsence } from "@/lib/in-app-notify";
import { prisma } from "@/lib/prisma";

const ABSENCE_PENALTY = -1;

/**
 * 结束会议：对旷会者记一条月度扣分；已请假的（同会议且已通过）自动跳过
 */
export async function endMeetingWithAbsences(args: {
  meetingId: string;
  endedBy: string;
  /** 被记为旷会的人（部长勾选） */
  absentUserIds: string[];
}) {
  const meeting = await prisma.meeting.findUnique({ where: { id: args.meetingId } });
  if (!meeting) throw new Error("会议不存在");
  if (meeting.status === "ENDED") throw new Error("会议已结束");

  const yearMonth = dayjs(meeting.startTime).format("YYYY-MM");
  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: {
      meetingId: args.meetingId,
      status: "APPROVED",
      category: "MEETING",
    },
    select: { userId: true },
  });
  const leaved = new Set(approvedLeaves.map((l) => l.userId));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adj = (prisma as { attendanceAdjust?: { create: (a: any) => Promise<unknown> } }).attendanceAdjust;
  const unique = [...new Set(args.absentUserIds)];
  const actuallyAbsent: string[] = [];
  if (adj) {
    for (const uid of unique) {
      if (leaved.has(uid)) continue; // 已准假不扣
      actuallyAbsent.push(uid);
      await adj.create({
        data: {
          userId: uid,
          yearMonth,
          amount: ABSENCE_PENALTY,
          reason: `例会旷会：${meeting.title}`,
          meetingId: meeting.id,
        },
      });
    }
  } else {
    for (const uid of unique) {
      if (!leaved.has(uid)) actuallyAbsent.push(uid);
    }
    // Client 过旧时无法写表，仅结束会议；应执行 npx prisma generate 与 db push/迁移
    void console.warn("[meeting-end] 当前 Prisma Client 无 attendanceAdjust，已跳过旷会扣分");
  }

  await notifyUsersMeetingAbsence({
    meetingId: meeting.id,
    userIds: actuallyAbsent,
    meetingTitle: meeting.title,
    yearMonth,
    penaltyApplied: !!adj,
  });

  await prisma.meeting.update({
    where: { id: args.meetingId },
    data: { status: "ENDED", endedAt: new Date(), endedBy: args.endedBy },
  });
}
