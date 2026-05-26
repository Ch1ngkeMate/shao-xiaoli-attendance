import dayjs from "dayjs";
import { notifyUsersMeetingAbsence } from "@/lib/in-app-notify";
import { prisma } from "@/lib/prisma";

const ABSENCE_PENALTY = -1;

/**
 * 结束会议：基于签到数据自动计算缺勤并扣分
 * - 已签到 / 已批准请假 → 不扣
 * - 未签到 + 未请假 → 旷会扣 -1 分
 */
export async function endMeetingWithAbsences(args: {
  meetingId: string;
  endedBy: string;
  /** 手动补传缺勤者 ID（与签到自动计算的取并集） */
  absentUserIds?: string[];
}) {
  const meeting = await prisma.meeting.findUnique({ where: { id: args.meetingId } });
  if (!meeting) throw new Error("会议不存在");
  if (meeting.status === "ENDED") throw new Error("会议已结束");

  const yearMonth = dayjs(meeting.startTime).format("YYYY-MM");

  // 已批准请假的部员
  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: {
      meetingId: args.meetingId,
      status: "APPROVED",
      category: "MEETING",
    },
    select: { userId: true },
  });
  const leavedIds = new Set(approvedLeaves.map((l) => l.userId));

  // 已签到的部员（GPS 签到记录）
  let checkedInIds: Set<string> = new Set();
  try {
    const checkIns = await prisma.meetingCheckIn.findMany({
      where: { meetingId: args.meetingId },
      select: { userId: true },
    });
    checkedInIds = new Set(checkIns.map((c) => c.userId));
  } catch { /* 表不存在时跳过 */ }

  // 活跃的干事（MEMBER）—— 签到只对干事有意义
  const allMembers = await prisma.user.findMany({
    where: { isActive: true, role: "MEMBER" },
    select: { id: true },
  });

  // 缺勤 = 活跃干事 - 已签到 - 已请假 + 手动补传
  const absentSet = new Set<string>();
  for (const m of allMembers) {
    if (!checkedInIds.has(m.id) && !leavedIds.has(m.id)) {
      absentSet.add(m.id);
    }
  }
  if (args.absentUserIds) {
    for (const uid of args.absentUserIds) {
      if (!leavedIds.has(uid)) absentSet.add(uid);
    }
  }

  const actuallyAbsent = [...absentSet];

  // 写扣分记录
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adj = (prisma as { attendanceAdjust?: { create: (a: any) => Promise<unknown> } }).attendanceAdjust;
  if (adj) {
    for (const uid of actuallyAbsent) {
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
    void console.warn("[meeting-end] 当前 Prisma Client 无 attendanceAdjust，已跳过旷会扣分");
  }

  // 站内信通知旷会者
  if (actuallyAbsent.length > 0) {
    await notifyUsersMeetingAbsence({
      meetingId: meeting.id,
      userIds: actuallyAbsent,
      meetingTitle: meeting.title,
      yearMonth,
      penaltyApplied: !!adj,
    });
  }

  await prisma.meeting.update({
    where: { id: args.meetingId },
    data: { status: "ENDED", endedAt: new Date(), endedBy: args.endedBy },
  });
}
