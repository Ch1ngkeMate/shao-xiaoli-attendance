"use client";

import { Button, Card, DatePicker, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Row = {
  userId: string;
  displayName: string;
  username: string;
  claimCount: number;
  submitCount: number;
  approvedCount: number;
  approvedPoints: number;
};

export default function ReportsPage() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [snapshot, setSnapshot] = useState(false);

  const columns: ColumnsType<Row> = useMemo(
    () => [
      { title: "姓名", dataIndex: "displayName" },
      { title: "账号", dataIndex: "username" },
      { title: "接取(参考)", dataIndex: "claimCount" },
      { title: "提交", dataIndex: "submitCount" },
      { title: "确认完成", dataIndex: "approvedCount" },
      { title: "确认积分", dataIndex: "approvedPoints" },
    ],
    [],
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly?month=${encodeURIComponent(month)}`);
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "加载失败");
        return;
      }
      setSnapshot(!!data.snapshot);
      setRows(data.stats.people);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly/generate?month=${encodeURIComponent(month)}`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "生成失败");
        return;
      }
      message.success("已生成快照");
      await load();
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    window.open(`/api/reports/monthly/export?month=${encodeURIComponent(month)}&type=csv`, "_blank");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  return (
    <AppShell title="月度考勤报表">
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Card>
          <Space wrap>
            <DatePicker
              picker="month"
              value={dayjs(month)}
              onChange={(v) => setMonth(v ? v.format("YYYY-MM") : dayjs().format("YYYY-MM"))}
            />
            <Button onClick={load} loading={loading}>
              刷新
            </Button>
            <Button type="primary" onClick={generate} loading={loading}>
              生成快照
            </Button>
            <Button onClick={exportCsv}>导出 CSV</Button>
            <Typography.Text type="secondary">
              当前数据：{snapshot ? "快照" : "实时统计（未生成快照）"}
            </Typography.Text>
          </Space>
        </Card>

        <Card>
          <Table<Row>
            rowKey="userId"
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </Space>
    </AppShell>
  );
}

