import { NextResponse } from "next/server";
import { z } from "zod";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  title: z.string().min(1, "请填写标题").max(200),
  body: z.string().min(1, "请填写正文").max(8000),
  popupEnabled: z.boolean().optional(),
  popupDays: z.number().int().min(0).max(365).optional(),
});

/** 部长/管理员向全体在册用户发布站内公告（每人一条 InAppMessage，未读在侧栏显示红点） */
export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "标题与正文需填写（标题≤200 字、正文≤8000 字）" }, { status: 400 });
  }
  const { title, body: text, popupEnabled, popupDays } = parsed.data;

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  if (users.length === 0) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (prisma as { inAppMessage?: { createMany: (a: any) => Promise<{ count: number }> } }).inAppMessage;
  if (!m?.createMany) {
    return NextResponse.json(
      { message: "服务未就绪：请在本机执行 npx prisma generate 与 npx prisma db push" },
      { status: 503 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ann = (prisma as { announcement?: { create: (a: any) => Promise<{ id: string }> } }).announcement;
  if (!Ann?.create) {
    return NextResponse.json(
      { message: "服务未就绪：请在部署机执行 prisma migrate deploy + prisma generate" },
      { status: 503 },
    );
  }

  const ann = await Ann.create({
    data: {
      title,
      body: text,
      popupEnabled: popupEnabled ?? false,
      popupDays: popupEnabled ? (popupDays ?? 0) : 0,
      createdById: session.sub,
    },
  });

  const { count } = await m.createMany({
    data: users.map((u) => ({
      toUserId: u.id,
      type: "ANNOUNCEMENT",
      title,
      body: text,
      read: false,
      announcementId: ann.id,
    })),
  });

  return NextResponse.json({ ok: true, created: count, announcementId: ann.id });
}
