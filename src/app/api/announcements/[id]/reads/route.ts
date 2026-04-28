"use server";

import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const p = await ctx.params;
  const id = normalizeId(p?.id);
  if (!id) return NextResponse.json({ message: "缺少 id" }, { status: 400 });

  const m = inAppMsg();
  if (!m?.findMany) {
    return NextResponse.json({ list: [], _hint: "请执行 prisma migrate deploy + prisma generate" });
  }

  const rows = await m.findMany({
    where: { announcementId: id },
    orderBy: { createdAt: "asc" },
    include: { toUser: { select: { id: true, displayName: true, username: true, avatarUrl: true, role: true } } },
    take: 5000,
  });

  const readUsers = rows.filter((r: { read: boolean }) => r.read).map((r: any) => r.toUser);
  const unreadUsers = rows.filter((r: { read: boolean }) => !r.read).map((r: any) => r.toUser);

  return NextResponse.json({
    readCount: readUsers.length,
    unreadCount: unreadUsers.length,
    readUsers,
    unreadUsers,
  });
}

