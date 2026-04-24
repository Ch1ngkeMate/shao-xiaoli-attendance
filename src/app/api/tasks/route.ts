import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

const CreateTaskSchema = z.object({
  title: z.string().min(1, "任务标题不能为空"),
  description: z.string().optional(),
  startTime: z.string().min(1, "开始时间不能为空"),
  endTime: z.string().min(1, "结束时间不能为空"),
  points: z.number().int().min(0, "积分不能为负数"),
  headcountHint: z.number().int().min(0).optional(),
  imageUrls: z.array(z.string().min(1)).optional(),
});

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      publisher: true,
      images: { orderBy: { sort: "asc" } },
    },
    take: 200,
  });
  return NextResponse.json({ tasks });
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

  const { title, description, startTime, endTime, points, headcountHint, imageUrls } =
    parsed.data;

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ message: "时间格式错误" }, { status: 400 });
  }
  if (end.getTime() < start.getTime()) {
    return NextResponse.json({ message: "结束时间不能早于开始时间" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      startTime: start,
      endTime: end,
      points,
      headcountHint: headcountHint ?? null,
      publisherId: session.sub,
      images: {
        create:
          imageUrls?.map((url, idx) => ({
            url,
            sort: idx,
          })) ?? [],
      },
    },
    include: { images: true },
  });

  return NextResponse.json({ task });
}

