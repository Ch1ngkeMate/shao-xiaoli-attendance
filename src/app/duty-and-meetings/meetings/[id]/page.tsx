"use client";

import AppShell from "@/components/AppShell";
import { Button, Card, Checkbox, Descriptions, Space, Tag, Typography, message } from "antd";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";

type Member = { id: string; displayName: string; username: string; avatarUrl: string | null };
type Meeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  place: string | null;
  description: string | null;
  status: "OPEN" | "ENDED";
  publisher: { displayName: string };
};

type LeaveI = { id: string; userId: string; status: string; user?: { displayName: string } | null };

export default function MeetingDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [m, setM] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [leaves, setLeaves] = useState<LeaveI[]>([]);
  const [abs, setAbs] = useState<{ userId: string; amount: number; reason: string }[]>([]);
  const [absent, setAbsent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isMgr = me?.role === "ADMIN" || me?.role === "MINISTER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await fetch("/api/me", { cache: "no-store" });
      const uj = (await u.json().catch(() => ({}))) as { user?: { role: string } };
      if (u.ok && uj.user) setMe({ role: uj.user.role });

      const r = await fetch(`/api/meetings/${id}`);
      const d = (await r.json().catch(() => ({}))) as {
        message?: string;
        meeting?: Meeting;
        members?: Member[];
        leaves?: { id: string; userId: string; status: string; user: { displayName: string } }[];
        absences?: { userId: string; amount: number; reason: string }[];
      };
      if (!r.ok) {
        message.error(d.message || "加载失败");
        return;
      }
      if (d.meeting) {
        setM(d.meeting);
        setMembers(d.members ?? []);
        setLeaves((d.leaves as LeaveI[]) ?? []);
        setAbs(d.absences ?? []);
        // 部长勾选「旷会」者；未勾选表示默认到场/准假/不论（仅勾选者扣 -1 且已准假禁选）
        if (d.meeting.status === "OPEN") {
          setAbsent([]);
        } else {
          setAbsent((d.absences ?? []).map((a) => a.userId));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  // 必须在所有 early return 之前调用，避免 Hook 顺序变化
  const approved = useMemo(
    () => new Set(leaves.filter((l) => l.status === "APPROVED").map((l) => l.userId)),
    [leaves],
  );
  const nameBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const me of members) map.set(me.id, me.displayName);
    return map;
  }, [members]);

  const options = useMemo(
    () =>
      members.map((u) => ({
        label: `${u.displayName}${approved.has(u.id) ? "（已准假，不记旷会）" : ""}`,
        value: u.id,
        disabled: approved.has(u.id),
      })),
    [members, approved],
  );

  if (loading && !m) {
    return (
      <AppShell title="会议">
        <Typography.Text type="secondary">加载中…</Typography.Text>
      </AppShell>
    );
  }
  if (!m) {
    return (
      <AppShell title="会议">
        <Typography.Text>未找到</Typography.Text>
      </AppShell>
    );
  }

  return (
    <AppShell title={m.title}>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Button type="link" onClick={() => router.push("/duty-and-meetings")} style={{ padding: 0 }}>
          ← 返回
        </Button>
        <Card>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="时间">
              {dayjs(m.startTime).format("YYYY-MM-DD HH:mm")} {m.endTime ? `~ ${dayjs(m.endTime).format("HH:mm")}` : ""}
            </Descriptions.Item>
            <Descriptions.Item label="地点">{m.place || "未填"}</Descriptions.Item>
            <Descriptions.Item label="发布">{m.publisher.displayName}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {m.status === "OPEN" ? <Tag color="blue">未结束</Tag> : <Tag>已结束</Tag>}
            </Descriptions.Item>
            {m.description && <Descriptions.Item label="说明">{m.description}</Descriptions.Item>}
          </Descriptions>
        </Card>

        {m.status === "OPEN" && isMgr && (
          <Card title="关会前：勾选未到场、且未准假的部员为「旷会」" size="small">
            <p style={{ marginTop: 0, color: "#666" }}>
              部员中已准假的不必勾选（已禁选）。结束后每人扣 1 分，记入当月其他分。若无人旷会，请勿勾选，直接点结束会议。
            </p>
            <Checkbox.Group
              value={absent}
              onChange={(v) => setAbsent(v as string[])}
              options={options}
            />
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                loading={saving}
                onClick={async () => {
                  // 从全员中，凡未准假但未被勾为旷会的=到场；我们提交「旷会」id 列表
                  setSaving(true);
                  try {
                    const realAbsent = absent.filter((uid) => !approved.has(uid));
                    const res = await fetch(`/api/meetings/${id}`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ action: "end", absentUserIds: realAbsent }),
                    });
                    const d = (await res.json().catch(() => ({}))) as { message?: string };
                    if (!res.ok) return message.error(d.message || "操作失败");
                    message.success("会议已结束，已记录旷会扣分");
                    load();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                结束会议并记录考勤
              </Button>
            </div>
          </Card>
        )}

        {m.status === "ENDED" && abs.length > 0 && (
          <Card title="旷会已记录" size="small">
            {abs.map((a) => (
              <div key={a.userId} style={{ marginBottom: 4 }}>
                {nameBy.get(a.userId) ?? a.userId}：{a.amount} 分
              </div>
            ))}
          </Card>
        )}

        <Card title="与本会相关的请假" size="small">
          {leaves.length === 0
            ? "无"
            : leaves.map((l) => (
                <div key={l.id}>
                  {l.user?.displayName} — {l.status}
                </div>
              ))}
        </Card>
      </Space>
    </AppShell>
  );
}
