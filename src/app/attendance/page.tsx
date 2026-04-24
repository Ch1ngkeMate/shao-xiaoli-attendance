"use client";

import AppShell from "@/components/AppShell";
import { Card, DatePicker, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

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
  approvedTasks: ApprovedTask[];
};

export default function AttendancePage() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

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
      { title: "确认积分", dataIndex: "approvedPoints", width: 110 },
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
          <Space wrap>
            <DatePicker
              picker="month"
              value={dayjs(month)}
              onChange={(v) => setMonth(v ? v.format("YYYY-MM") : dayjs().format("YYYY-MM"))}
            />
            <Typography.Text type="secondary">
              统计口径：接取为参考，确认通过计入考勤与积分
            </Typography.Text>
          </Space>
        </Card>

        <Card>
          <Table<Row>
            rowKey="userId"
            loading={loading}
            columns={columns}
            dataSource={rows.filter((r) => r.role === "MEMBER")}
            expandable={{
              expandedRowRender: (r) => (
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
                </div>
              ),
              rowExpandable: (r) => r.approvedTasks.length > 0,
            }}
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </Space>
    </AppShell>
  );
}

