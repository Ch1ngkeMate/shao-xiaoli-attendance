"use client";

import Image from "next/image";
import { Button, Card, Form, Input, Space, Typography, message } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

type LoginForm = {
  username: string;
  password: string;
};

function LoginFormInner() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") || "/";

  const [form] = Form.useForm<LoginForm>();

  async function onFinish(values: LoginForm) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      message.error(data.message || "登录失败");
      return;
    }
    message.success("登录成功");
    router.replace(nextPath);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#f5f5f5",
      }}
    >
      <Card style={{ width: "min(420px, 100%)" }}>
        <Space size={12} style={{ marginBottom: 12 }}>
          <Image
            src="/dept-logo.png"
            alt="部门 Logo"
            width={40}
            height={40}
            style={{ borderRadius: 12, background: "#fff" }}
            priority
          />
          <div>
            <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 0 }}>
              干事考勤系统
            </Typography.Title>
            <Typography.Text type="secondary">宣传部</Typography.Text>
          </div>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          陕西中医药大学邵小利志愿服务队·宣传部
        </Typography.Paragraph>

        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            label="账号"
            name="username"
            rules={[{ required: true, message: "请输入账号" }]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "#f5f5f5",
          }}
        >
          <Card style={{ width: "min(420px, 100%)" }}>
            <Typography.Text type="secondary">加载中…</Typography.Text>
          </Card>
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}

