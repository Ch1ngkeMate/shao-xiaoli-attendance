"use client";

import { Button, Input, Modal, Space, message } from "antd";
import dayjs from "dayjs";
import type { CSSProperties } from "react";
import { useCallback, useState } from "react";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"];
const PERIODS = ["第1节", "第2节", "第3节", "第4节", "第5节"];

export type LeaveSlipRow = {
  id: string;
  category: "DUTY" | "MEETING";
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  dutyWeekday: number | null;
  dutyPeriod: number | null;
  user?: { displayName: string; username: string; avatarUrl: string | null };
  meeting?: { title: string; startTime: string } | null;
};

/** 从请假记录解析请假条正文所需字段 */
function buildSlipFields(l: LeaveSlipRow) {
  const reason = (l.reason || "").trim() || "—";
  let timeStr = "—";
  let eventStr = "—";
  if (l.category === "MEETING" && l.meeting) {
    timeStr = dayjs(l.meeting.startTime).format("YYYY-MM-DD HH:mm");
    eventStr = `${l.meeting.title}`;
  } else if (l.category === "DUTY" && l.dutyWeekday != null && l.dutyPeriod != null) {
    timeStr = `${WEEKDAYS[l.dutyWeekday]}${PERIODS[l.dutyPeriod]}`;
    eventStr = "值班";
  } else if (l.category === "DUTY") {
    eventStr = "值班";
  } else {
    eventStr = "会议";
  }
  const applicant = l.user?.displayName?.trim() || "—";
  const dateStr = dayjs(l.createdAt).format("YYYY年M月D日");
  return { reason, timeStr, eventStr, applicant, dateStr };
}

const slipWord: CSSProperties = {
  borderBottom: "1px solid rgba(61, 43, 31, 0.45)",
  padding: "0 2px 1px",
  fontWeight: 600,
};

const paperStyle: CSSProperties = {
  background: "linear-gradient(165deg, #faf6ef 0%, #ede4d3 48%, #f5f0e6 100%)",
  border: "2px solid #5c4033",
  boxShadow: "inset 0 0 48px rgba(92, 64, 51, 0.08), 0 2px 12px rgba(0,0,0,0.06)",
  borderRadius: 2,
  padding: "28px 32px 32px",
  color: "#3d2914",
  fontFamily: '"Songti SC", "SimSun", "STSong", "Noto Serif SC", serif',
  fontSize: 16,
  lineHeight: 1.85,
  position: "relative",
};

type Props = {
  open: boolean;
  leave: LeaveSlipRow | null;
  onClose: () => void;
  /** 审批请求成功后（同意或驳回） */
  onDecided: () => void;
};

/**
 * 管理人员处理待批请假：传统请假条样式弹窗，底部同意 / 驳回
 */
export function LeaveSlipModal({ open, leave, onClose, onDecided }: Props) {
  const [rejectPhase, setRejectPhase] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dispatchUpdated = useCallback(() => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("sxl-messages-updated"));
  }, []);

  const handleApprove = async () => {
    if (!leave) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/leave/${leave.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve: true }),
      });
      if (!r.ok) {
        message.error("操作失败");
        return;
      }
      message.success("已同意");
      onClose();
      onDecided();
      dispatchUpdated();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!leave) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/leave/${leave.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve: false, rejectReason: rejectReason.trim() || undefined }),
      });
      if (!r.ok) {
        message.error("操作失败");
        return;
      }
      message.success("已驳回");
      onClose();
      onDecided();
      dispatchUpdated();
    } finally {
      setSubmitting(false);
    }
  };

  // 关闭时不挂载 Modal，避免 Portal 在 SSR 与客户端水合不一致
  if (!open || !leave) return null;

  const frag = buildSlipFields(leave);

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden
      centered
      styles={{ body: { background: "#e8e0d5" } }}
      afterOpenChange={(opened) => {
        if (opened) {
          setRejectPhase(false);
          setRejectReason("");
        }
      }}
    >
      <>
          {/* 四角简单装饰 */}
          <div style={paperStyle}>
            <div
              style={{
                position: "absolute",
                inset: 6,
                border: "1px solid rgba(92, 64, 51, 0.25)",
                pointerEvents: "none",
                borderRadius: 1,
              }}
            />
            <h2
              style={{
                textAlign: "center",
                margin: "0 0 20px",
                fontSize: 26,
                letterSpacing: "0.35em",
                fontWeight: 700,
                color: "#2c1f14",
              }}
            >
              请假条
            </h2>
            <p style={{ margin: "0 0 12px" }}>亲爱的部长：</p>
            <p style={{ margin: "0 0 20px", textIndent: "2em", textAlign: "justify" }}>
              我因<span style={slipWord}>{frag.reason}</span>
              无法参与<span style={slipWord}>{frag.timeStr}</span>
              的<span style={slipWord}>{frag.eventStr}</span>
              ，需要请假一次。特书此假条，还望批准。
            </p>
            <p style={{ margin: "8px 0 0" }}>请假人：{frag.applicant}</p>
            <p style={{ margin: "4px 0 0" }}>日期：{frag.dateStr}</p>
          </div>

          <div style={{ marginTop: 20, textAlign: "center" }}>
            {!rejectPhase ? (
              <Space size="middle">
                <Button type="primary" size="large" loading={submitting} onClick={() => void handleApprove()}>
                  同意
                </Button>
                <Button
                  danger
                  size="large"
                  disabled={submitting}
                  onClick={() => setRejectPhase(true)}
                >
                  驳回
                </Button>
                <Button size="large" disabled={submitting} onClick={onClose}>
                  关闭
                </Button>
              </Space>
            ) : (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                <Input.TextArea
                  rows={3}
                  placeholder="驳回说明（可空，将通知部员）"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  maxLength={500}
                  showCount
                  disabled={submitting}
                />
                <Space wrap style={{ justifyContent: "center", width: "100%" }}>
                  <Button type="primary" danger loading={submitting} onClick={() => void handleRejectConfirm()}>
                    确认驳回
                  </Button>
                  <Button disabled={submitting} onClick={() => setRejectPhase(false)}>
                    返回
                  </Button>
                </Space>
              </Space>
            )}
          </div>
      </>
    </Modal>
  );
}
