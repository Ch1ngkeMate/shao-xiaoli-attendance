import { NextResponse } from "next/server";
import dayjs from "dayjs";
import { z } from "zod";
import { readSessionCookie } from "@/lib/auth";
import { buildAttendanceRangeExcelBuffer } from "@/lib/build-attendance-range-excel";
import { computeAttendanceRangePeopleStats, fetchRangeTaskAndAbsenceRows } from "@/lib/attendance-range-stats";

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from 应为 YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to 应为 YYYY-MM-DD"),
});

const MAX_RANGE_DAYS = 400;

/**
 * 自选时间段导出考勤 Excel（双表：任务+旷会红字、人员积分）
 */
export async function GET(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "请传入 from、to（YYYY-MM-DD）" },
      { status: 400 },
    );
  }

  const start = dayjs(parsed.data.from).startOf("day").toDate();
  const end = dayjs(parsed.data.to).endOf("day").toDate();
  if (dayjs(end).isBefore(dayjs(start))) {
    return NextResponse.json({ message: "结束日期不能早于开始日期" }, { status: 400 });
  }
  if (dayjs(end).diff(dayjs(start), "day") > MAX_RANGE_DAYS) {
    return NextResponse.json({ message: `时间跨度不能超过 ${MAX_RANGE_DAYS} 天` }, { status: 400 });
  }

  const rangeTitle = `${parsed.data.from} ~ ${parsed.data.to}`;

  const [people, { tasks, absences }] = await Promise.all([
    computeAttendanceRangePeopleStats(start, end),
    fetchRangeTaskAndAbsenceRows(start, end),
  ]);

  const buf = await buildAttendanceRangeExcelBuffer({
    rangeTitle,
    tasks,
    absences,
    people,
  });

  const filename = `考勤导出-${parsed.data.from}_${parsed.data.to}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
