"use client";

import AppShell from "@/components/AppShell";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import type { Key } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminProfilePeekAvatar } from "@/components/AdminProfilePeekAvatar";
import { MemberLeaveForm } from "./member-leave-form";
import { LeaveSlipModal } from "./leave-slip-modal";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"];
const PERIODS = ["第1节", "第2节", "第3节", "第4节", "第5节"];

type As = {
  id: string;
  weekday: number;
  period: number;
  deptLabel: string | null;
  user: { id: string; displayName: string; username: string; avatarUrl: string | null };
};

type MeetingRow = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  place: string | null;
  status: "OPEN" | "ENDED";
  publisher: { displayName: string };
};

type LeaveR = {
  id: string;
  category: "DUTY" | "MEETING";
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  dutyWeekday: number | null;
  dutyPeriod: number | null;
  user?: { displayName: string; username: string; avatarUrl: string | null };
  meeting?: { title: string; startTime: string } | null;
};

function groupAssignments(rows: As[]) {
  const m = new Map<string, As[]>();
  for (const a of rows) {
    const k = `${a.weekday}-${a.period}`;
    m.set(k, [...(m.get(k) ?? []), a]);
  }
  return m;
}

function DutyAndMeetingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [assignments, setAssignments] = useState<As[]>([]);
  const [userOpts, setUserOpts] = useState<{ value: string; label: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [pick, setPick] = useState<{ w: number; p: number } | null>(null);
  const [aForm] = Form.useForm<{ userId: string; deptLabel: string }>();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [mForm] = Form.useForm<{ title: string; startTime: Dayjs; endTime: Dayjs; place: string; description: string }>();
  const [mOpen, setMOpen] = useState(false);
  const [leaveList, setLeaveList] = useState<LeaveR[]>([]);
  /** 管理人员打开的请假条弹窗（待批记录） */
  const [leaveSlip, setLeaveSlip] = useState<LeaveR | null>(null);
  const [selectedMeetingKeys, setSelectedMeetingKeys] = useState<Key[]>([]);

  const isMgr = me?.role === "ADMIN" || me?.role === "MINISTER";
  const isAdmin = me?.role === "ADMIN";
  const isMember = me?.role === "MEMBER";

  const activeTab = useMemo(() => {
    const t = searchParams.get("tab");
    if (t === "meetings" || t === "leave" || t === "duty") return t;
    return "duty";
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== "meetings") setSelectedMeetingKeys([]);
  }, [activeTab]);

  const setTabInUrl = useCallback(
    (key: string) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", key);
      if (key !== "leave") p.delete("leaveId");
      const q = p.toString();
      router.replace(q ? `/duty-and-meetings?${q}` : "/duty-and-meetings", { scroll: false });
    },
    [router, searchParams],
  );

  const clearLeaveIdFromUrl = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    if (!p.has("leaveId")) return;
    p.delete("leaveId");
    const q = p.toString();
    router.replace(q ? `/duty-and-meetings?${q}` : "/duty-and-meetings", { scroll: false });
  }, [router, searchParams]);

  /** 从消息带 ?leaveId= 进入时，部长自动打开对应请假条（须等列表拉取后再判断是否清理 URL） */
  useEffect(() => {
    if (!isMgr) return;
    const lid = searchParams.get("leaveId");
    if (!lid) return;
    const row = leaveList.find((l) => l.id === lid);
    if (row?.status === "PENDING") {
      setLeaveSlip(row);
      return;
    }
    if (leaveList.length === 0) return;
    setLeaveSlip((cur) => (cur?.id === lid ? null : cur));
    clearLeaveIdFromUrl();
  }, [isMgr, searchParams, leaveList, clearLeaveIdFromUrl]);

  /** 当前用户被安排在本学期值班表中的名额（可在此请值班假） */
  const myDutyAssignments = useMemo(() => {
    if (!me?.id) return [] as As[];
    return assignments.filter((a) => a.user.id === me.id);
  }, [assignments, me?.id]);

  const myDutySlotOptions = useMemo(() => {
    const seen = new Set<string>();
    return myDutyAssignments
      .filter((a) => {
        const k = `${a.weekday}-${a.period}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((a) => ({
        value: `${a.weekday}-${a.period}` as const,
        label: `${WEEKDAYS[a.weekday]}${PERIODS[a.period]}${a.deptLabel ? `（${a.deptLabel}）` : ""}`,
      }));
  }, [myDutyAssignments]);

  const byCell = useMemo(() => groupAssignments(assignments), [assignments]);
  const openMeetings = useMemo(() => meetings.filter((m) => m.status === "OPEN"), [meetings]);

  const loadMe = useCallback(async () => {
    const r = await fetch("/api/me", { cache: "no-store" });
    const d = (await r.json().catch(() => ({}))) as { user?: { id: string; role: string } };
    if (r.ok && d.user?.id) setMe({ id: d.user.id, role: d.user.role });
  }, []);

  const loadDuty = useCallback(async () => {
    const r = await fetch("/api/duty");
    const d = (await r.json().catch(() => ({}))) as { assignments?: As[] };
    if (r.ok) setAssignments(d.assignments ?? []);
  }, []);

  const loadAssignable = useCallback(async () => {
    if (!isMgr) return;
    const r = await fetch("/api/users/assignable");
    const d = (await r.json().catch(() => ({}))) as { users?: { id: string; displayName: string; username: string }[] };
    if (r.ok) {
      setUserOpts(
        (d.users ?? []).map((u) => ({ value: u.id, label: `${u.displayName}（${u.username}）` })),
      );
    }
  }, [isMgr]);

  const loadMeetings = useCallback(async () => {
    const r = await fetch("/api/meetings");
    const d = (await r.json().catch(() => ({}))) as { meetings?: MeetingRow[] };
    if (r.ok) setMeetings(d.meetings ?? []);
  }, []);

  const loadLeave = useCallback(async () => {
    const r = await fetch("/api/leave");
    const d = (await r.json().catch(() => ({}))) as { list?: LeaveR[] };
    if (r.ok) setLeaveList((d.list ?? []) as LeaveR[]);
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);
  useEffect(() => {
    if (!me) return;
    loadDuty();
    loadMeetings();
    if (isMgr) loadAssignable();
    loadLeave();
  }, [me, isMgr, loadDuty, loadMeetings, loadLeave, loadAssignable]);

  return (
    <AppShell title="会议与值班">
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          固定值班表：周一~周五、第1~5 节。部长以上可往格子里加人；部员可提交值班/会议请假。例会结束后在会议详情中勾选旷会并关会，将按月度记 -1
          分（已准假不扣）。任务完成后会在「消息」中提示功德。
        </Typography.Paragraph>

        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setTabInUrl(k)}
            items={[
              {
                key: "duty",
                label: "值班表",
                children: (
                  <DutyGrid
                    byCell={byCell}
                    isMobile={isMobile}
                    isMgr={!!isMgr}
                    viewerRole={(me?.role ?? "MEMBER") as "ADMIN" | "MINISTER" | "MEMBER"}
                    onAdd={(w, p) => {
                      setPick({ w, p });
                      aForm.resetFields();
                      setAddOpen(true);
                    }}
                    onRemove={async (id) => {
                      const r = await fetch(`/api/duty?id=${encodeURIComponent(id)}`, { method: "DELETE" });
                      if (!r.ok) return message.error("删除失败");
                      message.success("已移除");
                      loadDuty();
                    }}
                  />
                ),
              },
              {
                key: "meetings",
                label: "会议",
                children: (
                  <div>
                    <Space wrap style={{ marginBottom: 12 }}>
                      {isMgr && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setMOpen(true)}>
                          发布会议
                        </Button>
                      )}
                      {isAdmin && (
                        <Popconfirm
                          title="确定批量删除所选会议？"
                          description="将永久删除会议记录；关联请假、考勤调整中的会议引用将按数据库规则处理，不可恢复。"
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                          disabled={selectedMeetingKeys.length === 0}
                          onConfirm={async () => {
                            if (selectedMeetingKeys.length === 0) return;
                            const r = await fetch("/api/admin/meetings/bulk-delete", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ ids: selectedMeetingKeys }),
                            });
                            const d = (await r.json().catch(() => ({}))) as { message?: string; deleted?: number };
                            if (!r.ok) {
                              message.error(d.message || "删除失败");
                              return;
                            }
                            message.success(`已删除 ${d.deleted ?? 0} 条会议`);
                            setSelectedMeetingKeys([]);
                            loadMeetings();
                          }}
                        >
                          <Button danger disabled={selectedMeetingKeys.length === 0}>
                            批量删除所选会议（{selectedMeetingKeys.length}）
                          </Button>
                        </Popconfirm>
                      )}
                    </Space>
                    <Table<MeetingRow>
                      rowKey="id"
                      size="small"
                      dataSource={meetings}
                      scroll={{ x: "max-content" }}
                      pagination={false}
                      rowSelection={
                        isAdmin
                          ? {
                              selectedRowKeys: selectedMeetingKeys,
                              onChange: setSelectedMeetingKeys,
                            }
                          : undefined
                      }
                      columns={[
                        { title: "主题", dataIndex: "title" },
                        {
                          title: "时间",
                          render: (_, m) => (
                            <span>
                              {dayjs(m.startTime).format("YYYY-MM-DD HH:mm")}
                              {m.endTime ? ` ~ ${dayjs(m.endTime).format("HH:mm")}` : ""}
                            </span>
                          ),
                        },
                        { title: "发布", dataIndex: ["publisher", "displayName"] },
                        {
                          title: "状态",
                          render: (_, m) => (m.status === "OPEN" ? <Tag color="green">未结束</Tag> : <Tag>已结束</Tag>),
                        },
                        {
                          title: "操作",
                          render: (_, m) => (
                            <Link href={`/duty-and-meetings/meetings/${m.id}`}>
                              {m.status === "OPEN" && isMgr ? "进入/关会" : "查看"}
                            </Link>
                          ),
                        },
                      ]}
                    />
                  </div>
                ),
              },
              {
                key: "leave",
                label: "请假",
                children: isMember ? (
                  <MemberLeaveForm
                    openMeetings={openMeetings}
                    myDutySlotOptions={myDutySlotOptions}
                    leaveList={leaveList}
                    onRefresh={loadLeave}
                  />
                ) : (
                  <Table<LeaveR>
                    size="small"
                    rowKey="id"
                    dataSource={leaveList}
                    scroll={{ x: "max-content" }}
                    pagination={false}
                    title={() => "所有请假（部长/管理员在消息中也会收到，也可在此处理）"}
                    columns={[
                      { title: "人", dataIndex: ["user", "displayName"] },
                      { title: "类型", render: (_, l) => (l.category === "DUTY" ? "值班" : "会议") },
                      { title: "理由", dataIndex: "reason", ellipsis: true },
                      {
                        title: "状态",
                        render: (_, l) => (l.status === "PENDING" ? "待批" : l.status === "APPROVED" ? "同意" : "驳回"),
                      },
                      { title: "时间", dataIndex: "createdAt", render: (s: string) => dayjs(s).format("MM-DD HH:mm") },
                      {
                        title: "操作",
                        width: 100,
                        render: (_, l) =>
                          l.status === "PENDING" ? (
                            <Button type="link" size="small" onClick={() => setLeaveSlip(l)}>
                              处理
                            </Button>
                          ) : null,
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Space>

      {/* 仅在打开时挂载 Modal，避免 ant-modal-root 在 SSR 与首屏水合不一致 */}
      {mOpen ? (
        <Modal
          open={mOpen}
          onCancel={() => setMOpen(false)}
          onOk={() => mForm.submit()}
          title="发布会议"
          width={480}
          destroyOnHidden
          afterOpenChange={(o) => {
            if (o) {
              mForm.setFieldsValue({
                title: "",
                startTime: dayjs().add(1, "day").hour(12).minute(0),
                endTime: dayjs().add(1, "day").hour(14).minute(0),
                place: "",
                description: "",
              });
            }
          }}
        >
          <Form
            form={mForm}
            layout="vertical"
            onFinish={async (v) => {
              const r = await fetch("/api/meetings", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  title: v.title,
                  startTime: v.startTime.toISOString(),
                  endTime: v.endTime ? v.endTime.toISOString() : undefined,
                  place: v.place,
                  description: v.description,
                }),
              });
              const d = (await r.json().catch(() => ({}))) as { message?: string };
              if (!r.ok) return message.error(d.message || "失败");
              message.success("已发布");
              setMOpen(false);
              loadMeetings();
            }}
          >
            <Form.Item name="title" label="主题" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="startTime" label="开始" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="endTime" label="结束" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="place" label="地点">
              <Input />
            </Form.Item>
            <Form.Item name="description" label="说明">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}

      {addOpen ? (
        <Modal
          open={addOpen}
          onCancel={() => setAddOpen(false)}
          onOk={() => aForm.submit()}
          title={pick != null ? `为 ${WEEKDAYS[pick.w]}${PERIODS[pick.p]} 添加` : "安排值班"}
          destroyOnHidden
        >
          <Form
            form={aForm}
            onFinish={async (v) => {
              if (!pick) return;
              const r = await fetch("/api/duty", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ weekday: pick.w, period: pick.p, userId: v.userId, deptLabel: v.deptLabel || undefined }),
              });
              const d = (await r.json().catch(() => ({}))) as { message?: string };
              if (!r.ok) return message.error(d.message || "失败");
              message.success("已安排");
              setAddOpen(false);
              loadDuty();
            }}
          >
            <Form.Item name="userId" label="干事" rules={[{ required: true }]}>
              <Select showSearch options={userOpts} />
            </Form.Item>
            <Form.Item name="deptLabel" label="部门/分组（可空）">
              <Input placeholder="如 办公室、宣传部" />
            </Form.Item>
          </Form>
        </Modal>
      ) : null}

      <LeaveSlipModal
        open={leaveSlip != null}
        leave={leaveSlip}
        onClose={() => {
          setLeaveSlip(null);
          clearLeaveIdFromUrl();
        }}
        onDecided={() => void loadLeave()}
      />
    </AppShell>
  );
}

export default function DutyAndMeetingsPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="会议与值班">
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spin size="large" />
          </div>
        </AppShell>
      }
    >
      <DutyAndMeetingsPageInner />
    </Suspense>
  );
}

function DutyGrid({
  byCell,
  isMobile,
  isMgr,
  viewerRole,
  onAdd,
  onRemove,
}: {
  byCell: Map<string, As[]>;
  isMobile: boolean;
  isMgr: boolean;
  viewerRole: "ADMIN" | "MINISTER" | "MEMBER";
  onAdd: (w: number, p: number) => void;
  onRemove: (id: string) => void;
}) {
  const [weekday, setWeekday] = useState(0);

  if (isMobile) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            选择星期：
          </Typography.Text>
          <Select
            size="middle"
            value={weekday}
            onChange={(v) => setWeekday(v)}
            options={WEEKDAYS.map((d, i) => ({ value: i, label: d }))}
            style={{ width: 140 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            仅展示一天，避免横向滑动卡顿
          </Typography.Text>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PERIODS.map((pLabel, p) => {
            const k = `${weekday}-${p}`;
            const list = byCell.get(k) ?? [];
            return (
              <div
                key={pLabel}
                style={{
                  border: "1px solid #e8e8e8",
                  borderRadius: 10,
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "8px 10px",
                    background: "#e6f4ff",
                    borderBottom: "1px solid #e8e8e8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {pLabel}
                  </Typography.Text>
                  {isMgr ? (
                    <Button size="small" type="dashed" onClick={() => onAdd(weekday, p)} icon={<PlusOutlined />}>
                      加人
                    </Button>
                  ) : null}
                </div>

                <div style={{ padding: 10 }}>
                  {list.length === 0 ? (
                    <Typography.Text type="secondary">暂无安排</Typography.Text>
                  ) : (
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      {list.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            minWidth: 0,
                          }}
                        >
                          <AdminProfilePeekAvatar
                            viewerRole={viewerRole}
                            targetUserId={a.user.id}
                            size={22}
                            src={a.user.avatarUrl}
                            displayName={a.user.displayName}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: 13,
                                lineHeight: 1.25,
                              }}
                            >
                              {a.user.displayName}
                              {a.deptLabel ? <span style={{ color: "#888" }}>（{a.deptLabel}）</span> : null}
                            </div>
                          </div>
                          {isMgr ? (
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => onRemove(a.id)}
                            />
                          ) : null}
                        </div>
                      ))}
                    </Space>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}>
      <table
        style={{
          borderCollapse: "collapse",
          minWidth: 560,
          background: "#fff",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                border: "1px solid #e8e8e8",
                background: "#e6f4ff",
                minWidth: 70,
                padding: 6,
                fontSize: 12,
              }}
            />
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                style={{
                  border: "1px solid #e8e8e8",
                  background: "#e6f4ff",
                  minWidth: 92,
                  padding: 6,
                  fontSize: 12,
                }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((pLabel, p) => (
            <tr key={pLabel}>
              <th
                style={{
                  border: "1px solid #e8e8e8",
                  background: "#e6f4ff",
                  padding: 6,
                  fontSize: 12,
                  textAlign: "left",
                }}
              >
                {pLabel}
              </th>
              {WEEKDAYS.map((_, w) => {
                const k = `${w}-${p}`;
                const list = byCell.get(k) ?? [];
                return (
                  <td
                    key={k}
                    style={{ border: "1px solid #e8e8e8", verticalAlign: "top", padding: 6, minHeight: 70, width: 92 }}
                  >
                    <Space orientation="vertical" size={4} style={{ width: "100%" }}>
                      {list.map((a) => (
                        <div
                          key={a.id}
                          style={{ fontSize: 12, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <AdminProfilePeekAvatar
                            viewerRole={viewerRole}
                            targetUserId={a.user.id}
                            size={18}
                            src={a.user.avatarUrl}
                            displayName={a.user.displayName}
                          />
                          <span style={{ flex: 1 }}>
                            {a.user.displayName}
                            {a.deptLabel ? <span style={{ color: "#888" }}>（{a.deptLabel}）</span> : null}
                          </span>
                          {isMgr && (
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => onRemove(a.id)} />
                          )}
                        </div>
                      ))}
                      {isMgr && (
                        <Button type="dashed" size="small" block onClick={() => onAdd(w, p)}>
                          <PlusOutlined /> 加人
                        </Button>
                      )}
                    </Space>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
