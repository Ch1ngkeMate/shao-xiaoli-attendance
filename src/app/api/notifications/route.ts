import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 兼容未 generate 的 Client：无 inAppMessage 时返回空列表
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inAppMsg() {
  return (prisma as { inAppMessage?: any }).inAppMessage;
}

export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const m = inAppMsg();
  if (!m?.findMany) {
    return NextResponse.json({ list: [], unreadCount: 0, _hint: "请执行 npx prisma generate 与数据库迁移" });
  }
  try {
    const list = await m.findMany({
      where: { toUserId: session.sub },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const unread = list.filter((x: { read: boolean }) => !x.read).length;
    return NextResponse.json({ list, unreadCount: unread });
  } catch (e) {
    void console.error("[notifications] GET", e);
    // 不返回 5xx，避免前端整页反复 toast；列表为空
    return NextResponse.json({ list: [], unreadCount: 0 });
  }
}

export async function PATCH(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const m = inAppMsg();
  if (!m?.updateMany) {
    return NextResponse.json({ message: "服务未就绪，请 npx prisma generate" }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: string; markAll?: boolean };
  if (body.markAll) {
    await m.updateMany({
      where: { toUserId: session.sub, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }
  if (!body.id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });
  await m.updateMany({
    where: { id: body.id, toUserId: session.sub },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
