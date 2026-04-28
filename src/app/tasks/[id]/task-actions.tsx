"use client";

import { Button, Card, Form, Input, Modal, Select, Space, Tag, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { AdminProfilePeekAvatar } from "@/components/AdminProfilePeekAvatar";

/** 立即重拉 RSC 数据，Toast 并行展示；整页 reload 会打断提示且等完才变界面、观感卡 */
function showSuccessWithRefresh(router: { refresh: () => void | Promise<void> }, text: string) {
  void router.refresh();
  message.success({ content: text, duration: 3.5 });
}

type ReviewableSubmission = {
  id: string;
  submitTime: string;
  note: string | null;
  user: { id: string; displayName: string; username: string; avatarUrl: string | null };
  evidenceImages: { id: string; url: string }[];
  review: null | { result: "APPROVED" | "REJECTED"; reason: string | null; reviewTime: string };
};

type Props = {
  taskId: string;
  taskStatus: "OPEN" | "CLOSED";
  endTime: string;
  timeSlots: {
    id: string;
    startTime: string;
    endTime: string;
    sort: number;
    headcountHint: number | null;
    /** 本段已接取人数（CLAIMED） */
    claimedCount: number;
    /** 本段报名上限（空/<=0 为不限） */
    limit: number | null;
  }[];
  role: "ADMIN" | "MINISTER" | "MEMBER";
  hasAnyClaim: boolean;
  canClaimMore: boolean;
  myClaimedSlotIds: string[];
  /** 与详情页顶栏一致：所有已接取者均已通过时视为已结束，不可再接 */
  allClaimantsApproved: boolean;
  /** 名额是否已满（未接取用户不可再点接取） */
  isClaimFull?: boolean;
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

/** 仅在用户打开「提交完成」时挂载，避免未打开时即插入 ant-modal portal 导致 SSR 水合不一致 */
function TaskSubmitModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const router = useRouter();
  const [form] = Form.useForm<SubmitForm>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function uploadEvidenceOne(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/evidence", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!res.ok || !data.url) throw new Error(data.message || "上传失败");
    return data.url;
  }

  async function onFinish(values: SubmitForm) {
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
      onClose();
      showSuccessWithRefresh(router, "已提交，等待确认");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      title="提交完成"
      onCancel={onClose}
      onOk={() => void form.submit()}
      okText="提交"
      confirmLoading={submitting}
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
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
  );
}

export default function TaskActions(props: Props) {
  const { taskId } = props;
  const router = useRouter();
  const timeEnded = useMemo(() => Date.now() > new Date(props.endTime).getTime(), [props.endTime]);
  // 与详情页：部长已全部确认通过 / 关单 / 过截止时间 均不可再接
  const cannotNewClaim = props.taskStatus === "CLOSED" || timeEnded || props.allClaimantsApproved;
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [submitOpen, setSubmitOpen] = useState(false);
  const [timeSlotId, setTimeSlotId] = useState<string | null>(null);

  const timeSlotMeta = useMemo(() => {
    const m = new Map<string, { sort: number; claimedCount: number; limit: number | null; startTime: string; endTime: string }>();
    for (const s of props.timeSlots ?? []) {
      m.set(s.id, {
        sort: s.sort,
        claimedCount: s.claimedCount ?? 0,
        limit: s.limit != null && s.limit > 0 ? s.limit : null,
        startTime: s.startTime,
        endTime: s.endTime,
      });
    }
    return m;
  }, [props.timeSlots]);

  const multiSlot = (props.timeSlots?.length ?? 0) > 1;
  useEffect(() => {
    if (!props.timeSlots?.length) return;
    const firstOpen = props.timeSlots.find((s) => !props.myClaimedSlotIds.includes(s.id));
    setTimeSlotId(firstOpen?.id ?? props.timeSlots[0]!.id);
  }, [props.timeSlots, props.myClaimedSlotIds]);

  async function claim() {
    if (multiSlot && !timeSlotId) {
      message.warning("请选择要接取的时间段");
      return;
    }
    const res = await fetch(`/api/tasks/${taskId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(multiSlot && timeSlotId ? { timeSlotId } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return message.error(data.message || "接取失败");
    showSuccessWithRefresh(router, "辛苦，邵小利因您的付出而更加美好！");
  }

  async function approve(submissionId: string) {
    const res = await fetch(`/api/submissions/${submissionId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: "APPROVED" }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return message.error(data.message || "确认失败");
    showSuccessWithRefresh(router, "已确认通过");
  }

  async function reject(submissionId: string, reason: string) {
    const res = await fetch(`/api/submissions/${submissionId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: "REJECTED", reason }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return message.error(data.message || "驳回失败");
    showSuccessWithRefresh(router, "已驳回");
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      {/* 部员/部长/管理员均可接取、提交；取消接取由部长/管理员在「已接取人员」中操作 */}
      <Card title="我的操作">
          {multiSlot && props.hasAnyClaim && props.myClaimedSlotIds.length > 0 && (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              已接时段：
              {props.myClaimedSlotIds
                .map((id) => {
                  const s = props.timeSlots.find((x) => x.id === id);
                  return s ? `第${s.sort + 1}段` : id;
                })
                .join("、")}
            </Typography.Paragraph>
          )}
          {/* flex-end：按钮与下拉框底缘对齐，避免与「接取哪一段？」标题顶对齐显得错位 */}
          <Space wrap align="end" size={12}>
            {props.taskStatus === "OPEN" && props.canClaimMore && !cannotNewClaim && multiSlot && (
              <div>
                <div style={{ marginBottom: 6, fontSize: 12, color: "#666" }}>接取哪一段？</div>
                <Select
                  style={{ minWidth: 260, width: 260 }}
                  value={timeSlotId ?? undefined}
                  onChange={(v) => setTimeSlotId(v)}
                  optionLabelProp="shortLabel"
                >
                  {(props.timeSlots ?? []).map((s) => {
                    const claimedByMe = props.myClaimedSlotIds.includes(s.id);
                    const base = `第${s.sort + 1}段 ${dayjs(s.startTime).format("MM/DD HH:mm")}~${dayjs(s.endTime).format("MM/DD HH:mm")}`;
                    return (
                      <Select.Option key={s.id} value={s.id} disabled={claimedByMe} shortLabel={base}>
                        {base}
                      </Select.Option>
                    );
                  })}
                </Select>
              </div>
            )}
            {props.taskStatus === "OPEN" && props.canClaimMore && !cannotNewClaim && (
              <Button type="primary" onClick={claim}>
                {multiSlot ? "接取该时段" : "接取任务"}
              </Button>
            )}
            {props.taskStatus === "OPEN" && !props.canClaimMore && !props.hasAnyClaim && !cannotNewClaim && props.isClaimFull && (
              <Tag color="orange">接取人数已满</Tag>
            )}
            {props.hasAnyClaim && (
              <Button
                type="primary"
                onClick={() => setSubmitOpen(true)}
                disabled={!!props.mySubmission || timeEnded}
              >
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

          {submitOpen && (
            <TaskSubmitModal taskId={taskId} onClose={() => setSubmitOpen(false)} />
          )}
        </Card>

      {(props.role === "ADMIN" || props.role === "MINISTER") && (
        <Card title="待审核/已审核列表">
          <Space orientation="vertical" style={{ width: "100%" }}>
            {props.submissionsForReview.length === 0 && <div>暂无提交记录</div>}
            {props.submissionsForReview.map((s) => (
              <Card
                key={s.id}
                type="inner"
                title={
                  <Space size={8}>
                    <AdminProfilePeekAvatar
                      viewerRole={props.role}
                      targetUserId={s.user.id}
                      size={24}
                      src={s.user.avatarUrl}
                      displayName={s.user.displayName}
                    />
                    <span>{s.user.displayName}</span>
                  </Space>
                }
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

