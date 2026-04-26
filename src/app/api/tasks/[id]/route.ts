import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      publisher: true,
      images: { orderBy: { sort: "asc" } },
      timeSlots: { orderBy: { sort: "asc" } },
      claims: {
        where: { status: "CLAIMED" },
        orderBy: { claimTime: "asc" },
        include: { user: { select: { id: true, displayName: true, username: true } } },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({ task });
}

