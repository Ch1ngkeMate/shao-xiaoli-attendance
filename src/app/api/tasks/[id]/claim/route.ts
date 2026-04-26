import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { getTaskTimeBoundsFromSlots } from "@/lib/task-time-bounds";
import { slotCanAccept } from "@/lib/slot-claim-availability";

type Params = { id: string };

const BodySchema = z.object({
  timeSlotId: z.string().optional(),
});

/** 与 claimsForSlot 一致：旧数据 timeSlotId 空时视为第一段 */
function effectiveSlotId(timeSlotId: string | null, firstSlotId: string | null): string | null {
  return timeSlotId ?? firstSlotId;
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { id: taskId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { timeSlots: { orderBy: { sort: "asc" } } },
  });
  if (!task) return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  if (task.status !== "OPEN") return NextResponse.json({ message: "任务已结束" }, { status: 400 });

  const { end: tEnd } = getTaskTimeBoundsFromSlots(task);
  if (new Date().getTime() > tEnd.getTime()) {
    return NextResponse.json({ message: "任务已结束，无法接取" }, { status: 400 });
  }

  const slots = task.timeSlots;
  const firstId = slots[0]?.id ?? null;
  const claimRows = await prisma.taskClaim.findMany({ where: { taskId, status: "CLAIMED" } });
  const myActive = await prisma.taskClaim.findMany({
    where: { taskId, userId: session.sub, status: "CLAIMED" },
  });

  const userId = session.sub;

  // —— 多时段：每段独立一条接取，同一用户可接多段 ——
  if (slots.length > 1) {
    const pick = parsed.data.timeSlotId;
    if (!pick) {
      return NextResponse.json({ message: "该任务有多个时段，请指定要接取的时间段" }, { status: 400 });
    }
    const sl = slots.find((s) => s.id === pick);
    if (!sl) {
      return NextResponse.json({ message: "无效的时间段" }, { status: 400 });
    }
    const already = myActive.some((c) => effectiveSlotId(c.timeSlotId, firstId) === sl.id);
    if (already) {
      return NextResponse.json({ message: "您已接取该时段" }, { status: 400 });
    }
    if (!slotCanAccept(firstId, sl, claimRows)) {
      return NextResponse.json({ message: "该时段接取人数已满" }, { status: 400 });
    }
    const revived = await prisma.taskClaim.findFirst({
      where: { taskId, userId, timeSlotId: sl.id, status: "CANCELLED" },
    });
    const claim = revived
      ? await prisma.taskClaim.update({
          where: { id: revived.id },
          data: { status: "CLAIMED", claimTime: new Date() },
        })
      : await prisma.taskClaim.create({
          data: { taskId, userId, status: "CLAIMED", timeSlotId: sl.id },
        });
    return NextResponse.json({ claim });
  }

  // —— 单时段（库里有且仅一段）——
  if (slots.length === 1) {
    const sl = slots[0]!;
    if (myActive.length > 0) {
      return NextResponse.json({ message: "您已接取本任务" }, { status: 400 });
    }
    if (!slotCanAccept(firstId, sl, claimRows)) {
      return NextResponse.json({ message: "接取人数已满" }, { status: 400 });
    }
    const revived = await prisma.taskClaim.findFirst({
      where: {
        taskId,
        userId,
        OR: [{ timeSlotId: sl.id }, { timeSlotId: null }],
        status: "CANCELLED",
      },
    });
    const claim = revived
      ? await prisma.taskClaim.update({
          where: { id: revived.id },
          data: { status: "CLAIMED", claimTime: new Date(), timeSlotId: sl.id },
        })
      : await prisma.taskClaim.create({
          data: { taskId, userId, status: "CLAIMED", timeSlotId: sl.id },
        });
    return NextResponse.json({ claim });
  }

  // —— 无时段表：任务级名额，每用户至多一条 ——
  if (myActive.length > 0) {
    return NextResponse.json({ message: "您已接取本任务" }, { status: 400 });
  }
  if (task.headcountHint != null && task.headcountHint > 0) {
    const n = await prisma.taskClaim.count({ where: { taskId, status: "CLAIMED" } });
    if (n >= task.headcountHint) {
      return NextResponse.json({ message: "接取人数已满" }, { status: 400 });
    }
  }
  const revived = await prisma.taskClaim.findFirst({
    where: { taskId, userId, timeSlotId: null, status: "CANCELLED" },
  });
  const claim = revived
    ? await prisma.taskClaim.update({
        where: { id: revived.id },
        data: { status: "CLAIMED", claimTime: new Date() },
      })
    : await prisma.taskClaim.create({
        data: { taskId, userId, status: "CLAIMED", timeSlotId: null },
      });
  return NextResponse.json({ claim });
}
