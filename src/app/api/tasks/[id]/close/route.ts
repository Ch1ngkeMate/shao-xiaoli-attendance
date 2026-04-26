import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { notifyTaskCompletedToApprovedClaimants } from "@/lib/in-app-notify";
import { isAllClaimantsSubmittedAndApproved } from "@/lib/task-all-claimants-state";
import { getTaskTimeBoundsFromSlots } from "@/lib/task-time-bounds";

type Params = { id: string };

const BodySchema = z.object({
  /**
   * `true`：提前结束，任务整体不计入部员月报/考勤；`false`：收工关单，仍计考勤（有提交且已通过的部员按规则统计）
   * 未传时默认 `true`（兼容历史调用，界面应显式传 `false` 收工）
   */
  excludeFromAttendance: z.boolean().optional().default(true),
});

/**
 * 管理人员关单：「收工」传 excludeFromAttendance: false；「提前结束(不计考勤)」传 true
 */
export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const { id: taskId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { timeSlots: { orderBy: { sort: "asc" } } },
  });
  if (!task) return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  if (task.status !== "OPEN") {
    return NextResponse.json({ message: "任务已结束" }, { status: 400 });
  }

  const { end: effectiveEnd } = getTaskTimeBoundsFromSlots({
    startTime: task.startTime,
    endTime: task.endTime,
    timeSlots: task.timeSlots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
  });
  if (Date.now() > effectiveEnd.getTime()) {
    return NextResponse.json(
      { message: "整段进行时间已结束，无法再收工或提前结束" },
      { status: 400 },
    );
  }
  if (await isAllClaimantsSubmittedAndApproved(taskId)) {
    return NextResponse.json(
      { message: "全员已确认完成，请等待关单；无需再收工" },
      { status: 400 },
    );
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "CLOSED",
      excludeFromAttendance: parsed.data.excludeFromAttendance,
    },
  });
  if (!parsed.data.excludeFromAttendance) {
    await notifyTaskCompletedToApprovedClaimants(taskId);
  }
  return NextResponse.json({ task: { id: updated.id, status: updated.status, excludeFromAttendance: updated.excludeFromAttendance } });
}
