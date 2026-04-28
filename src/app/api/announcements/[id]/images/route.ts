"use server";

import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementImageModel() {
  return (prisma as { announcementImage?: any }).announcementImage;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementModel() {
  return (prisma as { announcement?: any }).announcement;
}

type Params = { id: string | string[] };
function normalizeId(id: string | string[] | undefined) {
  const s = Array.isArray(id) ? id[0] : id;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const p = await ctx.params;
  const id = normalizeId(p?.id);
  if (!id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });

  const Ann = announcementModel();
  const Img = announcementImageModel();
  if (!Ann?.findUnique || !Img?.create) {
    return NextResponse.json({ message: "服务未就绪：请执行 prisma migrate deploy + prisma generate" }, { status: 503 });
  }

  const a = await Ann.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ message: "不存在" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = (body.url ?? "").trim();
  if (!url) return NextResponse.json({ message: "缺少 url" }, { status: 400 });

  // 取当前最大 sort + 1
  const existing = await Img.findMany({ where: { announcementId: id }, orderBy: { sort: "desc" }, take: 1 });
  const nextSort = existing.length > 0 ? Number(existing[0].sort ?? 0) + 1 : 0;
  const img = await Img.create({ data: { announcementId: id, url, sort: nextSort } });
  return NextResponse.json({ ok: true, image: img });
}

export async function DELETE(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const p = await ctx.params;
  const id = normalizeId(p?.id);
  if (!id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });

  const Img = announcementImageModel();
  if (!Img?.deleteMany) {
    return NextResponse.json({ message: "服务未就绪：请执行 prisma migrate deploy + prisma generate" }, { status: 503 });
  }

  const url = new URL(req.url);
  const imageId = url.searchParams.get("imageId")?.trim();
  if (!imageId) return NextResponse.json({ message: "缺少 imageId" }, { status: 400 });

  await Img.deleteMany({ where: { id: imageId, announcementId: id } });
  return NextResponse.json({ ok: true });
}

