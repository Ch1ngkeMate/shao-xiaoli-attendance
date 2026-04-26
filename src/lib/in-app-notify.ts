import dayjs from "dayjs";
import { getAttendingTaskIds } from "@/lib/attendance-allowed-tasks";
import { prisma } from "@/lib/prisma";

/** 接取并审核通过者：任务关单且计考勤时发送 */
export async function notifyTaskCompletedToApprovedClaimants(taskId: string) {
  const allowed = await getAttendingTaskIds();
  if (!allowed.has(taskId)) return;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return;

  const subs = await prisma.taskSubmission.findMany({
    where: { taskId, review: { result: "APPROVED" } },
    select: { userId: true },
  });
  for (const s of subs) {
    await prisma.inAppMessage.create({
      data: {
        toUserId: s.userId,
        type: "TASK_DONE",
        title: "任务已完成",
        body: `您接取的「${task.title}」已圆满完成，功德+${task.points}！`,
        read: false,
        taskId: task.id,
      },
    });
  }
}

export async function notifyManagersNewLeave(leaveId: string) {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id: leaveId },
    include: { user: { select: { displayName: true } } },
  });
  if (!leave) return;
  const managers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "MINISTER"] } },
    select: { id: true },
  });
  const cat = leave.category === "MEETING" ? "会议" : "值班";
  for (const m of managers) {
    await prisma.inAppMessage.create({
      data: {
        toUserId: m.id,
        type: "LEAVE_APPLY",
        title: "新的请假申请",
        body: `${leave.user.displayName} 提交了${cat}请假，请及时处理。`,
        read: false,
        leaveId: leave.id,
      },
    });
  }
}

export async function notifyLeaveDecided(leaveId: string) {
  const leave = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
  if (!leave) return;
  // 任一部长/管理员处理完毕后，所有管理人员收到的「新的请假申请」一并标为已读，避免其他人仍看到未读红点
  await prisma.inAppMessage.updateMany({
    where: { leaveId, type: "LEAVE_APPLY" },
    data: { read: true },
  });
  const ok = leave.status === "APPROVED";
  await prisma.inAppMessage.create({
    data: {
      toUserId: leave.userId,
      type: "LEAVE_DECIDED",
      title: ok ? "请假已同意" : "请假已驳回",
      body: ok
        ? "您的请假已同意，对应时段不扣考勤分。"
        : `您的请假未通过。${leave.rejectReason ? `原因：${leave.rejectReason}` : ""}`,
      read: false,
      leaveId: leave.id,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inApp() {
  return (prisma as { inAppMessage?: any }).inAppMessage;
}

/** 新会议发布后通知全体在册部员（MEMBER） */
export async function notifyMembersNewMeeting(args: {
  meetingId: string;
  title: string;
  startTime: Date;
  endTime: Date | null;
  place: string | null;
  description: string | null;
  publisherName: string;
}) {
  const m = inApp();
  if (!m?.createMany) return;
  const members = await prisma.user.findMany({
    where: { isActive: true, role: "MEMBER" },
    select: { id: true },
  });
  if (members.length === 0) return;

  const t0 = dayjs(args.startTime);
  const timeLine = args.endTime
    ? `${t0.format("YYYY-MM-DD HH:mm")} ~ ${dayjs(args.endTime).format("HH:mm")}`
    : t0.format("YYYY-MM-DD HH:mm");
  const placeLine = args.place?.trim() ? `地点：${args.place}` : "地点：待通知";
  const descLine = args.description?.trim() ? `\n说明：${args.description}` : "";
  const body = `「${args.title}」\n时间：${timeLine}\n${placeLine}\n发布：${args.publisherName}${descLine}`;

  await m.createMany({
    data: members.map((u) => ({
      toUserId: u.id,
      type: "MEETING_NEW",
      title: "新会议通知",
      body,
      read: false,
      meetingId: args.meetingId,
    })),
  });
}

/**
 * 会议结束关会时，对被记为旷会者发单独提醒（与全员「新会议」推送区分）
 * @param userIds 部长勾选的旷会者中，未因同会议已准假而跳过的人
 * @param penaltyApplied 是否成功写入 AttendanceAdjust（-1 分），否则只提示被记旷会
 */
export async function notifyUsersMeetingAbsence(args: {
  meetingId: string;
  userIds: string[];
  meetingTitle: string;
  yearMonth: string;
  penaltyApplied: boolean;
}) {
  if (args.userIds.length === 0) return;
  const m = inApp();
  if (!m?.create) return;
  const title = "旷会记录";
  const body = args.penaltyApplied
    ? `您在例会「${args.meetingTitle}」中被记为旷会，${args.yearMonth} 月考勤「其他分」已记 -1 分。如有疑问请联系部长。`
    : `您在例会「${args.meetingTitle}」中被记为旷会。若月度未显示扣分，请与部长确认或联系管理员处理数据库。`;
  for (const toUserId of args.userIds) {
    try {
      await m.create({
        data: {
          toUserId,
          type: "MEETING_ABSENCE",
          title,
          body,
          read: false,
          meetingId: args.meetingId,
        },
      });
    } catch (e) {
      void console.error("[in-app] MEETING_ABSENCE", toUserId, e);
    }
  }
}
