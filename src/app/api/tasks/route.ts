import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { batchAllClaimantsSubmittedAndApproved } from "@/lib/task-all-claimants-state";
import { readSessionCookie } from "@/lib/auth";
import { isTaskFullForClaim } from "@/lib/slot-claim-availability";

const CreateTaskSchema = z
  .object({
    title: z.string().min(1, "任务标题不能为空"),
    description: z.string().optional(),
    /** 至少一个时间段；与 startTime/endTime 二选一 */
    timeSlots: z
      .array(
        z.object({
          startTime: z.string().min(1),
          endTime: z.string().min(1),
          /** 本段人数上限，不填/0=不限制 */
          headcountHint: z.number().int().min(0).optional(),
        }),
      )
      .min(1, "请至少设置一个时间段")
      .optional(),
    startTime: z.string().min(1).optional(),
    endTime: z.string().min(1).optional(),
    points: z.number().int().min(0, "积分不能为负数"),
    headcountHint: z.number().int().min(0).optional(),
    imageUrls: z.array(z.string().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.timeSlots && data.timeSlots.length > 0) {
      for (const [i, s] of data.timeSlots.entries()) {
        const a = new Date(s.startTime);
        const b = new Date(s.endTime);
        if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
          ctx.addIssue({ code: "custom", message: `第 ${i + 1} 段起止时间格式错误`, path: ["timeSlots", i, "endTime"] });
        } else if (b.getTime() < a.getTime()) {
          ctx.addIssue({ code: "custom", message: `第 ${i + 1} 段结束时间不能早于开始时间`, path: ["timeSlots", i, "endTime"] });
        }
      }
      return;
    }
    if (!data.startTime || !data.endTime) {
      ctx.addIssue({ code: "custom", message: "请设置时间段，或提供开始/结束时间" });
    }
  });

/** 与 Task 一对多，旧库无 TaskTimeSlot 表时需降级，避免整表 GET 直接 500 */
const taskIncludeWithSlots = {
  publisher: true,
  images: { orderBy: { sort: "asc" } as const },
  timeSlots: { orderBy: { sort: "asc" } as const },
} as const;

const taskIncludeWithoutSlots = {
  publisher: true,
  images: { orderBy: { sort: "asc" } as const },
} as const;

export async function GET() {
  let tasks: Awaited<ReturnType<typeof prisma.task.findMany>>;
  try {
    tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      include: taskIncludeWithSlots,
      take: 200,
    });
  } catch {
    tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      include: taskIncludeWithoutSlots,
      take: 200,
    });
    // 旧库无子表，前端按空数组处理
    tasks = tasks.map((t) => ({ ...t, timeSlots: [] }));
  }
  if (tasks.length === 0) {
    return NextResponse.json({ tasks: [] });
  }
  const taskIds = tasks.map((t) => t.id);
  const grouped = await prisma.taskClaim.groupBy({
    by: ["taskId"],
    where: {
      taskId: { in: taskIds },
      status: "CLAIMED",
    },
    _count: { _all: true },
  });
  const byTask = new Map(grouped.map((g) => [g.taskId, g._count._all]));
  const claimRows = await prisma.taskClaim.findMany({
    where: { taskId: { in: taskIds }, status: "CLAIMED" },
    orderBy: { claimTime: "asc" },
    include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
  });
  const claimantsByTask = new Map<
    string,
    { id: string; displayName: string; username: string; avatarUrl: string | null }[]
  >();
  const claimsStateByTask = new Map<string, { timeSlotId: string | null; status: "CLAIMED" }[]>();
  for (const c of claimRows) {
    const arr = claimantsByTask.get(c.taskId) ?? [];
    if (!arr.some((x) => x.id === c.user.id)) {
      arr.push({
        id: c.user.id,
        displayName: c.user.displayName,
        username: c.user.username,
        avatarUrl: c.user.avatarUrl,
      });
    }
    claimantsByTask.set(c.taskId, arr);
    const cr = claimsStateByTask.get(c.taskId) ?? [];
    cr.push({ timeSlotId: c.timeSlotId, status: "CLAIMED" });
    claimsStateByTask.set(c.taskId, cr);
  }
  const approvedMap = await batchAllClaimantsSubmittedAndApproved(taskIds);
  const tasksWithCount = tasks.map((t) => {
    const slots = "timeSlots" in t && Array.isArray(t.timeSlots) ? t.timeSlots : [];
    const firstId = slots[0]?.id ?? null;
    const full = isTaskFullForClaim({
      timeSlots: (slots as { id: string; headcountHint: number | null; sort: number }[]).map((s) => ({
        id: s.id,
        headcountHint: s.headcountHint ?? null,
        sort: s.sort,
      })),
      taskHeadcount: t.headcountHint,
      firstSlotId: firstId,
      claimRows: claimsStateByTask.get(t.id) ?? [],
    });
    return {
      ...t,
      claimedCount: byTask.get(t.id) ?? 0,
      claimants: claimantsByTask.get(t.id) ?? [],
      allClaimantsApproved: approvedMap.get(t.id) ?? false,
      slotsOrTaskFull: full,
    };
  });
  return NextResponse.json({ tasks: tasksWithCount });
}

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = CreateTaskSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const { title, description, timeSlots, startTime, endTime, points, headcountHint, imageUrls } =
    parsed.data;

  let start: Date;
  let end: Date;
  const slotRows: { startTime: Date; endTime: Date; sort: number; headcountHint: number | null }[] = [];

  if (timeSlots && timeSlots.length > 0) {
    for (const [i, s] of timeSlots.entries()) {
      const a = new Date(s.startTime);
      const b = new Date(s.endTime);
      const hc = s.headcountHint && s.headcountHint > 0 ? s.headcountHint : null;
      slotRows.push({ startTime: a, endTime: b, sort: i, headcountHint: hc });
    }
    const tStarts = slotRows.map((r) => r.startTime.getTime());
    const tEnds = slotRows.map((r) => r.endTime.getTime());
    start = new Date(Math.min(...tStarts));
    end = new Date(Math.max(...tEnds));
  } else {
    const s0 = new Date(startTime!);
    const e0 = new Date(endTime!);
    if (Number.isNaN(s0.getTime()) || Number.isNaN(e0.getTime())) {
      return NextResponse.json({ message: "时间格式错误" }, { status: 400 });
    }
    if (e0.getTime() < s0.getTime()) {
      return NextResponse.json({ message: "结束时间不能早于开始时间" }, { status: 400 });
    }
    start = s0;
    end = e0;
    const hc0 = headcountHint && headcountHint > 0 ? headcountHint : null;
    slotRows.push({ startTime: s0, endTime: e0, sort: 0, headcountHint: hc0 });
  }

  const perSlot = timeSlots && timeSlots.length > 0;
  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      startTime: start,
      endTime: end,
      points,
      // 多段时每段在 timeSlots.headcountHint，任务级可留空
      headcountHint: perSlot ? null : (headcountHint && headcountHint > 0 ? headcountHint : null),
      excludeFromAttendance: false,
      publisherId: session.sub,
      timeSlots: {
        create: slotRows.map((r) => ({
          startTime: r.startTime,
          endTime: r.endTime,
          sort: r.sort,
          headcountHint: r.headcountHint,
        })),
      },
      images: {
        create:
          imageUrls?.map((url, idx) => ({
            url,
            sort: idx,
          })) ?? [],
      },
    },
    include: { images: true, timeSlots: { orderBy: { sort: "asc" } } },
  });

  return NextResponse.json({ task });
}

