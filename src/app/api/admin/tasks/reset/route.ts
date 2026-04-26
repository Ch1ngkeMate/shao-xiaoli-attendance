import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

const BodySchema = z.object({
  confirm: z.literal("DELETE_ALL_TASKS"),
});

/**
 * 清空所有任务及关联接取/提交/审核/图片/时间段（仅超级管理员，不可恢复）
 */
export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "请在确认框输入指令：请在请求体中传入 { \"confirm\": \"DELETE_ALL_TASKS\" }" },
      { status: 400 },
    );
  }

  const deleted = await prisma.task.deleteMany({});

  return NextResponse.json({ message: "任务库已清空", deleted: deleted.count });
}
