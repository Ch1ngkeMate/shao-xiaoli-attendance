"use client";

import Link from "next/link";
import type { Key } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Empty, Grid, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
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

function truncateTaskTitleForList(title: string) {
  const chars = Array.from(title ?? "");
  if (chars.length <= 5) return title;
  return `${chars.slice(0, 2).join("")}…${chars.slice(-2).join("")}`;
}

function formatTaskTimeForMobile(r: TaskItem) {
  if (r.timeSlots && r.timeSlots.length > 1) {
    return `共${r.timeSlots.length}段 ${dayjs(r.startTime).format("MM-DD HH:mm")} ~ ${dayjs(r.endTime).format("MM-DD HH:mm")}`;
  }
  return `${dayjs(r.startTime).format("MM-DD HH:mm")} ~ ${dayjs(r.endTime).format("MM-DD HH:mm")}`;
}

type VisibilityFilter = "ALL" | "CLAIMABLE" | "FULL" | "PENDING" | "ENDED";
type EndedFilter = "ALL" | "ONGOING" | "ENDED";
type SortMode = "CREATED_DESC" | "END_ASC";

export default function TaskListPage() {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<Key[]>([]);
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("ALL");
  const [ended, setEnded] = useState<EndedFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("CREATED_DESC");

  const isAdmin = meRole === "ADMIN";

  const filteredTasks = useMemo(() => {
    const query = q.trim();
    const now = Date.now();
    const list = tasks.filter((t) => {
      if (query) {
        if (!String(t.title ?? "").includes(query)) return false;
      }
      const v = getTaskClaimVisibility({
        status: t.status,
        endTime: t.endTime,
        headcountHint: t.headcountHint,
        claimedCount: t.claimedCount ?? 0,
        allClaimantsApproved: t.allClaimantsApproved,
        slotsOrTaskFull: t.slotsOrTaskFull,
      }).text;

      if (visibility !== "ALL") {
        if (visibility === "CLAIMABLE" && v !== "可接取") return false;
        if (visibility === "FULL" && v !== "名额已满") return false;
        if (visibility === "PENDING" && v !== "待处理") return false;
        if (visibility === "ENDED" && v !== "已结束") return false;
      }

      if (ended !== "ALL") {
        const endAt = new Date(t.endTime).getTime();
        const isEnded = Number.isFinite(endAt) ? now > endAt : false;
        if (ended === "ENDED" && !isEnded) return false;
        if (ended === "ONGOING" && isEnded) return false;
      }

      return true;
    });

    if (sortMode === "END_ASC") {
      return [...list].sort((a, b) => {
        const ea = new Date(a.endTime).getTime();
        const eb = new Date(b.endTime).getTime();
        if (!Number.isFinite(ea) && !Number.isFinite(eb)) return 0;
        if (!Number.isFinite(ea)) return 1;
        if (!Number.isFinite(eb)) return -1;
        return ea - eb;
      });
    }
    return list;
  }, [ended, q, sortMode, tasks, visibility]);

  const columns: ColumnsType<TaskItem> = useMemo(
    () =>
      isMobile
        ? [
            {
              title: "任务",
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
                const chars = Array.from(title ?? "");
                const show = truncateTaskTitleForList(title);
                const tooltipTitle = chars.length > 5 ? title : undefined;
                const timeLine = formatTaskTimeForMobile(record);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <Typography.Text
                        title={tooltipTitle}
                        style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        <Link href={`/tasks/${record.id}`} style={{ whiteSpace: "nowrap" }}>
                          {show}
                        </Link>
                      </Typography.Text>
                      <Tag color={v.color} style={{ flexShrink: 0 }}>
                        {v.text}
                      </Tag>
                      <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <Link href={`/tasks/${record.id}`}>详情</Link>
                      </span>
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.2 }}>
                      {timeLine}
                    </Typography.Text>
                  </div>
                );
              },
            },
          ]
        : [
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
                const chars = Array.from(title ?? "");
                const show = truncateTaskTitleForList(title);
                const tooltipTitle = chars.length > 5 ? title : undefined;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "nowrap" }}>
                    <Typography.Text
                      title={tooltipTitle}
                      style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      <Link href={`/tasks/${record.id}`} style={{ whiteSpace: "nowrap" }}>
                        {show}
                      </Link>
                    </Typography.Text>
                    <Tag color={v.color} style={{ flexShrink: 0 }}>
                      {v.text}
                    </Tag>
                  </div>
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
    [isMobile, meRole],
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
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: 8,
              alignItems: isMobile ? "stretch" : "center",
              marginBottom: 12,
            }}
          >
            <Input
              allowClear
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索任务标题"
              style={{ maxWidth: isMobile ? "100%" : 260 }}
            />
            <Select<VisibilityFilter>
              value={visibility}
              onChange={(v) => setVisibility(v)}
              style={{ width: isMobile ? "100%" : 160 }}
              options={[
                { value: "ALL", label: "状态：全部" },
                { value: "CLAIMABLE", label: "可接取" },
                { value: "FULL", label: "名额已满" },
                { value: "PENDING", label: "待处理" },
                { value: "ENDED", label: "已结束" },
              ]}
            />
            <Select<EndedFilter>
              value={ended}
              onChange={(v) => setEnded(v)}
              style={{ width: isMobile ? "100%" : 160 }}
              options={[
                { value: "ALL", label: "截止：全部" },
                { value: "ONGOING", label: "仅未截止" },
                { value: "ENDED", label: "仅已截止" },
              ]}
            />
            <Select<SortMode>
              value={sortMode}
              onChange={(v) => setSortMode(v)}
              style={{ width: isMobile ? "100%" : 180 }}
              options={[
                { value: "CREATED_DESC", label: "排序：最新发布" },
                { value: "END_ASC", label: "排序：即将截止" },
              ]}
            />
            <Button
              onClick={() => {
                setQ("");
                setVisibility("ALL");
                setEnded("ALL");
                setSortMode("CREATED_DESC");
              }}
            >
              清空筛选
            </Button>
          </div>

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
                dataSource={filteredTasks}
                scroll={isMobile ? undefined : { x: "max-content" }}
                pagination={{ pageSize: 20 }}
                locale={{
                  emptyText: loading ? null : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />,
                }}
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
              dataSource={filteredTasks}
              scroll={isMobile ? undefined : { x: "max-content" }}
              pagination={{ pageSize: 20 }}
              locale={{
                emptyText: loading ? null : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />,
              }}
            />
          )}
        </Card>
      </Space>
    </AppShell>
  );
}

