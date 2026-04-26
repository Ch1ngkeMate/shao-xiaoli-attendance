"use client";

import Link from "next/link";
import type { Key } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import AppShell from "@/components/AppShell";
import { AdminProfilePeekAvatar } from "@/components/AdminProfilePeekAvatar";
import { getTaskClaimVisibility } from "@/lib/task-availability";

type TaskItem = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  timeSlots?: { startTime: string; endTime: string }[];
  points: number;
  status: "OPEN" | "CLOSED";
  headcountHint: number | null;
  /** 已接取人数（仅统计 CLAIMED） */
  claimedCount: number;
  /** 已接取人列表 */
  claimants: { id: string; displayName: string; username: string; avatarUrl: string | null }[];
  /** 与详情页：每人已提交且均已被部长/管理员通过 */
  allClaimantsApproved: boolean;
  /** 各段/任务级名额已无可新接 */
  slotsOrTaskFull: boolean;
  publisher: { displayName: string };
};

export default function TaskListPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<Key[]>([]);

  const isAdmin = meRole === "ADMIN";

  const columns: ColumnsType<TaskItem> = useMemo(
    () => [
      {
        title: "标题",
        dataIndex: "title",
        render: (title: string, record) => {
          const v = getTaskClaimVisibility({
            status: record.status,
            endTime: record.endTime,
            headcountHint: record.headcountHint,
            claimedCount: record.claimedCount ?? 0,
            allClaimantsApproved: record.allClaimantsApproved,
            slotsOrTaskFull: record.slotsOrTaskFull,
          });
          return (
            <Space>
              <Link href={`/tasks/${record.id}`}>{title}</Link>
              <Tag color={v.color}>{v.text}</Tag>
            </Space>
          );
        },
      },
      {
        title: "时间",
        width: 220,
        render: (_: unknown, r) => {
          if (r.timeSlots && r.timeSlots.length > 1) {
            return (
              <span style={{ fontSize: 12 }}>
                共 {r.timeSlots.length} 段
                <br />
                {dayjs(r.startTime).format("MM/DD HH:mm")} ~ {dayjs(r.endTime).format("MM/DD HH:mm")}
              </span>
            );
          }
          return (
            <span style={{ fontSize: 12 }}>
              {dayjs(r.startTime).format("YYYY-MM-DD HH:mm")} ~ {dayjs(r.endTime).format("MM-DD HH:mm")}
            </span>
          );
        },
      },
      {
        title: "接取人",
        width: 200,
        render: (_: unknown, r) => {
          const list = r.claimants ?? [];
          if (list.length === 0) return <span style={{ color: "#999" }}>无</span>;
          return (
            <Space size={4} wrap style={{ maxWidth: 200, fontSize: 12 }}>
              {list.map((c) => (
                <Space key={c.id} size={4} style={{ display: "inline-flex" }}>
                  <AdminProfilePeekAvatar
                    viewerRole={(meRole ?? "MEMBER") as "ADMIN" | "MINISTER" | "MEMBER"}
                    targetUserId={c.id}
                    size={20}
                    src={c.avatarUrl}
                    displayName={c.displayName}
                  />
                  <span>{c.displayName}</span>
                </Space>
              ))}
            </Space>
          );
        },
      },
      { title: "积分", dataIndex: "points", width: 70 },
      { title: "发布人", render: (_: unknown, r) => r.publisher.displayName, width: 160 },
      {
        title: "操作",
        render: (_: unknown, r) => <Link href={`/tasks/${r.id}`}>查看</Link>,
        width: 90,
      },
    ],
    [meRole],
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
      setMeRole(meData.user.role as string);
      const res = await fetch("/api/tasks");
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "加载任务失败");
        return;
      }
      setTasks(data.tasks);
      const nextTasks = (data.tasks ?? []) as TaskItem[];
      setSelectedTaskKeys((keys) => keys.filter((k) => nextTasks.some((t) => t.id === k)));
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
          {isAdmin ? (
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <Popconfirm
                title="确定批量删除所选任务？"
                description="将永久删除任务及接取、提交、审核、凭证与时间段等关联数据，不可恢复。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                disabled={selectedTaskKeys.length === 0}
                onConfirm={async () => {
                  if (selectedTaskKeys.length === 0) return;
                  const r = await fetch("/api/admin/tasks/bulk-delete", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ids: selectedTaskKeys }),
                  });
                  const d = (await r.json().catch(() => ({}))) as { message?: string; deleted?: number };
                  if (!r.ok) {
                    message.error(d.message || "删除失败");
                    return;
                  }
                  message.success(`已删除 ${d.deleted ?? 0} 条任务`);
                  setSelectedTaskKeys([]);
                  await load();
                }}
              >
                <Button danger disabled={selectedTaskKeys.length === 0}>
                  批量删除所选（{selectedTaskKeys.length}）
                </Button>
              </Popconfirm>
              <Table<TaskItem>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={tasks}
                pagination={{ pageSize: 20 }}
                rowSelection={{
                  selectedRowKeys: selectedTaskKeys,
                  onChange: setSelectedTaskKeys,
                }}
              />
            </Space>
          ) : (
            <Table<TaskItem>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={tasks}
              pagination={{ pageSize: 20 }}
            />
          )}
        </Card>
      </Space>
    </AppShell>
  );
}

