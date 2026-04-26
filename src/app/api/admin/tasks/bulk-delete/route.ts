import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * 批量删除任务及关联接取/提交/审核/图片/时间段（仅管理员，不可恢复）
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
      { message: parsed.error.issues[0]?.message ?? "请传入 ids 数组（1～100 条）" },
      { status: 400 },
    );
  }

  const result = await prisma.task.deleteMany({
    where: { id: { in: parsed.data.ids } },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
