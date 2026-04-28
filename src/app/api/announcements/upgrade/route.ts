import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inAppMsg() {
  return (prisma as { inAppMessage?: any }).inAppMessage;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function annModel() {
  return (prisma as { announcement?: any }).announcement;
}

/**
 * 将“旧公告消息”（仅 InAppMessage，没有 Announcement 实体）升级为 Announcement，
 * 以支持图片与已读统计聚合。
 */
export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { messageId?: string };
  const messageId = String(body?.messageId ?? "").trim();
  if (!messageId) return NextResponse.json({ message: "缺少 messageId" }, { status: 400 });

  const m = inAppMsg();
  const a = annModel();
  if (!m?.findUnique || !m?.findMany || !m?.updateMany || !a?.create) {
    return NextResponse.json({ message: "服务端未就绪", _hint: "请执行 prisma migrate deploy + prisma generate" }, { status: 500 });
  }

  const msg = await m.findUnique({ where: { id: messageId } });
  if (!msg) return NextResponse.json({ message: "消息不存在" }, { status: 404 });
  if (msg.type !== "ANNOUNCEMENT") return NextResponse.json({ message: "该消息不是公告" }, { status: 400 });
  if (msg.announcementId) return NextResponse.json({ announcementId: msg.announcementId, upgraded: false });

  const title = String(msg.title ?? "").trim();
  const bodyText = String(msg.body ?? "");
  const createdAt = msg.createdAt ? new Date(msg.createdAt) : new Date();

  // 批量广播创建时 createdAt 可能有细微差异：用标题+正文+时间窗口做聚合
  const from = new Date(createdAt.getTime() - 60_000);
  const to = new Date(createdAt.getTime() + 60_000);

  const siblings = await m.findMany({
    where: {
      type: "ANNOUNCEMENT",
      title,
      body: bodyText,
      createdAt: { gte: from, lte: to },
      announcementId: null,
    },
    select: { id: true },
    take: 10000,
  });

  const announcement = await a.create({
    data: {
      title,
      body: bodyText,
      popupEnabled: false,
      popupDays: 0,
      createdById: session.sub,
      // createdAt 用默认 now()，不强行回写，避免跨库兼容问题
    },
    select: { id: true },
  });

  await m.updateMany({
    where: { id: { in: siblings.map((x: { id: string }) => x.id) } },
    data: { announcementId: announcement.id },
  });

  return NextResponse.json({
    announcementId: announcement.id,
    upgraded: true,
    affected: siblings.length,
  });
}

