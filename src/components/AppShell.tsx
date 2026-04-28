"use client";

import {
  BarChartOutlined,
  BellOutlined,
  CalendarOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Drawer, Layout, Menu, Modal, Space, Typography, theme } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DeptLogo } from "@/components/DeptLogo";
import { userRoleLabel } from "@/lib/role-label";

type Role = "ADMIN" | "MINISTER" | "MEMBER";
type Me = { id: string; username: string; displayName: string; role: Role; avatarUrl?: string | null };

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
  const [unreadMsg, setUnreadMsg] = useState(0);
  const [isMobileNav, setIsMobileNav] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupAnn, setPopupAnn] = useState<null | { id: string; title: string; body: string; images: { id: string; url: string }[] }>(null);

  const canManage = me?.role === "ADMIN" || me?.role === "MINISTER";

  const menuItems = useMemo(() => {
    const items: any[] = [
      {
        key: "/tasks",
        icon: <DashboardOutlined />,
        label: <Link href="/tasks">任务大厅</Link>,
      },
      {
        key: "/duty-and-meetings",
        icon: <CalendarOutlined />,
        label: <Link href="/duty-and-meetings">会议与值班</Link>,
      },
      {
        key: "/messages",
        icon: <BellOutlined />,
        label: (
          <Link href="/messages">
            <Badge dot={unreadMsg > 0} size="medium" offset={[4, 0]}>
              消息
            </Badge>
          </Link>
        ),
      },
      {
        key: "/profile",
        icon: <UserOutlined />,
        label: <Link href="/profile">个人主页</Link>,
      },
      {
        key: "/settings",
        icon: <SettingOutlined />,
        label: <Link href="/settings">设置</Link>,
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
  }, [canManage, me?.role, unreadMsg]);

  const selectedKeys = useMemo(() => {
    if (pathname.startsWith("/admin/users")) return ["/admin/users"];
    if (pathname.startsWith("/tasks")) return ["/tasks"];
    if (pathname.startsWith("/duty-and-meetings")) return ["/duty-and-meetings"];
    if (pathname.startsWith("/messages")) return ["/messages"];
    if (pathname.startsWith("/publish")) return ["/publish"];
    if (pathname.startsWith("/reports")) return ["/reports"];
    if (pathname.startsWith("/attendance")) return ["/attendance"];
    if (pathname.startsWith("/profile")) return ["/profile"];
    if (pathname.startsWith("/settings")) return ["/settings"];
    return ["/tasks"];
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/notifications", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { unreadCount: 0 }))
        .then((d: { unreadCount?: number }) => {
          if (!cancelled) setUnreadMsg(typeof d.unreadCount === "number" ? d.unreadCount : 0);
        })
        .catch(() => {
          if (!cancelled) setUnreadMsg(0);
        });
    }
    if (me) {
      load();
    }
    function onE() {
      load();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("sxl-messages-updated", onE);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("sxl-messages-updated", onE);
      }
    };
  }, [me]);

  // 与 JWT 中缓存可能不同步，始终以数据库 /api/me 为准（含管理员改姓名/头像后）
  useEffect(() => {
    if (initialMe) setMe(initialMe);
  }, [initialMe]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, d })))
      .then(({ ok, status, d }) => {
        if (cancelled) return;
        if (ok && d.user) {
          setMe(d.user);
          return;
        }
        // 未认证：始终退出到登录，避免仅凭 JWT 里旧姓名顶栏
        if (status === 401 || status === 403) {
          setMe(null);
          setTimeout(() => router.replace("/login"), 0);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // 仅网络/解析失败时不断线，保留首屏
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 每日首次进入：尝试弹出公告（站内）
  useEffect(() => {
    const dayKey = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    })();
    const k = "sxl-ann-popup-day";
    try {
      const last = window.localStorage.getItem(k);
      if (last === dayKey) return;
      window.localStorage.setItem(k, dayKey);
    } catch {
      // localStorage 不可用也不阻断
    }
    fetch("/api/announcements/popup", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.announcement) return;
        setPopupAnn(d.announcement);
        setPopupOpen(true);
      })
      .catch(() => {});
  }, []);

  // 个人主页修改头像/密码后刷新顶栏
  useEffect(() => {
    const onProfile = () => {
      fetch("/api/me")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setMe(d.user ?? null))
        .catch(() => {});
    };
    window.addEventListener("sxl-profile-updated", onProfile);
    return () => window.removeEventListener("sxl-profile-updated", onProfile);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Sider
        breakpoint="md"
        onBreakpoint={(broken) => {
          setIsMobileNav(broken);
          if (broken) {
            setCollapsed(true);
            setMobileNavOpen(false);
          }
        }}
        collapsible={!isMobileNav}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsedWidth={isMobileNav ? 0 : 80}
        trigger={isMobileNav ? null : undefined}
        width={220}
        style={{ background: token.colorBgContainer }}
      >
        <div style={{ padding: 16, borderBottom: `1px solid ${token.colorSplit}` }}>
          <Space size={10}>
            <DeptLogo size={28} />
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            {isMobileNav ? (
              <Button
                aria-label="打开菜单"
                icon={<MenuOutlined />}
                onClick={() => setMobileNavOpen(true)}
              />
            ) : null}
            <Typography.Title
              level={4}
              style={{
                margin: 0,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title ?? " "}
            </Typography.Title>
          </div>

          <Space>
            <Space size={8}>
              <Avatar src={me?.avatarUrl || undefined} style={{ background: token.colorPrimary }}>
                {!me?.avatarUrl ? (me?.displayName || "U").slice(0, 1) : null}
              </Avatar>
              {!isMobileNav ? (
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 600 }}>{me?.displayName ?? "加载中..."}</div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    {userRoleLabel(me?.role)}
                  </div>
                </div>
              ) : null}
            </Space>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              {isMobileNav ? null : "退出"}
            </Button>
          </Space>
        </Header>

        <Content style={{ padding: isMobileNav ? 12 : 16 }}>
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

      <Drawer
        title={
          <Space size={10}>
            <DeptLogo size={28} />
            <div style={{ lineHeight: 1.15 }}>
              <Typography.Text strong style={{ display: "block" }}>
                干事考勤系统
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                宣传部
              </Typography.Text>
            </div>
          </Space>
        }
        placement="left"
        width={240}
        open={isMobileNav && mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        bodyStyle={{ padding: 0 }}
      >
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={menuItems}
          onClick={() => setMobileNavOpen(false)}
          style={{ borderRight: 0 }}
        />
      </Drawer>

      <Modal
        title={popupAnn?.title ?? "通知"}
        open={popupOpen}
        onCancel={() => setPopupOpen(false)}
        okText="查看详情"
        cancelText="我知道了"
        onOk={() => {
          if (!popupAnn?.id) return setPopupOpen(false);
          setPopupOpen(false);
          router.push(`/announcements/${encodeURIComponent(popupAnn.id)}`);
        }}
      >
        {popupAnn ? (
          <div>
            <div style={{ whiteSpace: "pre-wrap" }}>{popupAnn.body}</div>
            {popupAnn.images?.length ? (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {popupAnn.images.slice(0, 6).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.url}
                    alt="通知图片"
                    style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8 }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </Layout>
  );
}

