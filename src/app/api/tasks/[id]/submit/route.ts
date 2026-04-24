import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

type Params = { id: string };

const SubmitSchema = z.object({
  note: z.string().optional(),
  evidenceUrls: z.array(z.string().min(1)).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { id: taskId } = await ctx.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ message: "任务不存在" }, { status: 404 });

  const claim = await prisma.taskClaim.findUnique({
    where: { taskId_userId: { taskId, userId: session.sub } },
  });
  if (!claim || claim.status !== "CLAIMED") {
    return NextResponse.json({ message: "请先接取任务再提交完成" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const { note, evidenceUrls } = parsed.data;

  const submission = await prisma.taskSubmission.upsert({
    where: { taskId_userId: { taskId, userId: session.sub } },
    create: {
      taskId,
      userId: session.sub,
      note: note || null,
      submitTime: new Date(),
      evidenceImages: {
        create:
          evidenceUrls?.map((url, idx) => ({
            url,
            sort: idx,
          })) ?? [],
      },
    },
    update: {
      note: note || null,
      submitTime: new Date(),
    },
    include: { review: true },
  });

  // 重新提交时：清空旧的凭证与审核结果
  await prisma.evidenceImage.deleteMany({ where: { submissionId: submission.id } });
  await prisma.evidenceImage.createMany({
    data:
      evidenceUrls?.map((url, idx) => ({
        submissionId: submission.id,
        url,
        sort: idx,
      })) ?? [],
  });
  await prisma.taskReview.deleteMany({ where: { submissionId: submission.id } });

  return NextResponse.json({ submissionId: submission.id });
}

