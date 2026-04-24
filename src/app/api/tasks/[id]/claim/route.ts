import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

type Params = { id: string };

export async function POST(_req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { id: taskId } = await ctx.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  if (task.status !== "OPEN") return NextResponse.json({ message: "任务已关闭" }, { status: 400 });

  const now = new Date();
  if (now.getTime() > task.endTime.getTime()) {
    return NextResponse.json({ message: "任务已结束，无法接取" }, { status: 400 });
  }

  const selfClaim = await prisma.taskClaim.findUnique({
    where: { taskId_userId: { taskId, userId: session.sub } },
  });
  if (!selfClaim && task.headcountHint != null && task.headcountHint > 0) {
    const n = await prisma.taskClaim.count({ where: { taskId, status: "CLAIMED" } });
    if (n >= task.headcountHint) {
      return NextResponse.json({ message: "接取人数已满" }, { status: 400 });
    }
  }

  const claim = await prisma.taskClaim.upsert({
    where: { taskId_userId: { taskId, userId: session.sub } },
    create: { taskId, userId: session.sub, status: "CLAIMED" },
    update: { status: "CLAIMED", claimTime: new Date() },
  });

  return NextResponse.json({ claim });
}

