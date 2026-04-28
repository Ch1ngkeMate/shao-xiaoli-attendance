"use client";

import AppShell from "@/components/AppShell";
import { message } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import ProfileView, { type AttendanceRow, type ProfileUser } from "./profile-view";

export default function ProfilePage() {
  const [me, setMe] = useState<ProfileUser | null>(null);
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [bg, setBg] = useState("");

  const loadMe = useCallback(async () => {
    setLoadingMe(true);
    try {
      const res = await fetch("/api/me");
      const data = (await res.json().catch(() => ({}))) as { user?: (ProfileUser & { profileBgUrl?: string | null }) | null };
      if (!res.ok || !data.user) {
        message.error("加载用户信息失败");
        return;
      }
      setMe(data.user);
      setBg(String(data.user.profileBgUrl ?? "").trim());
    } finally {
      setLoadingMe(false);
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    setLoadingAtt(true);
    try {
      const res = await fetch(`/api/me/attendance?month=${encodeURIComponent(month)}`);
      const data = (await res.json().catch(() => ({}))) as { row?: AttendanceRow; message?: string };
      if (!res.ok) {
        message.error(data.message || "加载考勤失败");
        setAttendance(null);
        return;
      }
      setAttendance(data.row ?? null);
    } finally {
      setLoadingAtt(false);
    }
  }, [month]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    const onBg = () => {
      // 通过 /api/me 最新数据同步背景（跨设备/跨标签页一致）
      void loadMe();
    };
    window.addEventListener("sxl-profile-bg-updated", onBg);
    return () => window.removeEventListener("sxl-profile-bg-updated", onBg);
  }, [loadMe]);

  useEffect(() => {
    if (!me) return;
    void loadAttendance();
  }, [me, loadAttendance]);

  return (
    <AppShell title="个人主页">
      <ProfileView
        mode="self"
        displayUser={me}
        loadingUser={loadingMe}
        attendance={attendance}
        loadingAttendance={loadingAtt}
        month={month}
        onMonthChange={setMonth}
        onSelfUserUpdated={setMe}
        coverBgUrl={bg || null}
      />
    </AppShell>
  );
}
