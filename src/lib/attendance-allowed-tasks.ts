import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 仅这些 taskId 计入月报/考勤。
 * 当本地 Prisma/数据库尚无 `Task.excludeFromAttendance` 时，会退回为「全选任务 id」以免接口 500
 */
export async function getAttendingTaskIds(): Promise<Set<string>> {
  try {
    const rows = await prisma.task.findMany({
      where: { excludeFromAttendance: false },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  } catch (e) {
    const isUnknownField =
      e instanceof Prisma.PrismaClientValidationError ||
      (e instanceof Error && e.message?.includes("excludeFromAttendance")) ||
      (e instanceof Error && e.message?.includes("Unknown argument"));
    if (isUnknownField) {
      const all = await prisma.task.findMany({ select: { id: true } });
      return new Set(all.map((r) => r.id));
    }
    throw e;
  }
}
