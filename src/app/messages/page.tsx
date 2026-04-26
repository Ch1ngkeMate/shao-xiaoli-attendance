"use client";

import AppShell from "@/components/AppShell";
import { AnnouncementEditor } from "./announcement-editor";
import { Button, Card, Empty, Space, Spin, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";

type Role = "ADMIN" | "MINISTER" | "MEMBER";
type Me = { id: string; role: Role } | null;

type Msg = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  leaveId?: string | null;
  meetingId?: string | null;
  taskId?: string | null;
};

/** 点击消息后跳转的处理页（无则不可点） */
function messageTargetHref(m: Msg): string | null {
  if (m.type === "LEAVE_APPLY" && m.leaveId) {
    return `/duty-and-meetings?tab=leave&leaveId=${encodeURIComponent(m.leaveId)}`;
  }
  if (m.type === "LEAVE_DECIDED") {
    return "/duty-and-meetings?tab=leave";
  }
  if (m.type === "TASK_DONE") {
    return m.taskId ? `/tasks/${encodeURIComponent(m.taskId)}` : "/tasks";
  }
  if (m.type === "MEETING_NEW") {
    return m.meetingId ? `/duty-and-meetings/meetings/${encodeURIComponent(m.meetingId)}` : "/duty-and-meetings?tab=meetings";
  }
  if (m.type === "MEETING_ABSENCE") {
    return m.meetingId ? `/duty-and-meetings/meetings/${encodeURIComponent(m.meetingId)}` : "/attendance";
  }
  return null;
}

function typeLabel(t: string) {
  if (t === "ANNOUNCEMENT") return { text: "公告", color: "magenta" as const };
  if (t === "MEETING_NEW") return { text: "新会议", color: "geekblue" as const };
  if (t === "MEETING_ABSENCE") return { text: "旷会", color: "red" as const };
  if (t === "TASK_DONE") return { text: "任务", color: "blue" as const };
  if (t === "LEAVE_APPLY") return { text: "请假日志", color: "orange" as const };
  if (t === "LEAVE_DECIDED") return { text: "假条结果", color: "green" as const };
  return { text: t, color: "default" as const };
}

export default function MessagesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [list, setList] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  const canManage = me?.role === "ADMIN" || me?.role === "MINISTER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { list?: Msg[]; message?: string };
      if (!res.ok) {
        message.error(data.message || "加载失败");
        return;
      }
      setList(data.list ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me", { cache: "no-store" });
      const d = (await res.json().catch(() => ({}))) as { user?: { id: string; role: Role } };
      if (res.ok && d.user) setMe(d.user);
    })();
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sxl-messages-updated"));
    }
  }, [load]);

  useEffect(() => {
    const onSent = () => {
      void load();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("sxl-announcement-sent", onSent);
    return () => window.removeEventListener("sxl-announcement-sent", onSent);
  }, [load]);

  const openMessageTarget = useCallback(
    async (item: Msg) => {
      const href = messageTargetHref(item);
      if (!href) return;
      if (!item.read) {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        void load();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("sxl-messages-updated"));
        }
      }
      router.push(href);
    },
    [load, router],
  );

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    load();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sxl-messages-updated"));
    }
  }

  return (
    <AppShell title="消息">
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        {canManage && <AnnouncementEditor />}

        <Card
          size="small"
          extra={
            <Button type="link" onClick={markAllRead} disabled={list.length === 0 || list.every((m) => m.read)}>
              全部已读
            </Button>
          }
        >
          任务完成提醒、假条审批、请假日志与部长/管理员公告均在此显示；未读在左侧「消息」处显示红点，阅读后消失。有可跳转目标的消息点击卡片即可进入对应页面（公告无跳转）。
        </Card>
        <Spin spinning={loading}>
          {list.length === 0 && !loading ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息" />
          ) : (
            <Space orientation="vertical" size={0} style={{ width: "100%" }}>
              {list.map((item) => {
                const lab = typeLabel(item.type);
                const href = messageTargetHref(item);
                return (
                  <Card
                    key={item.id}
                    size="small"
                    role={href ? "button" : undefined}
                    tabIndex={href ? 0 : undefined}
                    onClick={() => {
                      if (href) void openMessageTarget(item);
                    }}
                    onKeyDown={(e) => {
                      if (!href) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openMessageTarget(item);
                      }
                    }}
                    style={{
                      background: item.read ? undefined : "#f6f9ff",
                      marginBottom: 8,
                      cursor: href ? "pointer" : undefined,
                    }}
                    extra={<Typography.Text type="secondary">{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}</Typography.Text>}
                  >
                    <Space wrap size={[0, 4]}>
                      <Tag color={lab.color}>{lab.text}</Tag>
                      {!item.read && <Tag color="blue">未读</Tag>}
                      <span style={{ fontWeight: item.read ? 400 : 600 }}>{item.title}</span>
                    </Space>
                    <div style={{ marginTop: 8 }}>
                      <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>{item.body}</p>
                      {!item.read && (
                        <Button
                          type="link"
                          size="small"
                          style={{ paddingLeft: 0, marginTop: 8 }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await fetch("/api/notifications", {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ id: item.id }),
                            });
                            load();
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(new Event("sxl-messages-updated"));
                            }
                          }}
                        >
                          标为已读
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </Space>
          )}
        </Spin>
      </Space>
    </AppShell>
  );
}
