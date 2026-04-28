"use server";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

// 兼容未 generate 的 Client：无 announcement 时返回空
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementModel() {
  return (prisma as { announcement?: any }).announcement;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementPopupShownModel() {
  return (prisma as { announcementPopupShown?: any }).announcementPopupShown;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementImageModel() {
  return (prisma as { announcementImage?: any }).announcementImage;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const Ann = announcementModel();
  const Shown = announcementPopupShownModel();
  const Img = announcementImageModel();
  if (!Ann?.findMany || !Shown?.create || !Img?.findMany) {
    return NextResponse.json({ announcement: null, _hint: "请在部署机执行 prisma migrate deploy + prisma generate" });
  }

  const day = todayYmd();
  const now = new Date();

  // 找到最近一条“可弹窗且未过期”的公告
  const candidates = await Ann.findMany({
    where: { popupEnabled: true, popupDays: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const a of candidates) {
    const createdAt = new Date(a.createdAt);
    const until = new Date(createdAt.getTime() + Number(a.popupDays) * 24 * 60 * 60 * 1000);
    if (now.getTime() > until.getTime()) continue;

    // 幂等：同一用户同一日同一公告只弹一次
    try {
      await Shown.create({
        data: {
          announcementId: a.id,
          userId: session.sub,
          day,
        },
      });
    } catch {
      // unique 冲突：说明今天已弹过
      continue;
    }

    const images = await Img.findMany({
      where: { announcementId: a.id },
      orderBy: { sort: "asc" },
      take: 20,
    });

    return NextResponse.json({
      announcement: {
        id: a.id,
        title: a.title,
        body: a.body,
        createdAt: a.createdAt,
        images: images.map((i: { id: string; url: string }) => ({ id: i.id, url: i.url })),
      },
    });
  }

  return NextResponse.json({ announcement: null });
}

