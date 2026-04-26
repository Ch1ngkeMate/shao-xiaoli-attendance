"use client";

import AppShell from "@/components/AppShell";
import { Button, Result, Space, message } from "antd";
import dayjs from "dayjs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ProfileView, { type AttendanceRow, type ProfileUser } from "../profile-view";

export default function OtherUserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const raw = params.userId;
  const targetId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";

  const [viewer, setViewer] = useState<ProfileUser | null>(null);
  const [target, setTarget] = useState<ProfileUser | null>(null);
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [loadingViewer, setLoadingViewer] = useState(true);
  const [loadingPeek, setLoadingPeek] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const loadViewer = useCallback(async () => {
    setLoadingViewer(true);
    try {
      const res = await fetch("/api/me");
      const data = (await res.json().catch(() => ({}))) as { user?: ProfileUser };
      if (!res.ok || !data.user) {
        setViewer(null);
        return;
      }
      setViewer(data.user);
    } finally {
      setLoadingViewer(false);
    }
  }, []);

  const loadPeek = useCallback(async () => {
    if (!targetId) return;
    setLoadingPeek(true);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(targetId)}/profile?month=${encodeURIComponent(month)}`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        user?: ProfileUser & { isActive?: boolean };
        row?: AttendanceRow | null;
        message?: string;
      };
      if (!res.ok) {
        message.error(data.message || "加载失败");
        setTarget(null);
        setAttendance(null);
        return;
      }
      if (data.user) setTarget(data.user);
      setAttendance(data.row ?? null);
    } finally {
      setLoadingPeek(false);
    }
  }, [targetId, month]);

  useEffect(() => {
    void loadViewer();
  }, [loadViewer]);

  useEffect(() => {
    if (loadingViewer) return;
    if (!viewer) {
      router.replace(`/login?next=${encodeURIComponent(`/profile/${targetId}`)}`);
    }
  }, [loadingViewer, viewer, router, targetId]);

  useEffect(() => {
    if (loadingViewer || !viewer || !targetId) return;
    if (viewer.role !== "ADMIN" && viewer.role !== "MINISTER") {
      setForbidden(true);
      return;
    }
    if (viewer.id === targetId) {
      router.replace("/profile");
      return;
    }
    setForbidden(false);
    void loadPeek();
  }, [loadingViewer, viewer, targetId, month, loadPeek, router]);

  if (!targetId) {
    return (
      <AppShell title="成员主页">
        <Result status="404" title="无效链接" subTitle="缺少用户标识。" />
      </AppShell>
    );
  }

  if (!loadingViewer && forbidden) {
    return (
      <AppShell title="成员主页">
        <Result
          status="403"
          title="无权限"
          subTitle="仅部长或管理员可查看他人个人主页。"
          extra={
            <Link href="/tasks">
              <Button type="primary">返回</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  if (!loadingViewer && !viewer) {
    return (
      <AppShell title="成员主页">
        <div style={{ padding: 48, textAlign: "center" }}>正在跳转登录…</div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`成员主页${target ? ` · ${target.displayName}` : ""}`}>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Link href="/tasks">← 返回任务列表</Link>
        <ProfileView
          mode="peek"
          displayUser={target}
          loadingUser={loadingViewer || (loadingPeek && !target)}
          attendance={attendance}
          loadingAttendance={loadingPeek}
          month={month}
          onMonthChange={setMonth}
        />
      </Space>
    </AppShell>
  );
}
