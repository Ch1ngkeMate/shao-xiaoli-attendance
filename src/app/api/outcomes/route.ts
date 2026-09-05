import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

/** 全员可见的成果总目录；搜索交由前端对名称、任务、提交人和说明执行。 */
export async function GET() {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const outcomes = await prisma.taskOutcome.findMany({ orderBy: { createdAt: "desc" }, include: { task: { select: { id: true, title: true, status: true } }, updatedBy: { select: { id: true, displayName: true } }, assets: { select: { id: true, kind: true } } } });
  return NextResponse.json({ outcomes: outcomes.map((o) => ({ id: o.id, title: o.title, submittedAt: o.createdAt.toISOString(), summary: o.summary, task: o.task, updatedBy: o.updatedBy, assetCount: o.assets.length, types: [...new Set(o.assets.map((a) => a.kind))] })) });
}
