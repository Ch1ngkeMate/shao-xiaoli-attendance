"use client";

import {
  Avatar,
  Button,
  Card,
  DatePicker,
  Form,
  Grid,
  Input,
  Space,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { MeetingAbsenceMonthlyEntry } from "@/lib/monthly-report";

export type ProfileRole = "ADMIN" | "MINISTER" | "MEMBER";

export type ProfileUser = {
  id: string;
  username: string;
  displayName: string;
  role: ProfileRole;
  avatarUrl: string | null;
  profileBgUrl?: string | null;
  /** 管理人员查看他人时由接口返回 */
  isActive?: boolean;
};

export type ApprovedTask = { taskId: string; title: string; points: number; reviewTime: string };

export type AttendanceRow = {
  userId: string;
  username: string;
  displayName: string;
  role: ProfileRole;
  claimCount: number;
  submitCount: number;
  approvedCount: number;
  approvedPoints: number;
  otherPoints: number;
  totalPoints: number;
  approvedTasks: ApprovedTask[];
  /** 例会旷会扣分明细（旧接口可能缺省，按空数组处理） */
  meetingAbsences?: MeetingAbsenceMonthlyEntry[];
};

function roleLabel(r: ProfileRole) {
  return r === "MEMBER" ? "部员" : r === "MINISTER" ? "部长" : "管理员";
}

type Props = {
  mode: "self" | "peek";
  displayUser: ProfileUser | null;
  loadingUser: boolean;
  attendance: AttendanceRow | null;
  loadingAttendance: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  /** 本人模式下头像保存成功后回写 */
  onSelfUserUpdated?: (u: ProfileUser) => void;
  /** 顶部大图封面背景（类似微信个人页） */
  coverBgUrl?: string | null;
};

export default function ProfileView(props: Props) {
  const {
    mode,
    displayUser,
    loadingUser,
    attendance,
    loadingAttendance,
    month,
    onMonthChange,
    onSelfUserUpdated,
    coverBgUrl,
  } = props;

  const [avatarUploading, setAvatarUploading] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const summaryColumns: ColumnsType<AttendanceRow> = useMemo(
    () => [
      { title: "接取(参考)", dataIndex: "claimCount", width: 110 },
      { title: "提交", dataIndex: "submitCount", width: 90 },
      { title: "确认完成", dataIndex: "approvedCount", width: 110 },
      { title: "任务分", dataIndex: "approvedPoints", width: 100 },
      { title: "其他分", dataIndex: "otherPoints", width: 100 },
      { title: "合计", dataIndex: "totalPoints", width: 100 },
    ],
    [],
  );

  async function saveAvatarUrl(url: string) {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatarUrl: url }),
    });
    const data = (await res.json().catch(() => ({}))) as { user?: ProfileUser; message?: string };
    if (!res.ok) {
      message.error(data.message || "保存头像失败");
      return;
    }
    if (!data.user) {
      message.error("保存成功但未返回用户信息，请刷新页面");
      return;
    }
    onSelfUserUpdated?.(data.user);
    message.success("头像已更新");
    window.dispatchEvent(new Event("sxl-profile-updated"));
  }

  const inactivePeek = mode === "peek" && displayUser && displayUser.isActive === false;

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {displayUser && coverBgUrl ? (
        <div
          style={{
            position: "relative",
            height: isMobile ? 220 : 260,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--ant-color-border, #f0f0f0)",
            background: `center / cover no-repeat url(${coverBgUrl})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.62))",
            }}
          />
          <div style={{ position: "absolute", left: 14, right: 14, bottom: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, minWidth: 0 }}>
                <Avatar
                  key={displayUser.avatarUrl ?? "no-avatar"}
                  size={isMobile ? 72 : 88}
                  src={displayUser.avatarUrl || undefined}
                  icon={<UserOutlined />}
                  style={{ border: "2px solid rgba(255,255,255,0.9)", flex: "0 0 auto" }}
                >
                  {!displayUser.avatarUrl ? displayUser.displayName.slice(0, 1) : null}
                </Avatar>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.96)",
                      fontWeight: 700,
                      fontSize: isMobile ? 18 : 22,
                      lineHeight: 1.2,
                      textShadow: "0 2px 10px rgba(0,0,0,0.35)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={displayUser.displayName}
                  >
                    {displayUser.displayName}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      color: "rgba(255,255,255,0.85)",
                      fontSize: 12,
                      textShadow: "0 2px 10px rgba(0,0,0,0.35)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={`${displayUser.username} · ${roleLabel(displayUser.role)}`}
                  >
                    {displayUser.username} · {roleLabel(displayUser.role)}
                    {mode === "peek" && displayUser.isActive === false ? "（已停用）" : ""}
                  </div>
                </div>
              </div>

              {mode === "self" ? (
                <Upload
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  showUploadList={false}
                  disabled={avatarUploading}
                  beforeUpload={async (file) => {
                    setAvatarUploading(true);
                    try {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
                      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
                      if (!res.ok || !data.url) {
                        message.error(data.message || "上传失败");
                        return false;
                      }
                      await saveAvatarUrl(data.url);
                      return false;
                    } finally {
                      setAvatarUploading(false);
                    }
                  }}
                >
                  <Button loading={avatarUploading}>更换头像</Button>
                </Upload>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <Card loading={loadingUser} title={mode === "self" ? "基本信息" : "成员基本信息"}>
        {displayUser && (
          <Space align="start" size={24} wrap>
            <Space orientation="vertical" align="center">
              <Avatar
                key={displayUser.avatarUrl ?? "no-avatar"}
                size={96}
                src={displayUser.avatarUrl || undefined}
                icon={<UserOutlined />}
              >
                {!displayUser.avatarUrl ? displayUser.displayName.slice(0, 1) : null}
              </Avatar>
              {mode === "self" && !coverBgUrl && (
                <Upload
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  showUploadList={false}
                  disabled={avatarUploading}
                  beforeUpload={async (file) => {
                    setAvatarUploading(true);
                    try {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
                      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
                      if (!res.ok || !data.url) {
                        message.error(data.message || "上传失败");
                        return false;
                      }
                      await saveAvatarUrl(data.url);
                      return false;
                    } finally {
                      setAvatarUploading(false);
                    }
                  }}
                >
                  <Button loading={avatarUploading}>更换头像</Button>
                </Upload>
              )}
            </Space>
            <div>
              <Typography.Paragraph style={{ marginBottom: 8 }}>
                <Typography.Text strong>姓名：</Typography.Text>
                {displayUser.displayName}
              </Typography.Paragraph>
              <Typography.Paragraph style={{ marginBottom: 8 }}>
                <Typography.Text strong>账号：</Typography.Text>
                {displayUser.username}
              </Typography.Paragraph>
              <Typography.Paragraph style={{ marginBottom: 0 }}>
                <Typography.Text strong>身份：</Typography.Text>
                {roleLabel(displayUser.role)}
                {mode === "peek" && displayUser.isActive === false ? (
                  <Typography.Text type="danger">（已停用）</Typography.Text>
                ) : null}
              </Typography.Paragraph>
            </div>
          </Space>
        )}
      </Card>

      <Card title={mode === "self" ? "我的考勤" : "成员考勤"}>
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <DatePicker
              picker="month"
              value={dayjs(month)}
              onChange={(v) => onMonthChange(v ? v.format("YYYY-MM") : dayjs().format("YYYY-MM"))}
            />
            <Typography.Text type="secondary" style={{ margin: 0, lineHeight: 1.5 }}>
              统计口径与「部员考勤」一致：接取为参考，部长确认通过的任务计任务分；例会旷会计入其他分并在下方单独列出。
            </Typography.Text>
          </div>
          {inactivePeek ? (
            <Typography.Text type="secondary">该账号已停用，不提供月度考勤统计。</Typography.Text>
          ) : attendance ? (
            <>
              <Table<AttendanceRow>
                size="small"
                pagination={false}
                rowKey="userId"
                loading={loadingAttendance}
                columns={summaryColumns}
                dataSource={[attendance]}
              />
              <Typography.Title level={5}>当月确认通过的任务</Typography.Title>
              {attendance.approvedTasks.length === 0 ? (
                <Typography.Text type="secondary">无</Typography.Text>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--ant-color-border, #f0f0f0)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {attendance.approvedTasks.map((t) => (
                    <div
                      key={t.taskId}
                      style={{ padding: "8px 12px", borderBottom: "1px solid var(--ant-color-border, #f0f0f0)" }}
                    >
                      {t.title}（{t.points} 分，确认时间：{dayjs(t.reviewTime).format("YYYY-MM-DD HH:mm")}）
                    </div>
                  ))}
                </div>
              )}
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                当月例会旷会
              </Typography.Title>
              {(attendance.meetingAbsences ?? []).length === 0 ? (
                <Typography.Text type="secondary">无</Typography.Text>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--ant-color-border, #f0f0f0)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {(attendance.meetingAbsences ?? []).map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--ant-color-border, #f0f0f0)",
                        color: "var(--ant-color-error, #ff4d4f)",
                      }}
                    >
                      {a.label}（{a.amount} 分，记录时间：{dayjs(a.recordedAt).format("YYYY-MM-DD HH:mm")}）
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : loadingAttendance ? null : mode === "peek" ? (
            <Typography.Text type="secondary">暂无考勤数据。</Typography.Text>
          ) : null}
        </Space>
      </Card>
    </Space>
  );
}
