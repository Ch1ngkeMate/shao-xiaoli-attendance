"use client";

import AppShell from "@/components/AppShell";
import { Button, Card, Form, Input, Radio, Space, Typography, Upload, message } from "antd";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import ImgCrop from "antd-img-crop";

type Role = "ADMIN" | "MINISTER" | "MEMBER";
type Me = { id: string; username: string; displayName: string; role: Role; profileBgUrl?: string | null } | null;
type ThemeMode = "light" | "dark" | "system";

function themeLabel(v: ThemeMode) {
  return v === "system" ? "跟随系统" : v === "dark" ? "深色" : "浅色";
}

function normalizeBg(v: string | null | undefined) {
  return String(v ?? "").trim();
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);

  const [accountForm] = Form.useForm<{ username: string }>();
  const [pwdForm] = Form.useForm<{ currentPassword: string; newPassword: string; confirm: string }>();

  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [bgValue, setBgValue] = useState<string>("");
  const [buildId, setBuildId] = useState<string>("");

  const loadMe = useCallback(async () => {
    setLoadingMe(true);
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const d = (await res.json().catch(() => ({}))) as { user?: Me extends null ? never : Exclude<Me, null> };
      if (!res.ok || !d.user) {
        message.error("加载用户信息失败");
        setMe(null);
        return;
      }
      setMe(d.user);
      accountForm.setFieldsValue({ username: d.user.username });
      setBgValue(normalizeBg(d.user.profileBgUrl));
    } finally {
      setLoadingMe(false);
    }
  }, [accountForm]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("sxl-theme-mode");
      if (v === "light" || v === "dark" || v === "system") setThemeMode(v);
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json().catch(() => ({})))
      .then((d: { buildId?: string }) => {
        if (d?.buildId) setBuildId(String(d.buildId));
      })
      .catch(() => {});
  }, []);

  const bgUploadProps: UploadProps = useMemo(
    () => ({
      accept: "image/png,image/jpeg,image/webp,image/gif",
      showUploadList: false,
      disabled: bgUploading,
      beforeUpload: async (file) => {
        if (!me?.id) return false;
        setBgUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
          const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
          if (!res.ok || !data.url) {
            message.error(data.message || "上传失败");
            return false;
          }
          const url = data.url;
          const res2 = await fetch("/api/me", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ profileBgUrl: url }),
          });
          const d2 = (await res2.json().catch(() => ({}))) as { message?: string; user?: { profileBgUrl?: string | null } };
          if (!res2.ok) {
            message.error(d2.message || "保存背景失败");
            return false;
          }
          setBgValue(normalizeBg(d2.user?.profileBgUrl ?? url));
          window.dispatchEvent(new Event("sxl-profile-updated"));
          window.dispatchEvent(new Event("sxl-profile-bg-updated"));
          message.success("主页背景已更新");
          return false;
        } finally {
          setBgUploading(false);
        }
      },
    }),
    [bgUploading, me?.id],
  );

  async function onSaveAccount(values: { username: string }) {
    if (!me) return;
    const username = values.username.trim();
    if (!username) {
      message.error("账号不能为空");
      return;
    }
    if (username === me.username) {
      message.info("账号未变更");
      return;
    }
    setSavingAccount(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; user?: { username: string } };
      if (!res.ok) {
        message.error(data.message || "保存失败");
        return;
      }
      message.success("账号已更新");
      window.dispatchEvent(new Event("sxl-profile-updated"));
      await loadMe();
    } finally {
      setSavingAccount(false);
    }
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

  function applyTheme(v: ThemeMode) {
    setThemeMode(v);
    try {
      window.localStorage.setItem("sxl-theme-mode", v);
    } catch {}
    window.dispatchEvent(new CustomEvent("sxl-theme-set", { detail: { mode: v } }));
  }

  return (
    <AppShell title="设置">
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Card size="small" loading={loadingMe} title="账号与安全">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              建议定期修改密码；账号为登录用，修改后下次请使用新账号登录。
            </Typography.Text>

            <Form form={accountForm} layout="vertical" onFinish={onSaveAccount} style={{ maxWidth: 480 }}>
              <Form.Item
                label="登录账号"
                name="username"
                rules={[{ required: true, message: "请输入账号" }]}
              >
                <Input placeholder="请输入账号" autoComplete="username" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={savingAccount} disabled={!me}>
                  保存账号
                </Button>
              </Form.Item>
            </Form>

            <div style={{ height: 1, background: "var(--ant-color-split, #f0f0f0)" }} />

            <Form form={pwdForm} layout="vertical" onFinish={onPasswordFinish} style={{ maxWidth: 480 }}>
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
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={pwdSubmitting} disabled={!me}>
                  保存新密码
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </Card>

        <Card size="small" title="外观">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <Typography.Text strong>深色模式</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Radio.Group
                  value={themeMode}
                  onChange={(e) => applyTheme(e.target.value as ThemeMode)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="system">{themeLabel("system")}</Radio.Button>
                  <Radio.Button value="light">{themeLabel("light")}</Radio.Button>
                  <Radio.Button value="dark">{themeLabel("dark")}</Radio.Button>
                </Radio.Group>
              </div>
            </div>

            <div style={{ height: 1, background: "var(--ant-color-split, #f0f0f0)" }} />

            <div>
              <Typography.Text strong>版本</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {buildId ? `buildId：${buildId}` : "buildId：加载中…"}
              </Typography.Paragraph>
            </div>

            <div style={{ height: 1, background: "var(--ant-color-split, #f0f0f0)" }} />

            <div>
              <Typography.Text strong>个人主页背景</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                对当前账号生效（跨设备同步）。
              </Typography.Paragraph>
              <Space wrap size={12}>
                <ImgCrop aspect={16 / 9} rotationSlider showReset showGrid modalTitle="裁切背景图">
                  <Upload {...bgUploadProps}>
                    <Button loading={bgUploading} disabled={!me}>
                      上传背景图片
                    </Button>
                  </Upload>
                </ImgCrop>
                <Button
                  disabled={!me || !bgValue}
                  onClick={async () => {
                    if (!me?.id) return;
                    const res = await fetch("/api/me", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ profileBgUrl: "" }),
                    });
                    const d = (await res.json().catch(() => ({}))) as { message?: string; user?: { profileBgUrl?: string | null } };
                    if (!res.ok) {
                      message.error(d.message || "清除失败");
                      return;
                    }
                    setBgValue(normalizeBg(d.user?.profileBgUrl));
                    window.dispatchEvent(new Event("sxl-profile-updated"));
                    window.dispatchEvent(new Event("sxl-profile-bg-updated"));
                    message.success("已清除背景");
                  }}
                >
                  清除背景
                </Button>
              </Space>
              {bgValue ? (
                <div
                  style={{
                    marginTop: 12,
                    height: 120,
                    borderRadius: 12,
                    border: "1px solid var(--ant-color-border, #f0f0f0)",
                    backgroundImage: `url(${bgValue})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              ) : null}
            </div>
          </Space>
        </Card>
      </Space>
    </AppShell>
  );
}

