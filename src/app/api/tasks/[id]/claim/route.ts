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
  // 发布后即可接取，无需等到各段开始时间
  if (new Date().getTime() > tEnd.getTime()) {
    return NextResponse.json({ message: "任务已结束，无法接取" }, { status: 400 });
  }

  const slots = task.timeSlots;
  const firstId = slots[0]?.id ?? null;
  const claimRows = await prisma.taskClaim.findMany({ where: { taskId, status: "CLAIMED" } });
  const self = await prisma.taskClaim.findUnique({
    where: { taskId_userId: { taskId, userId: session.sub } },
  });

  let targetSlotId: string | null = self?.timeSlotId ?? null;

  if (slots.length > 0) {
    if (slots.length > 1) {
      const pick = parsed.data.timeSlotId;
      if (!self && !pick) {
        return NextResponse.json({ message: "该任务有多个时段，请指定要接取的时间段" }, { status: 400 });
      }
      if (!self) {
        const sl = slots.find((s) => s.id === pick);
        if (!sl) {
          return NextResponse.json({ message: "无效的时间段" }, { status: 400 });
        }
        if (!slotCanAccept(firstId, sl, claimRows)) {
          return NextResponse.json({ message: "该时段接取人数已满" }, { status: 400 });
        }
        targetSlotId = sl.id;
      }
    } else {
      const sl = slots[0]!;
      if (!self && !slotCanAccept(firstId, sl, claimRows)) {
        return NextResponse.json({ message: "接取人数已满" }, { status: 400 });
      }
      if (!self) targetSlotId = sl.id;
    }
  } else if (!self && task.headcountHint != null && task.headcountHint > 0) {
    const n = await prisma.taskClaim.count({ where: { taskId, status: "CLAIMED" } });
    if (n >= task.headcountHint) {
      return NextResponse.json({ message: "接取人数已满" }, { status: 400 });
    }
  }

  const claim = await prisma.taskClaim.upsert({
    where: { taskId_userId: { taskId, userId: session.sub } },
    create: { taskId, userId: session.sub, status: "CLAIMED", timeSlotId: targetSlotId },
    update: { status: "CLAIMED", claimTime: new Date(), timeSlotId: targetSlotId },
  });

  return NextResponse.json({ claim });
}
