import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

type Params = { id: string };

const ReviewSchema = z.object({
  result: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const submission = await prisma.taskSubmission.findUnique({ where: { id } });
  if (!submission) return NextResponse.json({ message: "提交记录不存在" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = ReviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const review = await prisma.taskReview.upsert({
    where: { submissionId: submission.id },
    create: {
      submissionId: submission.id,
      reviewerId: session.sub,
      result: parsed.data.result,
      reason: parsed.data.reason || null,
      reviewTime: new Date(),
    },
    update: {
      reviewerId: session.sub,
      result: parsed.data.result,
      reason: parsed.data.reason || null,
      reviewTime: new Date(),
    },
  });

  return NextResponse.json({ review });
}

