import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

type Params = { id: string };

export async function POST(_req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { id: taskId } = await ctx.params;

  const existed = await prisma.taskClaim.findUnique({
    where: { taskId_userId: { taskId, userId: session.sub } },
  });
  if (!existed) {
    return NextResponse.json({ ok: true });
  }

  await prisma.taskClaim.update({
    where: { taskId_userId: { taskId, userId: session.sub } },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}

