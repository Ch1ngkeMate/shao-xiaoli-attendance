"use client";

import { Button, Card, DatePicker, Form, Input, InputNumber, Space, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import AppShell from "@/components/AppShell";

type SlotValues = { startTime: dayjs.Dayjs; endTime: dayjs.Dayjs; headcountHint?: number | null };
type FormValues = {
  title: string;
  description?: string;
  points: number;
  timeSlots: SlotValues[];
};

export default function PublishPage() {
  const router = useRouter();
  const [form] = Form.useForm<FormValues>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const defaultOneSlot: SlotValues = {
    startTime: dayjs().add(1, "hour").minute(0).second(0),
    endTime: dayjs().add(1, "day").hour(18).minute(0).second(0),
    headcountHint: undefined,
  };

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
    for (const [i, s] of values.timeSlots.entries()) {
      if (s.endTime.isBefore(s.startTime)) {
        message.error(`第 ${i + 1} 段：结束时间不能早于开始时间`);
        return;
      }
    }
    const imageUrls: string[] = [];
    for (const f of fileList) {
      const origin = f.originFileObj as File | undefined;
      if (!origin) continue;
      const url = await uploadOne(origin);
      imageUrls.push(url);
    }

    const timeSlots = values.timeSlots.map((s) => {
      const hc = s.headcountHint != null && s.headcountHint > 0 ? s.headcountHint : undefined;
      return {
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        ...(hc != null ? { headcountHint: hc } : {}),
      };
    });

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        timeSlots,
        points: values.points,
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
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{ points: 1, timeSlots: [defaultOneSlot] }}
          >
            <Form.Item label="任务标题" name="title" rules={[{ required: true, message: "请输入任务标题" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="任务描述" name="description">
              <Input.TextArea rows={4} />
            </Form.Item>

            <Form.Item
              style={{ maxWidth: 200 }}
              label="任务积分"
              name="points"
              rules={[{ required: true, message: "请输入积分" }]}
            >
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item required label="进行时间（可添加多段，每段可限人数）" style={{ marginBottom: 4 }} />
            <Form.List name="timeSlots">
              {(fields, { add, remove }) => (
                <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                  {fields.map((field, index) => (
                    <Space
                      key={field.key}
                      style={{ display: "flex", width: "100%", flexWrap: "wrap", rowGap: 8 }}
                      align="end"
                    >
                      <Typography.Text type="secondary" style={{ width: 48, flexShrink: 0, paddingBottom: 8 }}>
                        第{index + 1}段
                      </Typography.Text>
                      <Form.Item
                        name={[field.name, "startTime"]}
                        label="开始"
                        rules={[{ required: true, message: "请选择" }]}
                        style={{ marginBottom: 0, flex: "1 1 200px" }}
                      >
                        <DatePicker showTime style={{ width: "100%", minWidth: 180, maxWidth: 240 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "endTime"]}
                        label="结束"
                        rules={[{ required: true, message: "请选择" }]}
                        style={{ marginBottom: 0, flex: "1 1 200px" }}
                      >
                        <DatePicker showTime style={{ width: "100%", minWidth: 180, maxWidth: 240 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "headcountHint"]}
                        label="本段限员"
                        tooltip="本段接取人数上限，不填为不限制；多段时各段独立计数"
                        style={{ marginBottom: 0, minWidth: 100, maxWidth: 120 }}
                      >
                        <InputNumber min={0} style={{ width: 120 }} placeholder="不限制" />
                      </Form.Item>
                      {fields.length > 1 && (
                        <MinusCircleOutlined
                          onClick={() => remove(field.name)}
                          style={{ marginBottom: 10, fontSize: 18, color: "#ff4d4f" }}
                        />
                      )}
                    </Space>
                  ))}
                  <Button type="dashed" onClick={() => add({ ...defaultOneSlot })} block icon={<PlusOutlined />}>
                    增加时间段
                  </Button>
                </Space>
              )}
            </Form.List>

            <Form.Item label="任务图片（可选，支持多张）" style={{ marginTop: 8 }}>
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
