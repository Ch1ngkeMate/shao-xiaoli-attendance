"use client";

import { Button, Card, Form, Input, InputNumber, Space, Switch, Typography, message } from "antd";
import { useState } from "react";

/** 仅在 mount 时创建 useForm，避免「无 Form 连接」警告（父级条件渲染时） */
export function AnnouncementEditor() {
  const [form] = Form.useForm<{ title: string; body: string; popupEnabled: boolean; popupDays: number }>();
  const [publishing, setPublishing] = useState(false);

  async function onPublish() {
    try {
      const v = await form.validateFields();
      setPublishing(true);
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: v.title.trim(),
          body: v.body.trim(),
          popupEnabled: !!v.popupEnabled,
          popupDays: v.popupEnabled ? Math.max(1, Number(v.popupDays || 1)) : 0,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; created?: number };
      if (!res.ok) {
        message.error(data.message || "发布失败");
        return;
      }
      message.success(`已发送，共 ${data.created ?? 0} 人收到`);
      form.resetFields();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("sxl-messages-updated"));
        window.dispatchEvent(new Event("sxl-announcement-sent"));
      }
    } catch {
      // 校验未通过
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card size="small" title="发布公告">
      <Form form={form} layout="vertical" style={{ maxWidth: 560 }} initialValues={{ popupEnabled: false, popupDays: 3 }}>
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: "请填写标题" }]}
          style={{ marginBottom: 12 }}
        >
          <Input maxLength={200} showCount placeholder="公告标题" />
        </Form.Item>
        <Form.Item
          name="body"
          label="正文"
          rules={[{ required: true, message: "请填写正文" }]}
          style={{ marginBottom: 12 }}
        >
          <Input.TextArea rows={4} maxLength={8000} showCount placeholder="向全体在册用户广播；每人一条站内消息" />
        </Form.Item>

        <Card size="small" type="inner" title="弹窗设置（可选）" style={{ marginBottom: 12 }}>
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Form.Item name="popupEnabled" valuePropName="checked" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <Typography.Text strong>每日首次进入弹窗</Typography.Text>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                    开启后：用户每天首次进入站内时弹出本公告（按持续天数自动失效）
                  </div>
                </div>
                <Switch />
              </div>
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.popupEnabled !== cur.popupEnabled}>
              {({ getFieldValue }) =>
                getFieldValue("popupEnabled") ? (
                  <Form.Item
                    name="popupDays"
                    label="弹窗持续天数"
                    rules={[{ required: true, message: "请填写持续天数" }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber min={1} max={365} style={{ width: 160 }} />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </Space>
        </Card>

        <Button type="primary" loading={publishing} onClick={onPublish}>
          发送
        </Button>
      </Form>
    </Card>
  );
}
