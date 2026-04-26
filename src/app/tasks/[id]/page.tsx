import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isAllClaimantsSubmittedAndApproved } from "@/lib/task-all-claimants-state";
import { isTaskFullForClaim } from "@/lib/slot-claim-availability";
import { readSessionCookie } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import TaskDetailView from "./task-detail-view";

type PageProps = {
  /** Next 各版本对动态段可能为 string 或 string[]，统一归一化 */
  params: Promise<{ id: string } | { id: string[] }>;
};

function normalizeRouteId(p: { id: string } | { id: string[] } | undefined) {
  const raw = p && "id" in p ? p.id : undefined;
  if (raw === undefined) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string" || !s.trim()) return null;
  return s.trim();
}

export default async function TaskDetailPage({ params }: PageProps) {
  const p = await params;
  const id = normalizeRouteId(p);
  if (!id) return notFound();

  const session = await readSessionCookie();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/tasks/${id}`)}`);
  }
  // 旧版 JWT 或异常 cookie 里可能缺 sub，会触发 PrismaClientValidationError（如 userId: undefined）
  if (typeof session.sub !== "string" || !session.sub.trim()) {
    redirect(`/login?next=${encodeURIComponent(`/tasks/${id}`)}`);
  }
  const userId = session.sub.trim();

  const isMgr = session.role === "ADMIN" || session.role === "MINISTER";

  const taskDetailBaseInclude = {
    publisher: true,
    images: { orderBy: { sort: "asc" } },
    claims: {
      where: { status: "CLAIMED" as const },
      orderBy: { claimTime: "asc" as const },
      include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
    },
    submissions: isMgr
      ? {
          orderBy: { submitTime: "desc" },
          include: {
            user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
            evidenceImages: { orderBy: { sort: "asc" } },
            review: true,
          },
        }
      : {
          where: { userId },
          take: 1,
          include: {
            user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
            evidenceImages: { orderBy: { sort: "asc" } },
            review: true,
          },
        },
  } satisfies Prisma.TaskInclude;

  const includeWithSlots = {
    ...taskDetailBaseInclude,
    timeSlots: { orderBy: { sort: "asc" } },
  } satisfies Prisma.TaskInclude;

  type TaskWithSlots = Prisma.TaskGetPayload<{ include: typeof includeWithSlots }>;

  let task: TaskWithSlots;
  try {
    const t = await prisma.task.findUnique({ where: { id }, include: includeWithSlots });
    if (!t) return notFound();
    task = t;
  } catch {
    const t = await prisma.task.findUnique({ where: { id }, include: taskDetailBaseInclude });
    if (!t) return notFound();
    task = { ...t, timeSlots: [] } as TaskWithSlots;
  }

  const shellUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });

  const myClaim = task.claims.find((c) => c.userId === userId) ?? null;
  const claimedCount = task.claims.length;
  const firstSlotId = task.timeSlots[0]?.id ?? null;
  const claimRowsForFull = task.claims
    .filter((c) => c.status === "CLAIMED")
    .map((c) => ({ timeSlotId: c.timeSlotId, status: "CLAIMED" as const }));
  const slotsOrTaskFull = isTaskFullForClaim({
    timeSlots: task.timeSlots.map((s) => ({ id: s.id, headcountHint: s.headcountHint, sort: s.sort })),
    taskHeadcount: task.headcountHint,
    firstSlotId,
    claimRows: claimRowsForFull,
  });

  // 与任务大厅/自动关单一致：人人已提交且均已被通过
  const allClaimantsApproved = await isAllClaimantsSubmittedAndApproved(task.id);

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

  const submissionsForReview =
    session.role === "ADMIN" || session.role === "MINISTER"
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

  return (
    <AppShell
      title="任务详情"
      initialMe={{
        id: userId,
        username: session.username,
        displayName: session.displayName,
        role: session.role,
        avatarUrl: shellUser?.avatarUrl ?? null,
      }}
    >
      <TaskDetailView
        task={{
          id: task.id,
          title: task.title,
          status: task.status,
          startTime: task.startTime.toISOString(),
          endTime: task.endTime.toISOString(),
          timeSlots: task.timeSlots.map((s) => ({
            id: s.id,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
            sort: s.sort,
            headcountHint: s.headcountHint,
          })),
          points: task.points,
          headcountHint: task.headcountHint,
          claimedCount,
          excludeFromAttendance: task.excludeFromAttendance,
          description: task.description,
          publisher: { displayName: task.publisher.displayName },
          images: task.images.map((img) => ({ id: img.id, url: img.url })),
          claimants: task.claims.map((c) => ({
            id: c.userId,
            displayName: c.user.displayName,
            username: c.user.username,
            avatarUrl: c.user.avatarUrl,
          })),
        }}
        allClaimantsApproved={allClaimantsApproved}
        slotsOrTaskFull={slotsOrTaskFull}
        role={session.role}
        claimStatus={myClaim?.status ?? null}
        mySubmission={mySubmission}
        submittedUserIds={isMgr ? task.submissions.map((s) => s.userId) : []}
        submissionsForReview={submissionsForReview}
      />
    </AppShell>
  );
}
