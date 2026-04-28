"use client";

import AppShell from "@/components/AppShell";
import { Button, Card, Space, Spin, Typography, message } from "antd";
import dayjs from "dayjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Msg = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  announcementId?: string | null;
};

export default function MessageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const raw = params.id;
  const id = useMemo(() => (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : ""), [raw]);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<Msg | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})))
      .then((d: any) => {
        if (d?.user?.role) setMeRole(String(d.user.role));
      })
      .catch(() => {});
  }, []);
  const canManage = meRole === "ADMIN" || meRole === "MINISTER";

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/notifications/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        if (cancelled) return;
        if (status === 401 || status === 403) {
          router.replace(`/login?next=${encodeURIComponent(`/messages/${id}`)}`);
          return;
        }
        if (!ok) {
          message.error(d?.message || "加载失败");
          setItem(null);
          return;
        }
        const msgItem = d?.messageItem as Msg | undefined;
        if (!msgItem) {
          message.error("加载失败");
          setItem(null);
          return;
        }
        // 如果后端已有关联公告，则直接跳公告详情
        if (msgItem.type === "ANNOUNCEMENT" && msgItem.announcementId) {
          router.replace(`/announcements/${encodeURIComponent(msgItem.announcementId)}`);
          return;
        }
        setItem(msgItem);
        window.dispatchEvent(new Event("sxl-messages-updated"));
      })
      .catch(() => {
        if (!cancelled) message.error("网络错误");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <AppShell title="消息详情">
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Link href="/messages">← 返回消息列表</Link>
        <Spin spinning={loading}>
          {item && item.type === "ANNOUNCEMENT" && !item.announcementId ? (
            <Card size="small">
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Typography.Text type="secondary">
                  这是旧版本公告（仅消息记录），暂不支持图片与已读统计。
                </Typography.Text>
                {canManage ? (
                  <Button
                    type="primary"
                    onClick={async () => {
                      const res = await fetch("/api/announcements/upgrade", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ messageId: item.id }),
                      });
                      const d = (await res.json().catch(() => ({}))) as any;
                      if (!res.ok || !d?.announcementId) {
                        message.error(d?.message || "升级失败");
                        return;
                      }
                      message.success(d.upgraded ? `已升级（关联 ${d.affected ?? 0} 条消息）` : "已关联公告");
                      router.replace(`/announcements/${encodeURIComponent(String(d.announcementId))}`);
                    }}
                  >
                    升级为公告详情（支持已读统计）
                  </Button>
                ) : (
                  <Typography.Text type="secondary">仅部长/管理员可升级</Typography.Text>
                )}
              </Space>
            </Card>
          ) : null}
          <Card>
            {item ? (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {item.title}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}
                </Typography.Text>
                <div style={{ whiteSpace: "pre-wrap" }}>{item.body}</div>
                <div>
                  <Button onClick={() => router.replace("/messages")}>返回</Button>
                </div>
              </Space>
            ) : (
              <Typography.Text type="secondary">暂无内容</Typography.Text>
            )}
          </Card>
        </Spin>
      </Space>
    </AppShell>
  );
}

