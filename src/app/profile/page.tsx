"use client";

import AppShell from "@/components/AppShell";
import { message } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import ProfileView, { type AttendanceRow, type ProfileUser } from "./profile-view";

function bgKey(userId: string) {
  return `sxl-profile-bg:${userId}`;
}

function readBg(userId: string) {
  try {
    return window.localStorage.getItem(bgKey(userId)) ?? "";
  } catch {
    return "";
  }
}

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
      const data = (await res.json().catch(() => ({}))) as { user?: ProfileUser };
      if (!res.ok || !data.user) {
        message.error("加载用户信息失败");
        return;
      }
      setMe(data.user);
      setBg(readBg(data.user.id));
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
      if (!me?.id) return;
      setBg(readBg(me.id));
    };
    window.addEventListener("sxl-profile-bg-updated", onBg);
    return () => window.removeEventListener("sxl-profile-bg-updated", onBg);
  }, [me?.id]);

  useEffect(() => {
    if (!me) return;
    void loadAttendance();
  }, [me, loadAttendance]);

  return (
    <AppShell title="个人主页">
      <div
        style={{
          borderRadius: 14,
          overflow: "hidden",
          background: bg ? `center / cover no-repeat url(${bg})` : undefined,
          border: bg ? "1px solid var(--ant-color-border, #f0f0f0)" : undefined,
        }}
      >
        {bg ? <div style={{ height: 120, background: "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0))" }} /> : null}
        <div style={{ padding: bg ? 12 : 0 }}>
          <ProfileView
            mode="self"
            displayUser={me}
            loadingUser={loadingMe}
            attendance={attendance}
            loadingAttendance={loadingAtt}
            month={month}
            onMonthChange={setMonth}
            onSelfUserUpdated={setMe}
          />
        </div>
      </div>
    </AppShell>
  );
}
