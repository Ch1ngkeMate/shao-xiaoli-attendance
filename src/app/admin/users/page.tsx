"use client";

import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import { ADMIN_BULK_RESET_PASSWORD } from "@/lib/admin-default-password";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { AdminProfilePeekAvatar } from "@/components/AdminProfilePeekAvatar";

type Role = "ADMIN" | "MINISTER" | "MEMBER";

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  avatarUrl: string | null;
};

type CreateUserForm = {
  username: string;
  displayName: string;
  role: Role;
  password: string;
};

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpenFor, setResetOpenFor] = useState<UserRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [createForm] = Form.useForm<CreateUserForm>();
  const [resetForm] = Form.useForm<{ password: string }>();
  const [editOpenFor, setEditOpenFor] = useState<UserRow | null>(null);
  const [editForm] = Form.useForm<{
    username: string;
    displayName: string;
    newPassword: string;
  }>();
  const [editLoading, setEditLoading] = useState(false);
  const [resetTasksOpen, setResetTasksOpen] = useState(false);
  const [resetTasksInput, setResetTasksInput] = useState("");
  const [resetTasksLoading, setResetTasksLoading] = useState(false);

  const columns: ColumnsType<UserRow> = useMemo(
    () => [
      {
        title: "姓名",
        dataIndex: "displayName",
        render: (_: string, record: UserRow) => (
          <Space size={8}>
            <AdminProfilePeekAvatar
              viewerRole="ADMIN"
              targetUserId={record.id}
              size={28}
              src={record.avatarUrl}
              displayName={record.displayName}
            />
            <span>{record.displayName}</span>
          </Space>
        ),
      },
      { title: "账号", dataIndex: "username" },
      {
        title: "角色",
        dataIndex: "role",
        render: (role: Role, record) => (
          <Select<Role>
            value={role}
            style={{ width: 140 }}
            onChange={(v) => patch(record.id, { role: v })}
            options={[
              { value: "ADMIN", label: "管理员" },
              { value: "MINISTER", label: "部长" },
              { value: "MEMBER", label: "部员" },
            ]}
          />
        ),
      },
      {
        title: "启用",
        dataIndex: "isActive",
        render: (v: boolean, record) => (
          <Switch checked={v} onChange={(checked) => patch(record.id, { isActive: checked })} />
        ),
      },
      {
        title: "操作",
        render: (_: unknown, record) => (
          <Space wrap>
            <Button
              onClick={() => {
                setEditOpenFor(record);
                editForm.setFieldsValue({
                  username: record.username,
                  displayName: record.displayName,
                  newPassword: "",
                });
              }}
            >
              编辑账号
            </Button>
            <Button onClick={() => setResetOpenFor(record)}>重置密码</Button>
          </Space>
        ),
      },
    ],
    [],
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "加载失败");
        return;
      }
      setRows(data.users);
    } finally {
      setLoading(false);
    }
  }

  async function create(values: CreateUserForm) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "创建失败");
        return;
      }
      message.success("创建成功");
      setCreateOpen(false);
      createForm.resetFields();
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function patch(id: string, partial: any) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      message.error(data.message || "更新失败");
      return;
    }
    setRows((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
  }

  async function resetAllPasswords() {
    setBulkResetting(true);
    try {
      const res = await fetch("/api/admin/users/reset-all-passwords", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "重置失败");
        return;
      }
      message.success(
        `已将全部 ${data.updated} 个账号的密码重置为：${data.passwordPlain}（请通知全员尽快登录修改）`,
        8,
      );
    } finally {
      setBulkResetting(false);
    }
  }

  async function resetPassword(password: string) {
    if (!resetOpenFor) return;
    const res = await fetch(`/api/admin/users/${resetOpenFor.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resetPassword: password }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      message.error(data.message || "重置失败");
      return;
    }
    message.success("已重置密码");
    setResetOpenFor(null);
    resetForm.resetFields();
  }

  async function submitAccountEdit(values: { username: string; displayName: string; newPassword: string }) {
    if (!editOpenFor) return;
    setEditLoading(true);
    try {
      const body: { username: string; displayName: string; resetPassword?: string } = {
        username: values.username.trim(),
        displayName: values.displayName.trim(),
      };
      const pwd = values.newPassword?.trim();
      if (pwd) body.resetPassword = pwd;
      const res = await fetch(`/api/admin/users/${editOpenFor.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: UserRow; message?: string };
      if (!res.ok) {
        message.error(data.message || "保存失败");
        return;
      }
      if (data.user) {
        setRows((prev) => prev.map((u) => (u.id === editOpenFor.id ? { ...u, ...data.user! } : u)));
      }
      message.success(pwd ? "已更新账号，密码已修改" : "已更新账号与姓名");
      setEditOpenFor(null);
    } finally {
      setEditLoading(false);
    }
  }

  async function deleteAllTasks() {
    if (resetTasksInput !== "DELETE_ALL_TASKS") {
      message.error("请输入大写：DELETE_ALL_TASKS");
      return;
    }
    setResetTasksLoading(true);
    try {
      const res = await fetch("/api/admin/tasks/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL_TASKS" }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; deleted?: number };
      if (!res.ok) {
        message.error(data.message || "操作失败");
        return;
      }
      message.success(`已清空 ${data.deleted ?? 0} 条任务记录（含接取/提交/审核/图片/时间段等）`);
      setResetTasksOpen(false);
      setResetTasksInput("");
    } finally {
      setResetTasksLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell title="账号管理">
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Card>
          <Space wrap>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              新建账号
            </Button>
            <Button onClick={load} loading={loading}>
              刷新
            </Button>
            <Popconfirm
              title="确认全员重置密码？"
              description={`所有账号（含管理员）密码将变为：${ADMIN_BULK_RESET_PASSWORD}，操作不可撤销。`}
              okText="确认重置"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={resetAllPasswords}
            >
              <Button danger loading={bulkResetting}>
                全员密码重置为 {ADMIN_BULK_RESET_PASSWORD}
              </Button>
            </Popconfirm>
            <Upload
              accept=".csv"
              beforeUpload={async (file) => {
                try {
                  setImporting(true);
                  const fd = new FormData();
                  fd.append("file", file);
                  const res = await fetch("/api/admin/users/import", {
                    method: "POST",
                    body: fd,
                  });
                  const data = (await res.json().catch(() => ({}))) as any;
                  if (!res.ok) {
                    message.error(data.message || "导入失败");
                    return false;
                  }
                  const base = `导入完成：新增 ${data.created}，更新 ${data.updated}，跳过 ${data.skipped}`;
                  if (Array.isArray(data.hints) && data.hints.length > 0) {
                    message.warning(`${base}。部分行原因：${data.hints.join("；")}`);
                  } else {
                    message.success(base);
                  }
                  await load();
                  return false;
                } finally {
                  setImporting(false);
                }
              }}
              showUploadList={false}
            >
              <Button loading={importing}>导入账号（CSV）</Button>
            </Upload>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            第一行表头可用英文
            <code>username, displayName, role, password</code> 或中文
            <code>账号、姓名、身份、密码</code>。Excel 中可只占 A 列；推荐另存为
            <strong>CSV UTF-8（逗号分隔）</strong>。若误存为普通「CSV(逗号分隔)」（GBK），服务端也会尽量自动识别。
            角色可写
            <code>MINISTER</code>/<code>MEMBER</code> 或 <code>部长</code>/<code>部员(干事)</code>。
          </Typography.Paragraph>
        </Card>

        <Card title="任务库" style={{ borderColor: "#ffccc7" }}>
          <Space orientation="vertical">
            <Typography.Text type="danger">危险操作：将删除系统内所有任务及接取、提交、审核、任务图片、时间段等关联数据。账号不删。不可恢复。</Typography.Text>
            <Button danger onClick={() => setResetTasksOpen(true)}>
              清空任务库…
            </Button>
          </Space>
        </Card>

        <Card>
          <Table<UserRow> rowKey="id" columns={columns} dataSource={rows} loading={loading} scroll={{ x: "max-content" }} />
        </Card>

        <Modal
          title="新建账号"
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={() => createForm.submit()}
          okText="创建"
          confirmLoading={loading}
          forceRender
          destroyOnHidden={false}
        >
          <Form form={createForm} layout="vertical" onFinish={create} initialValues={{ role: "MEMBER" }}>
            <Form.Item label="账号" name="username" rules={[{ required: true, message: "请输入账号" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="姓名" name="displayName" rules={[{ required: true, message: "请输入姓名" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="角色" name="role" rules={[{ required: true, message: "请选择角色" }]}>
              <Select
                options={[
                  { value: "ADMIN", label: "管理员" },
                  { value: "MINISTER", label: "部长" },
                  { value: "MEMBER", label: "部员" },
                ]}
              />
            </Form.Item>
            <Form.Item label="初始密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title={`重置密码：${resetOpenFor?.displayName ?? ""}`}
          open={!!resetOpenFor}
          onCancel={() => setResetOpenFor(null)}
          onOk={() => resetForm.submit()}
          okText="重置"
          forceRender
          destroyOnHidden={false}
        >
          <Form
            form={resetForm}
            layout="vertical"
            onFinish={(v) => resetPassword(v.password)}
          >
            <Form.Item
              label="新密码"
              name="password"
              rules={[{ required: true, message: "请输入新密码" }, { min: 6, message: "至少 6 位" }]}
            >
              <Input.Password />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="清空全部任务"
          open={resetTasksOpen}
          onCancel={() => {
            setResetTasksOpen(false);
            setResetTasksInput("");
          }}
          onOk={deleteAllTasks}
          okText="确认永久删除"
          okButtonProps={{ danger: true, loading: resetTasksLoading }}
        >
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <p>在下方框内输入大写 <code>DELETE_ALL_TASKS</code> 后点确认。</p>
            <Input
              value={resetTasksInput}
              onChange={(e) => setResetTasksInput(e.target.value)}
              placeholder="DELETE_ALL_TASKS"
              autoComplete="off"
            />
          </Space>
        </Modal>

        <Modal
          title={`编辑账号：${editOpenFor?.displayName ?? ""}`}
          open={!!editOpenFor}
          onCancel={() => setEditOpenFor(null)}
          onOk={() => editForm.submit()}
          okText="保存"
          confirmLoading={editLoading}
          width={480}
          forceRender
          destroyOnHidden={false}
        >
          <Form form={editForm} layout="vertical" onFinish={submitAccountEdit}>
            <Form.Item
              label="登录账号"
              name="username"
              rules={[{ required: true, message: "请输入登录账号" }]}
            >
              <Input autoComplete="off" placeholder="用于登录的用户名" />
            </Form.Item>
            <Form.Item
              label="姓名"
              name="displayName"
              rules={[{ required: true, message: "请输入姓名" }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="newPassword"
              extra="不填则保持原密码不变；填写则至少 6 位"
              rules={[
                {
                  validator: async (_, v) => {
                    const s = (v as string | undefined) ? String(v).trim() : "";
                    if (s.length === 0) return;
                    if (s.length < 6) throw new Error("新密码至少 6 位");
                  },
                },
              ]}
            >
              <Input.Password autoComplete="new-password" placeholder="选填" />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </AppShell>
  );
}

