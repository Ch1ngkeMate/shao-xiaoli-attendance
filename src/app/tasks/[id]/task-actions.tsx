"use client";

import { Button, Card, Form, Input, Modal, Space, Tag, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { useMemo, useState } from "react";

type ReviewableSubmission = {
  id: string;
  submitTime: string;
  note: string | null;
  user: { displayName: string; username: string };
  evidenceImages: { id: string; url: string }[];
  review: null | { result: "APPROVED" | "REJECTED"; reason: string | null; reviewTime: string };
};

type Props = {
  taskId: string;
  taskStatus: "OPEN" | "CLOSED";
  endTime: string;
  role: "ADMIN" | "MINISTER" | "MEMBER";
  claimStatus: "CLAIMED" | "CANCELLED" | null;
  mySubmission: null | {
    id: string;
    submitTime: string;
    note: string | null;
    evidenceImages: { id: string; url: string }[];
    review: null | { result: "APPROVED" | "REJECTED"; reason: string | null; reviewTime: string };
  };
  submissionsForReview: ReviewableSubmission[];
};

type SubmitForm = { note?: string };

export default function TaskActions(props: Props) {
  const { taskId } = props;
  const ended = useMemo(() => Date.now() > new Date(props.endTime).getTime(), [props.endTime]);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [submitOpen, setSubmitOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm<SubmitForm>();

  async function claim() {
    const res = await fetch(`/api/tasks/${taskId}/claim`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return message.error(data.message || "接取失败");
    message.success("已接取任务");
    location.reload();
  }

  async function unclaim() {
    const res = await fetch(`/api/tasks/${taskId}/unclaim`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return message.error(data.message || "取消接取失败");
    message.success("已取消接取");
    location.reload();
  }

  async function uploadEvidenceOne(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/evidence", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!res.ok || !data.url) throw new Error(data.message || "上传失败");
    return data.url;
  }

  async function submit(values: SubmitForm) {
    try {
      setSubmitting(true);
      const evidenceUrls: string[] = [];
      for (const f of fileList) {
        const origin = f.originFileObj as File | undefined;
        if (!origin) continue;
        evidenceUrls.push(await uploadEvidenceOne(origin));
      }

      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: values.note, evidenceUrls }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) return message.error(data.message || "提交失败");
      message.success("已提交，等待确认");
      setSubmitOpen(false);
      location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function approve(submissionId: string) {
    const res = await fetch(`/api/submissions/${submissionId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: "APPROVED" }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return message.error(data.message || "确认失败");
    message.success("已确认通过");
    location.reload();
  }

  async function reject(submissionId: string, reason: string) {
    const res = await fetch(`/api/submissions/${submissionId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: "REJECTED", reason }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return message.error(data.message || "驳回失败");
    message.success("已驳回");
    location.reload();
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      {props.role === "MEMBER" && (
        <Card title="我的操作">
          <Space wrap>
            {props.taskStatus === "OPEN" && props.claimStatus !== "CLAIMED" && !ended && (
              <Button type="primary" onClick={claim}>
                接取任务
              </Button>
            )}
            {props.claimStatus === "CLAIMED" && (
              <Button onClick={unclaim} danger>
                取消接取
              </Button>
            )}
            {props.claimStatus === "CLAIMED" && (
              <Button type="primary" onClick={() => setSubmitOpen(true)}>
                提交完成
              </Button>
            )}
          </Space>

          {props.mySubmission && (
            <div style={{ marginTop: 12 }}>
              <Space wrap>
                <Tag>
                  已提交：{new Date(props.mySubmission.submitTime).toLocaleString()}
                </Tag>
                {props.mySubmission.review ? (
                  props.mySubmission.review.result === "APPROVED" ? (
                    <Tag color="green">已确认</Tag>
                  ) : (
                    <Tag color="red">被驳回</Tag>
                  )
                ) : (
                  <Tag color="gold">待确认</Tag>
                )}
              </Space>
              {props.mySubmission.review?.result === "REJECTED" && (
                <div style={{ marginTop: 8 }}>
                  驳回原因：{props.mySubmission.review.reason || "未填写"}
                </div>
              )}
            </div>
          )}

          <Modal
            title="提交完成"
            open={submitOpen}
            onCancel={() => setSubmitOpen(false)}
            onOk={() => form.submit()}
            okText="提交"
            confirmLoading={submitting}
          >
            <Form form={form} layout="vertical" onFinish={submit}>
              <Form.Item label="说明（可选）" name="note">
                <Input.TextArea rows={4} />
              </Form.Item>
              <Form.Item label="凭证图片（可选，多张）">
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
            </Form>
          </Modal>
        </Card>
      )}

      {(props.role === "ADMIN" || props.role === "MINISTER") && (
        <Card title="待审核/已审核列表">
          <Space orientation="vertical" style={{ width: "100%" }}>
            {props.submissionsForReview.length === 0 && <div>暂无提交记录</div>}
            {props.submissionsForReview.map((s) => (
              <Card
                key={s.id}
                type="inner"
                title={`${s.user.displayName}（${s.user.username}）`}
                extra={
                  <Space>
                    {s.review ? (
                      s.review.result === "APPROVED" ? (
                        <Tag color="green">已通过</Tag>
                      ) : (
                        <Tag color="red">已驳回</Tag>
                      )
                    ) : (
                      <Tag color="gold">待审核</Tag>
                    )}
                  </Space>
                }
              >
                <div style={{ marginBottom: 8 }}>
                  提交时间：{new Date(s.submitTime).toLocaleString()}
                </div>
                {s.note && <div style={{ marginBottom: 8 }}>说明：{s.note}</div>}
                {s.evidenceImages.length > 0 && (
                  <Space wrap style={{ marginBottom: 8 }}>
                    {s.evidenceImages.map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={img.id}
                        src={img.url}
                        alt="凭证"
                        style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6 }}
                      />
                    ))}
                  </Space>
                )}

                <Space wrap>
                  <Button type="primary" onClick={() => approve(s.id)} disabled={!!s.review}>
                    通过
                  </Button>
                  <Button
                    danger
                    onClick={() => {
                      setReviewingId(s.id);
                      setRejectReason("");
                    }}
                    disabled={!!s.review}
                  >
                    驳回
                  </Button>
                </Space>
              </Card>
            ))}
          </Space>

          <Modal
            title="驳回原因"
            open={!!reviewingId}
            onCancel={() => setReviewingId(null)}
            onOk={() => {
              if (!reviewingId) return;
              reject(reviewingId, rejectReason);
              setReviewingId(null);
            }}
            okText="确定驳回"
          >
            <Input.TextArea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入驳回原因（可选）"
            />
          </Modal>
        </Card>
      )}
    </Space>
  );
}

