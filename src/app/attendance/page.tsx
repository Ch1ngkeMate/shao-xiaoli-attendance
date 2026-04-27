"use client";

import AppShell from "@/components/AppShell";
import { Card, DatePicker, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { MeetingAbsenceMonthlyEntry } from "@/lib/monthly-report";

type ApprovedTask = { taskId: string; title: string; points: number; reviewTime: string };
type Row = {
  userId: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "MINISTER" | "MEMBER";
  claimCount: number;
  submitCount: number;
  approvedCount: number;
  approvedPoints: number;
  otherPoints: number;
  totalPoints: number;
  approvedTasks: ApprovedTask[];
  meetingAbsences?: MeetingAbsenceMonthlyEntry[];
};

export default function AttendancePage() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  /** 管理人员列表：部员按合计分（积分）从高到低 */
  const memberRowsByPointsDesc = useMemo(
    () =>
      rows
        .filter((r) => r.role === "MEMBER")
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          if (b.approvedPoints !== a.approvedPoints) return b.approvedPoints - a.approvedPoints;
          return a.displayName.localeCompare(b.displayName, "zh-CN");
        }),
    [rows],
  );

  const columns: ColumnsType<Row> = useMemo(
    () => [
      { title: "姓名", dataIndex: "displayName" },
      { title: "账号", dataIndex: "username" },
      {
        title: "身份",
        dataIndex: "role",
        render: (r: Row["role"]) =>
          r === "MEMBER" ? <Tag color="blue">部员</Tag> : r === "MINISTER" ? <Tag color="purple">部长</Tag> : <Tag>管理员</Tag>,
        width: 90,
      },
      { title: "接取(参考)", dataIndex: "claimCount", width: 110 },
      { title: "提交", dataIndex: "submitCount", width: 90 },
      { title: "确认完成", dataIndex: "approvedCount", width: 110 },
      { title: "任务分", dataIndex: "approvedPoints", width: 100 },
      { title: "其他分", dataIndex: "otherPoints", width: 100, render: (v: number) => (v < 0 ? v : v) },
      { title: "合计分", dataIndex: "totalPoints", width: 100 },
    ],
    [],
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance?month=${encodeURIComponent(month)}`);
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "加载失败");
        return;
      }
      setRows(data.stats.people);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  return (
    <AppShell title="部员考勤">
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Card>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <DatePicker
              picker="month"
              value={dayjs(month)}
              onChange={(v) => setMonth(v ? v.format("YYYY-MM") : dayjs().format("YYYY-MM"))}
            />
            <Typography.Text type="secondary" style={{ margin: 0, lineHeight: 1.5 }}>
              任务确认分 + 例会/其它调整分=合计；请假通过不扣「旷会」分
            </Typography.Text>
          </div>
        </Card>

        <Card>
          <Table<Row>
            rowKey="userId"
            loading={loading}
            columns={columns}
            dataSource={memberRowsByPointsDesc}
            expandable={{
              expandedRowRender: (r) => {
                const absences = r.meetingAbsences ?? [];
                return (
                  <div>
                    <Typography.Text strong>当月确认通过任务：</Typography.Text>
                    {r.approvedTasks.length === 0 ? (
                      <div style={{ marginTop: 8 }}>无</div>
                    ) : (
                      <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                        {r.approvedTasks.map((t) => (
                          <li key={t.taskId}>
                            {t.title}（{t.points} 分，确认时间：{dayjs(t.reviewTime).format("YYYY-MM-DD HH:mm")}）
                          </li>
                        ))}
                      </ul>
                    )}
                    <Typography.Text strong style={{ display: "block", marginTop: 16 }}>
                      当月例会旷会：
                    </Typography.Text>
                    {absences.length === 0 ? (
                      <div style={{ marginTop: 8 }}>无</div>
                    ) : (
                      <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                        {absences.map((a) => (
                          <li key={a.id} style={{ color: "var(--ant-color-error, #ff4d4f)" }}>
                            {a.label}（{a.amount} 分，记录时间：{dayjs(a.recordedAt).format("YYYY-MM-DD HH:mm")}）
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              },
              rowExpandable: (r) => r.approvedTasks.length > 0 || (r.meetingAbsences?.length ?? 0) > 0,
            }}
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </Space>
    </AppShell>
  );
}

