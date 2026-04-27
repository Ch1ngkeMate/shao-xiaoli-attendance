import { NextResponse } from "next/server";
import { runTaskStallNotifications } from "@/lib/task-stall-notify";

/**
 * 计划任务调用：在环境变量 CRON_SECRET 非空时，请求头需携带
 * `Authorization: Bearer <CRON_SECRET>` 或 `x-cron-secret: <CRON_SECRET>`
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ message: "未配置 CRON_SECRET，拒绝执行" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  const token =
    auth?.startsWith("Bearer ") ? auth.slice(7).trim() : headerSecret?.trim() ?? "";
  if (token !== secret) {
    return NextResponse.json({ message: "无权限" }, { status: 401 });
  }

  try {
    const { notifiedTasks } = await runTaskStallNotifications();
    return NextResponse.json({ ok: true, notifiedTasks });
  } catch (e) {
    void console.error("[cron/task-stall-notify]", e);
    return NextResponse.json({ message: "执行失败" }, { status: 500 });
  }
}
