"use server";

import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementModel() {
  return (prisma as { announcement?: any }).announcement;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementImageModel() {
  return (prisma as { announcementImage?: any }).announcementImage;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inAppMsg() {
  return (prisma as { inAppMessage?: any }).inAppMessage;
}

type Params = { id: string | string[] };

function normalizeId(id: string | string[] | undefined) {
  const s = Array.isArray(id) ? id[0] : id;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const p = await ctx.params;
  const id = normalizeId(p?.id);
  if (!id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });

  const Ann = announcementModel();
  const Img = announcementImageModel();
  if (!Ann?.findUnique || !Img?.findMany) {
    return NextResponse.json({ message: "服务未就绪：请执行 prisma migrate deploy + prisma generate" }, { status: 503 });
  }

  const a = await Ann.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ message: "不存在" }, { status: 404 });

  const images = await Img.findMany({ where: { announcementId: id }, orderBy: { sort: "asc" }, take: 50 });

  // 访问详情即视为“读过”该公告：将本人对应公告消息标为已读（若存在）
  const m = inAppMsg();
  if (m?.updateMany) {
    await m.updateMany({
      where: { toUserId: session.sub, announcementId: id },
      data: { read: true },
    });
  }

  return NextResponse.json({
    announcement: {
      id: a.id,
      title: a.title,
      body: a.body,
      createdAt: a.createdAt,
      popupEnabled: !!a.popupEnabled,
      popupDays: Number(a.popupDays ?? 0),
      images: images.map((i: { id: string; url: string; sort: number }) => ({ id: i.id, url: i.url, sort: i.sort })),
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const p = await ctx.params;
  const id = normalizeId(p?.id);
  if (!id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });

  const Ann = announcementModel();
  if (!Ann?.update) {
    return NextResponse.json({ message: "服务未就绪：请执行 prisma migrate deploy + prisma generate" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { popupEnabled?: boolean; popupDays?: number };
  const popupEnabled = typeof body.popupEnabled === "boolean" ? body.popupEnabled : undefined;
  const popupDays = typeof body.popupDays === "number" ? Math.max(0, Math.floor(body.popupDays)) : undefined;

  const updated = await Ann.update({
    where: { id },
    data: {
      ...(popupEnabled != null ? { popupEnabled } : {}),
      ...(popupDays != null ? { popupDays } : {}),
    },
  });

  return NextResponse.json({ ok: true, announcement: updated });
}

