import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMonthlyReportStats } from "@/lib/monthly-report";

function toCsvCell(v: string | number) {
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const type = url.searchParams.get("type") || "csv";
  if (!month) return NextResponse.json({ message: "缺少 month 参数" }, { status: 400 });
  if (type !== "csv") return NextResponse.json({ message: "暂只支持 csv" }, { status: 400 });

  const snapshot = await prisma.monthlyReport.findUnique({ where: { month } });
  const stats = snapshot ? (JSON.parse(snapshot.statsJson) as any) : await computeMonthlyReportStats(month);

  const header = [
    "月份",
    "姓名",
    "账号",
    "接取次数(参考)",
    "提交次数",
    "确认完成次数",
    "确认积分合计",
  ];
  const rows = stats.people.map((p: any) => [
    month,
    p.displayName,
    p.username,
    p.claimCount,
    p.submitCount,
    p.approvedCount,
    p.approvedPoints,
  ]);

  const csv = [header, ...rows].map((r) => r.map(toCsvCell).join(",")).join("\n");
  // Windows 版 Excel 直接双击打开 CSV 时，无 BOM 的 UTF-8 常被误判为系统编码导致中文乱码
  const csvUtf8Bom = "\uFEFF" + csv;

  return new NextResponse(csvUtf8Bom, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=\"monthly-report-${month}.csv\"`,
    },
  });
}

