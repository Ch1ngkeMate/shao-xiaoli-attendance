"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import AppShell from "@/components/AppShell";

type TaskItem = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  points: number;
  status: "OPEN" | "CLOSED";
  publisher: { displayName: string };
};

export default function TaskListPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);

  const columns: ColumnsType<TaskItem> = useMemo(
    () => [
      {
        title: "标题",
        dataIndex: "title",
        render: (title: string, record) => (
          <Space>
            <Link href={`/tasks/${record.id}`}>{title}</Link>
            <Tag color={record.status === "OPEN" ? "green" : "default"}>
              {record.status === "OPEN" ? "可接取" : "已关闭"}
            </Tag>
          </Space>
        ),
      },
      {
        title: "时间",
        render: (_: unknown, r) =>
          `${dayjs(r.startTime).format("YYYY-MM-DD HH:mm")} ~ ${dayjs(r.endTime).format("YYYY-MM-DD HH:mm")}`,
      },
      { title: "积分", dataIndex: "points", width: 90 },
      { title: "发布人", render: (_: unknown, r) => r.publisher.displayName, width: 160 },
      {
        title: "操作",
        render: (_: unknown, r) => <Link href={`/tasks/${r.id}`}>查看</Link>,
        width: 90,
      },
    ],
    [],
  );

  async function load() {
    setLoading(true);
    try {
      const meRes = await fetch("/api/me");
      const meData = (await meRes.json().catch(() => ({}))) as any;
      if (!meRes.ok || !meData.user) {
        setTimeout(() => router.replace("/login"), 0);
        return;
      }
      const res = await fetch("/api/tasks");
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "加载任务失败");
        return;
      }
      setTasks(data.tasks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="任务大厅">
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Card>
          <Table<TaskItem>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={tasks}
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </Space>
    </AppShell>
  );
}

