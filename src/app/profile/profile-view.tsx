"use client";

import {
  Alert,
  Avatar,
  Button,
  Card,
  DatePicker,
  Form,
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
  } = props;

  const [pwdForm] = Form.useForm<{ currentPassword: string; newPassword: string; confirm: string }>();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

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

  async function onPasswordFinish(values: { currentPassword: string; newPassword: string; confirm: string }) {
    if (values.newPassword !== values.confirm) {
      message.error("两次输入的新密码不一致");
      return;
    }
    setPwdSubmitting(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        message.error(data.message || "修改失败");
        return;
      }
      message.success("密码已更新");
      pwdForm.resetFields();
      window.dispatchEvent(new Event("sxl-profile-updated"));
    } finally {
      setPwdSubmitting(false);
    }
  }

  const inactivePeek = mode === "peek" && displayUser && displayUser.isActive === false;

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {mode === "peek" && (
        <Alert type="info" showIcon title="您正以管理人员身份查看成员主页（只读），不含对方密码等敏感操作入口。" />
      )}

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
              {mode === "self" && (
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

      {mode === "self" && (
        <Card title="修改密码">
          <Form
            form={pwdForm}
            layout="vertical"
            onFinish={onPasswordFinish}
            style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}
          >
            <Form.Item
              label="当前密码"
              name="currentPassword"
              rules={[{ required: true, message: "请输入当前密码" }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="newPassword"
              rules={[{ required: true, message: "请输入新密码" }, { min: 6, message: "至少 6 位" }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              label="确认新密码"
              name="confirm"
              rules={[{ required: true, message: "请再次输入新密码" }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={pwdSubmitting}>
                保存新密码
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}
    </Space>
  );
}
