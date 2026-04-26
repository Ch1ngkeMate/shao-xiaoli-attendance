import ExcelJS from "exceljs";
import dayjs from "dayjs";
import type { RangeAbsenceRow, RangePersonRow, RangeTaskRow } from "@/lib/attendance-range-stats";

const RED_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFFF0000" } };

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" },
};

function fmt(dt: Date) {
  return dayjs(dt).format("YYYY-MM-DD HH:mm");
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true };
  });
}

/**
 * 双表 xlsx：表一任务 + 例会旷会（红字）；表二人员考勤积分（与月报同口径、按日区间）
 */
export async function buildAttendanceRangeExcelBuffer(params: {
  rangeTitle: string;
  tasks: RangeTaskRow[];
  absences: RangeAbsenceRow[];
  people: RangePersonRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "邵小利考勤";

  const s1 = wb.addWorksheet("表一", { views: [{ state: "frozen", ySplit: 3 }] });
  s1.columns = [
    { width: 12 },
    { width: 44 },
    { width: 18 },
    { width: 18 },
    { width: 36 },
    { width: 10 },
    { width: 10 },
  ];

  const title1 = s1.addRow([`表一：任务与例会旷会（红字为例会旷会扣分）｜${params.rangeTitle}`]);
  title1.font = { bold: true, size: 12 };
  s1.mergeCells(1, 1, 1, 7);
  s1.addRow([]);
  const h1 = s1.addRow([
    "类型",
    "标题",
    "开始时间",
    "结束时间",
    "参与人员",
    "参与人数",
    "积分",
  ]);
  styleHeaderRow(h1);

  for (const t of params.tasks) {
    s1.addRow([
      "任务",
      t.title,
      fmt(t.startTime),
      fmt(t.endTime),
      t.participantNamesText || "—",
      t.participantDistinctCount,
      t.points,
    ]);
  }

  for (const a of params.absences) {
    const row = s1.addRow([
      "例会旷会",
      a.displayTitle,
      fmt(a.meetingStart),
      a.meetingEnd ? fmt(a.meetingEnd) : "—",
      a.userDisplayName,
      a.participantCount,
      a.amount,
    ]);
    row.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11, color: RED_FONT.color };
    });
  }

  if (params.tasks.length === 0 && params.absences.length === 0) {
    const r = s1.addRow(["（该时间段内无计入考勤的任务交集，且无例会旷会扣分记录）"]);
    s1.mergeCells(r.number, 1, r.number, 7);
  }

  const s2 = wb.addWorksheet("表二", { views: [{ state: "frozen", ySplit: 2 }] });
  s2.columns = [
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
  ];

  const title2 = s2.addRow([`表二：考勤积分统计｜${params.rangeTitle}`]);
  title2.font = { bold: true, size: 12 };
  s2.mergeCells(1, 1, 1, 8);
  const h2 = s2.addRow(["姓名", "账号", "接取(参考)", "提交", "确认完成", "任务分", "其他分", "合计"]);
  styleHeaderRow(h2);

  for (const p of params.people) {
    s2.addRow([
      p.displayName,
      p.username,
      p.claimCount,
      p.submitCount,
      p.approvedCount,
      p.approvedPoints,
      p.otherPoints,
      p.totalPoints,
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
