"use client";

import { Button, Card, DatePicker, Form, Input, InputNumber, Space, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";

type FormValues = {
  title: string;
  description?: string;
  startTime: dayjs.Dayjs;
  endTime: dayjs.Dayjs;
  points: number;
  headcountHint?: number;
};

export default function PublishPage() {
  const router = useRouter();
  const [form] = Form.useForm<FormValues>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  async function uploadOne(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!res.ok || !data.url) {
      throw new Error(data.message || "上传失败");
    }
    return data.url;
  }

  async function onFinish(values: FormValues) {
    const imageUrls: string[] = [];
    for (const f of fileList) {
      const origin = f.originFileObj as File | undefined;
      if (!origin) continue;
      const url = await uploadOne(origin);
      imageUrls.push(url);
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        startTime: values.startTime.toISOString(),
        endTime: values.endTime.toISOString(),
        points: values.points,
        headcountHint: values.headcountHint,
        imageUrls,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { task?: { id: string }; message?: string };
    if (!res.ok || !data.task) {
      message.error(data.message || "发布失败");
      return;
    }
    message.success("发布成功");
    router.push(`/tasks/${data.task.id}`);
  }

  return (
    <AppShell title="发布任务">
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Card>
          <Typography.Title level={4} style={{ marginTop: 0 }}>
            发布新任务
          </Typography.Title>
          <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ points: 1 }}>
            <Form.Item label="任务标题" name="title" rules={[{ required: true, message: "请输入任务标题" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="任务描述" name="description">
              <Input.TextArea rows={4} />
            </Form.Item>

            <Space size={12} style={{ width: "100%" }}>
              <Form.Item
                style={{ flex: 1 }}
                label="开始时间"
                name="startTime"
                rules={[{ required: true, message: "请选择开始时间" }]}
              >
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                style={{ flex: 1 }}
                label="结束时间"
                name="endTime"
                rules={[{ required: true, message: "请选择结束时间" }]}
              >
                <DatePicker showTime style={{ width: "100%" }} />
              </Form.Item>
            </Space>

            <Space size={12} style={{ width: "100%" }}>
              <Form.Item
                style={{ flex: 1 }}
                label="任务积分"
                name="points"
                rules={[{ required: true, message: "请输入积分" }]}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item style={{ flex: 1 }} label="任务人数（可选）" name="headcountHint">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Space>

            <Form.Item label="任务图片（可选，支持多张）">
              <Upload
                multiple
                listType="picture"
                fileList={fileList}
                beforeUpload={() => false}
                onChange={(info) => setFileList(info.fileList)}
              >
                <Button>选择图片</Button>
              </Upload>
            </Form.Item>

            <Button type="primary" htmlType="submit">
              发布
            </Button>
          </Form>
        </Card>
      </Space>
    </AppShell>
  );
}
