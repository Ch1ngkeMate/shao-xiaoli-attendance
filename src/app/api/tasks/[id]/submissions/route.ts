import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

type Params = { id: string };

/** 获取指定任务的提交审核列表（管理员/部长可见全部） */
export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { id: taskId } = await ctx.params;

  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ submissions: [] });
  }

  const submissions = await prisma.taskSubmission.findMany({
    where: { taskId },
    orderBy: { submitTime: "desc" },
    include: {
      user: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
      evidenceImages: { orderBy: { sort: "asc" } },
      review: true,
    },
  });

  return NextResponse.json({
    submissions: submissions.map((s) => ({
      id: s.id,
      submitTime: s.submitTime.toISOString(),
      note: s.note,
      user: s.user,
      evidenceImages: s.evidenceImages.map((e) => ({ id: e.id, url: e.url })),
      review: s.review
        ? {
            result: s.review.result,
            reason: s.review.reason,
            reviewTime: s.review.reviewTime.toISOString(),
          }
        : null,
    })),
  });
}
