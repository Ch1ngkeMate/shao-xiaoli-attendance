import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inAppMsg() {
  return (prisma as { inAppMessage?: any }).inAppMessage;
}

type Params = { id: string };

/** 获取单条消息详情（兼容旧公告：无 announcementId 也可查看正文） */
export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const m = inAppMsg();
  if (!m?.findFirst || !m?.updateMany) {
    return NextResponse.json({ message: "服务未就绪：请执行 prisma migrate deploy + prisma generate" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const msg = await m.findFirst({
    where: { id, toUserId: session.sub },
  });
  if (!msg) return NextResponse.json({ message: "不存在" }, { status: 404 });

  if (!msg.read) {
    await m.updateMany({ where: { id, toUserId: session.sub }, data: { read: true } });
  }

  return NextResponse.json({ messageItem: msg });
}

