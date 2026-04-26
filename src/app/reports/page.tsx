"use client";

import { Button, Card, DatePicker, Divider, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

const { RangePicker } = DatePicker;

type Row = {
  userId: string;
  displayName: string;
  username: string;
  claimCount: number;
  submitCount: number;
  approvedCount: number;
  approvedPoints: number;
  otherPoints: number;
  totalPoints: number;
};

export default function ReportsPage() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [snapshot, setSnapshot] = useState(false);
  /** 自选时间段导出 Excel 的起止（含当天整天） */
  const [exportRange, setExportRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);

  const columns: ColumnsType<Row> = useMemo(
    () => [
      { title: "姓名", dataIndex: "displayName" },
      { title: "账号", dataIndex: "username" },
      { title: "接取(参考)", dataIndex: "claimCount" },
      { title: "提交", dataIndex: "submitCount" },
      { title: "确认完成", dataIndex: "approvedCount" },
      { title: "任务分", dataIndex: "approvedPoints" },
      { title: "其他分", dataIndex: "otherPoints" },
      { title: "合计", dataIndex: "totalPoints" },
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

  function exportRangeExcel() {
    const [a, b] = exportRange;
    if (!a || !b) {
      message.warning("请在下方选择导出的开始与结束日期");
      return;
    }
    if (b.startOf("day").isBefore(a.startOf("day"))) {
      message.warning("结束日期不能早于开始日期");
      return;
    }
    const from = a.format("YYYY-MM-DD");
    const to = b.format("YYYY-MM-DD");
    window.open(
      `/api/reports/attendance-range-export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      "_blank",
    );
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
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 880 }}>
              <strong>生成快照：</strong>把<strong>该月</strong>的接取、提交、确认分等汇总写入数据库。之后查看该月时优先显示这份已固定结果，
              <strong>不会因之后又做了新任务而自动改变当月数字</strong>（适合月结、归档）。姓名、账号、角色仍与「用户管理」同步展示。
            </Typography.Paragraph>
            <Typography.Text type="secondary">
              当前视图：{snapshot ? "已封存快照" : "实时统计（本月尚未生成快照）"}
            </Typography.Text>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              自选时间段导出（Excel 双表）
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              表一：该时间段与任务时间有交集且计入考勤的全部任务（时间、<strong>参与人员</strong>为姓名列表、<strong>参与人数</strong>另列、积分）；例会旷会扣分单独成行，标题按会议开始日期形如「2026-04-20 会议旷会」，参与人员为旷会者姓名，且
              <Typography.Text type="danger">整行红字</Typography.Text>
              。表二：每人接取/提交/确认分/其它分/合计，口径与上方月报实时统计一致，按所选日期范围汇总。
            </Typography.Paragraph>
            <Space wrap align="center">
              <RangePicker
                value={exportRange}
                onChange={(v) => setExportRange(v ?? [null, null])}
                allowClear={false}
              />
              <Button type="primary" onClick={exportRangeExcel}>
                导出 Excel
              </Button>
            </Space>
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

