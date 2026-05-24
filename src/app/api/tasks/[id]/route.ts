import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAllClaimantsSubmittedAndApproved } from "@/lib/task-all-claimants-state";
import { isTaskFullForClaim, slotCanAccept } from "@/lib/slot-claim-availability";
import { readSessionCookie } from "@/lib/auth";
import { getTaskTimeBoundsFromSlots } from "@/lib/task-time-bounds";

type Params = { id: string };

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;

  // 读取会话（支持 Cookie 和 Bearer Token）
  const session = await readSessionCookie();
  const userId = session?.sub ?? null;
  const isMgr = session?.role === "ADMIN" || session?.role === "MINISTER";

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      publisher: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      images: { orderBy: { sort: "asc" as const } },
      timeSlots: { orderBy: { sort: "asc" as const } },
      claims: {
        where: { status: "CLAIMED" as const },
        orderBy: { claimTime: "asc" as const },
        include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
      },
      submissions: {
        orderBy: { submitTime: "desc" as const },
        include: {
          user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          evidenceImages: { orderBy: { sort: "asc" as const } },
          review: true,
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  // 序列化 task 基础字段
  const taskJson = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    points: task.points,
    headcountHint: task.headcountHint,
    startTime: task.startTime.toISOString(),
    endTime: task.endTime.toISOString(),
    excludeFromAttendance: task.excludeFromAttendance,
    publisher: task.publisher,
    images: task.images.map((img) => ({ id: img.id, url: img.url, sort: img.sort })),
    timeSlots: task.timeSlots.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      sort: s.sort,
      headcountHint: s.headcountHint,
    })),
    claims: task.claims.map((c) => ({
      id: c.id,
      timeSlotId: c.timeSlotId,
      status: c.status,
      claimTime: c.claimTime.toISOString(),
      user: c.user
        ? {
            id: c.user.id,
            displayName: c.user.displayName,
            username: c.user.username,
            avatarUrl: c.user.avatarUrl,
          }
        : null,
    })),
    claimedCount: task.claims.length,
  };

  // 如果没有 userId，仅返回基础任务信息
  if (!userId) {
    return NextResponse.json({ task: taskJson });
  }

  // ========== 计算字段（与网页端 TaskDetailPage 一致） ==========

  const myClaims = task.claims.filter((c) => c.userId === userId);
  const myActiveClaims = myClaims.filter((c) => c.status === "CLAIMED");
  const firstSlotId = task.timeSlots[0]?.id ?? null;

  const claimRowsForFull = task.claims
    .filter((c) => c.status === "CLAIMED")
    .map((c) => ({ timeSlotId: c.timeSlotId, status: "CLAIMED" as const }));

  // slotsOrTaskFull
  const slotsOrTaskFull = isTaskFullForClaim({
    timeSlots: task.timeSlots.map((s) => ({
      id: s.id,
      headcountHint: s.headcountHint,
      sort: s.sort,
    })),
    taskHeadcount: task.headcountHint,
    firstSlotId,
    claimRows: claimRowsForFull,
  });

  // allClaimantsApproved
  const allClaimantsApproved = await isAllClaimantsSubmittedAndApproved(task.id);

  // 时间是否已过
  const { end: effectiveEnd } = getTaskTimeBoundsFromSlots({
    startTime: task.startTime,
    endTime: task.endTime,
    timeSlots: task.timeSlots,
  });
  const timeEnded = Date.now() > effectiveEnd.getTime();

  // myClaimedSlotIds
  const myClaimedSlotIds = [
    ...new Set(
      myActiveClaims
        .map((c) => c.timeSlotId ?? firstSlotId)
        .filter((id): id is string => id != null),
    ),
  ];

  // canClaimMore
  const canClaimMore =
    task.status === "OPEN" &&
    !timeEnded &&
    !allClaimantsApproved &&
    (() => {
      const slots = task.timeSlots;
      if (slots.length > 1) {
        return slots.some((slot) => {
          if (myClaimedSlotIds.includes(slot.id)) return false;
          return slotCanAccept(
            firstSlotId,
            { id: slot.id, headcountHint: slot.headcountHint, sort: slot.sort },
            claimRowsForFull,
          );
        });
      }
      if (slots.length === 1) {
        return myActiveClaims.length === 0 && !slotsOrTaskFull;
      }
      return myActiveClaims.length === 0 && !slotsOrTaskFull;
    })();

  // claimantsBySlot
  const claimantsBySlot =
    task.timeSlots.length > 0
      ? task.timeSlots.map((slot) => ({
          slotId: slot.id,
          sort: slot.sort,
          startTime: slot.startTime.toISOString(),
          endTime: slot.endTime.toISOString(),
          headcountHint: slot.headcountHint,
          claimants: task.claims
            .filter((c) => (c.timeSlotId ?? firstSlotId) === slot.id)
            .map((c) => ({
              claimId: c.id,
              id: c.user.id,
              displayName: c.user.displayName,
              username: c.user.username,
              avatarUrl: c.user.avatarUrl,
            })),
        }))
      : [
          {
            slotId: "legacy",
            sort: 0,
            startTime: task.startTime.toISOString(),
            endTime: task.endTime.toISOString(),
            headcountHint: null as number | null,
            claimants: task.claims.map((c) => ({
              claimId: c.id,
              id: c.user.id,
              displayName: c.user.displayName,
              username: c.user.username,
              avatarUrl: c.user.avatarUrl,
            })),
          },
        ];

  // claimedCountBySlot
  const claimedCountBySlot = Object.fromEntries(
    claimantsBySlot.map((g) => [g.slotId, (g.claimants ?? []).length]),
  );

  // mySubmission — 仅当前用户的提交
  const mySub = task.submissions.find((s) => s.userId === userId) ?? null;
  const mySubmission = mySub
    ? {
        id: mySub.id,
        submitTime: mySub.submitTime.toISOString(),
        note: mySub.note,
        evidenceImages: mySub.evidenceImages.map((e) => ({ id: e.id, url: e.url })),
        review: mySub.review
          ? {
              result: mySub.review.result,
              reason: mySub.review.reason,
              reviewTime: mySub.review.reviewTime.toISOString(),
            }
          : null,
      }
    : null;

  // submissionsForReview — 管理员/部长可见所有提交
  const submissionsForReview = isMgr
    ? task.submissions.map((s) => ({
        id: s.id,
        submitTime: s.submitTime.toISOString(),
        note: s.note,
        user: {
          id: s.user.id,
          displayName: s.user.displayName,
          username: s.user.username,
          avatarUrl: s.user.avatarUrl,
        },
        evidenceImages: s.evidenceImages.map((e) => ({ id: e.id, url: e.url })),
        review: s.review
          ? {
              result: s.review.result,
              reason: s.review.reason,
              reviewTime: s.review.reviewTime.toISOString(),
            }
          : null,
      }))
    : [];

  return NextResponse.json({
    task: taskJson,
    // 计算字段
    allClaimantsApproved,
    slotsOrTaskFull,
    canClaimMore,
    myClaimedSlotIds,
    mySubmission,
    submissionsForReview,
    claimantsBySlot,
    claimedCountBySlot,
    isTimeEnded: timeEnded,
    hasAnyClaim: myActiveClaims.length > 0,
  });
}
