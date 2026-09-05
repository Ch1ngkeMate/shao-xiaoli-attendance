import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
type Params = { id: string; assetId: string };
export async function DELETE(_req: Request, ctx: { params: Promise<Params> }) { const session = await readSessionCookie(); if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 }); const { id: taskId, assetId } = await ctx.params; const asset = await prisma.taskOutcomeAsset.findFirst({ where: { id: assetId, outcome: { taskId } }, select: { id: true, uploadedById: true } }); if (!asset) return NextResponse.json({ message: "材料不存在" }, { status: 404 }); const canManage = session.role === "ADMIN" || session.role === "MINISTER"; if (!canManage && asset.uploadedById !== session.sub) return NextResponse.json({ message: "只能删除自己上传的材料" }, { status: 403 }); await prisma.taskOutcomeAsset.delete({ where: { id: asset.id } }); return NextResponse.json({ ok: true }); }
