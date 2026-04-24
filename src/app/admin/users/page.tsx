"use client";

import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Role = "ADMIN" | "MINISTER" | "MEMBER";

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
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
  const [createForm] = Form.useForm<CreateUserForm>();
  const [resetForm] = Form.useForm<{ password: string }>();

  const columns: ColumnsType<UserRow> = useMemo(
    () => [
      { title: "姓名", dataIndex: "displayName" },
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
          <Space>
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
            <code>账号、姓名、身份、密码</code>。Excel 中可只占 A 列，另存为
            <strong>CSV UTF-8（逗号分隔）</strong> 后上传；角色可写
            <code>MINISTER</code>/<code>MEMBER</code> 或 <code>部长</code>/<code>部员(干事)</code>。
          </Typography.Paragraph>
        </Card>

        <Card>
          <Table<UserRow> rowKey="id" columns={columns} dataSource={rows} loading={loading} />
        </Card>

        <Modal
          title="新建账号"
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={() => createForm.submit()}
          okText="创建"
          confirmLoading={loading}
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
      </Space>
    </AppShell>
  );
}

