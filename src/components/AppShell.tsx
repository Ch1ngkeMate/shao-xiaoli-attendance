"use client";

import { BarChartOutlined, DashboardOutlined, LogoutOutlined, TeamOutlined, UploadOutlined } from "@ant-design/icons";
import { Avatar, Button, Layout, Menu, Space, Typography, theme } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type Role = "ADMIN" | "MINISTER" | "MEMBER";
type Me = { id: string; username: string; displayName: string; role: Role };

type Props = {
  title?: string;
  initialMe?: Me | null;
  children: React.ReactNode;
};

const { Header, Sider, Content } = Layout;

export default function AppShell({ title, initialMe, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = theme.useToken();

  // initialMe 为 null 时仍需拉取；仅当传入完整用户对象时视为“已由父级提供”
  const [me, setMe] = useState<Me | null>(initialMe ?? null);
  const [collapsed, setCollapsed] = useState(false);

  const canManage = me?.role === "ADMIN" || me?.role === "MINISTER";

  const menuItems = useMemo(() => {
    const items: any[] = [
      {
        key: "/tasks",
        icon: <DashboardOutlined />,
        label: <Link href="/tasks">任务大厅</Link>,
      },
    ];
    if (canManage) {
      items.push(
        {
          key: "/publish",
          icon: <UploadOutlined />,
          label: <Link href="/publish">发布任务</Link>,
        },
        {
          key: "/reports",
          icon: <BarChartOutlined />,
          label: <Link href="/reports">月报</Link>,
        },
        {
          key: "/attendance",
          icon: <TeamOutlined />,
          label: <Link href="/attendance">部员考勤</Link>,
        },
      );
    }
    if (me?.role === "ADMIN") {
      items.push({
        key: "/admin/users",
        icon: <TeamOutlined />,
        label: <Link href="/admin/users">账号管理</Link>,
      });
    }
    return items;
  }, [canManage, me?.role]);

  const selectedKeys = useMemo(() => {
    if (pathname.startsWith("/admin/users")) return ["/admin/users"];
    if (pathname.startsWith("/tasks")) return ["/tasks"];
    if (pathname.startsWith("/publish")) return ["/publish"];
    if (pathname.startsWith("/reports")) return ["/reports"];
    if (pathname.startsWith("/attendance")) return ["/attendance"];
    return ["/tasks"];
  }, [pathname]);

  // 父组件异步加载到用户后同步到本壳
  useEffect(() => {
    if (initialMe) setMe(initialMe);
  }, [initialMe]);

  useEffect(() => {
    if (initialMe) return;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMe(d.user ?? null))
      .catch(() => {
        // 避免在路由尚未初始化（开发热更新时可能发生）就触发 replace 导致卡死
        setTimeout(() => router.replace("/login"), 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={{ background: token.colorBgContainer }}
      >
        <div style={{ padding: 16, borderBottom: `1px solid ${token.colorSplit}` }}>
          <Space size={10}>
            <Image
              src="/dept-logo.png"
              alt="部门 Logo"
              width={28}
              height={28}
              style={{ borderRadius: 8, background: "#fff" }}
              priority
            />
            <div style={{ lineHeight: 1.15 }}>
              <Typography.Text strong style={{ display: "block" }}>
                干事考勤系统
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                宣传部
              </Typography.Text>
            </div>
          </Space>
        </div>
        <Menu mode="inline" selectedKeys={selectedKeys} items={menuItems} style={{ borderRight: 0 }} />
      </Sider>

      <Layout>
        <Header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorSplit}`,
          }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title ?? " "}
          </Typography.Title>

          <Space>
            <Space size={8}>
              <Avatar style={{ background: token.colorPrimary }}>
                {(me?.displayName || "U").slice(0, 1)}
              </Avatar>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600 }}>{me?.displayName ?? "加载中..."}</div>
                <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                  {me?.role ?? ""}
                </div>
              </div>
            </Space>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              退出
            </Button>
          </Space>
        </Header>

        <Content style={{ padding: 16 }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
            }}
          >
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

