"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Carousel,
  Descriptions,
  Grid,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { getTaskClaimVisibility } from "@/lib/task-availability";
import { getTaskTimeBoundsFromSlots } from "@/lib/task-time-bounds";
import { AdminProfilePeekAvatar } from "@/components/AdminProfilePeekAvatar";
import TaskActions from "./task-actions";

type ImageItem = { id: string; url: string };

type Props = {
  task: {
    id: string;
    title: string;
    status: "OPEN" | "CLOSED";
    startTime: string;
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
    points: number;
    headcountHint: number | null;
    claimedCount: number;
    excludeFromAttendance: boolean;
    description: string | null;
    publisher: { displayName: string };
    images: ImageItem[];
    claimantsBySlot: {
      slotId: string;
      sort: number;
      startTime: string;
      endTime: string;
      headcountHint: number | null;
      claimants: {
        claimId: string;
        id: string;
        displayName: string;
        username: string;
        avatarUrl: string | null;
      }[];
    }[];
  };
  /** 所有已接取者提交均已被通过（顶栏与 CLOSED 一样显示已结束，避免只显示「名额已满」） */
  allClaimantsApproved: boolean;
  /** 多段/任务级名额已无可接 */
  slotsOrTaskFull: boolean;
  role: "ADMIN" | "MINISTER" | "MEMBER";
  /** 当前用户是否至少接取了本任务的一段 */
  hasAnyClaim: boolean;
  /** 是否还能再接新的时段（多段时可能已接部分） */
  canClaimMore: boolean;
  /** 当前用户已接的时段 id（多段任务展示用） */
  myClaimedSlotIds: string[];
  mySubmission: {
    id: string;
    submitTime: string;
    note: string | null;
    evidenceImages: { id: string; url: string }[];
    review: null | { result: "APPROVED" | "REJECTED"; reason: string | null; reviewTime: string };
  } | null;
  submissionsForReview: {
    id: string;
    submitTime: string;
    note: string | null;
    user: { id: string; displayName: string; username: string; avatarUrl: string | null };
    evidenceImages: { id: string; url: string }[];
    review: null | { result: "APPROVED" | "REJECTED"; reason: string | null; reviewTime: string };
  }[];
  /** 部长/管理端：有待审核或已通过提交的用户 id，禁止直接「移出」（已驳回不算） */
  submittedUserIds: string[];
};

export default function TaskDetailView({
  task,
  allClaimantsApproved,
  slotsOrTaskFull,
  role,
  hasAnyClaim,
  canClaimMore,
  myClaimedSlotIds,
  mySubmission,
  submittedUserIds,
  submissionsForReview,
}: Props) {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleLoading, setSettleLoading] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const { effectiveStart, effectiveEnd } = useMemo(() => {
    const b = getTaskTimeBoundsFromSlots({
      startTime: new Date(task.startTime),
      endTime: new Date(task.endTime),
      timeSlots: (task.timeSlots ?? []).map((s) => ({
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime),
      })),
    });
    return { effectiveStart: b.start, effectiveEnd: b.end };
  }, [task.startTime, task.endTime, task.timeSlots]);

  const tag = getTaskClaimVisibility({
    status: task.status,
    endTime: effectiveEnd,
    headcountHint: task.headcountHint,
    claimedCount: task.claimedCount,
    allClaimantsApproved,
    slotsOrTaskFull,
  });
  const isClaimFull = slotsOrTaskFull;
  const canManage = role === "ADMIN" || role === "MINISTER";
  const timeEnded = useMemo(
    // eslint-disable-next-line react-hooks/purity -- 截止判断需相对「此刻」
    () => Date.now() > effectiveEnd.getTime(),
    [effectiveEnd],
  );
  /** 与顶栏「已结束」Tag 一致：关单/全员通过/过截止时间 后均不可再收工或提前结束 */
  const canManagerClose = task.status === "OPEN" && !allClaimantsApproved && !timeEnded;

  useEffect(() => {
    if (!canManagerClose) {
      setSettleOpen(false);
      setCloseOpen(false);
    }
  }, [canManagerClose]);
  const timeSlotLines =
    task.timeSlots && task.timeSlots.length > 0
      ? task.timeSlots
      : [{ id: "legacy", startTime: task.startTime, endTime: task.endTime, sort: 0 }];

  function fmt(s: string) {
    return dayjs(s).format(isMobile ? "MM-DD HH:mm" : "YYYY-MM-DD HH:mm");
  }

  async function earlyClose() {
    setCloseLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ excludeFromAttendance: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        message.error(data.message || "操作失败");
        return;
      }
      message.success("已结束，本任务不纳入部员月报/考勤");
      setCloseOpen(false);
      router.refresh();
    } finally {
      setCloseLoading(false);
    }
  }

  async function removeClaimantFromTask(claimId: string) {
    setRemovingUserId(claimId);
    try {
      const res = await fetch(`/api/tasks/${task.id}/remove-claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        message.error(data.message || "移出失败");
        return;
      }
      void router.refresh();
      message.success({ content: "已移出", duration: 3.5 });
    } finally {
      setRemovingUserId(null);
    }
  }

  async function settleWork() {
    setSettleLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ excludeFromAttendance: false }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        message.error(data.message || "操作失败");
        return;
      }
      message.success("已收工；已接取者中完成提交并审核通过的，按原规则计考勤/月报");
      setSettleOpen(false);
      router.refresh();
    } finally {
      setSettleLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {task.title}
        </Typography.Title>
        <Space wrap>
          <Tag color={tag.color}>{tag.text}</Tag>
          {task.excludeFromAttendance && <Tag>不计入考勤/月报</Tag>}
          <Typography.Text type="secondary">发布人：{task.publisher.displayName}</Typography.Text>
        </Space>

        {canManage && canManagerClose && (
          <div>
            <Space wrap>
              <Button type="primary" onClick={() => setSettleOpen(true)}>
                收工
              </Button>
              <Button danger onClick={() => setCloseOpen(true)}>
                提前结束（不计考勤）
              </Button>
            </Space>
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
              收工：无需全员已提交/通过即可关单，<strong>仍计考勤</strong>（有提交且已通过的部员照规则统计）；
              当所有人已提交且部长已同意全部人时，任务会<strong>自动收工关单</strong>。
            </Typography.Text>
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              提前结束：任务整体不纳入部员月报/考勤，适用于需作废推广的情形。
            </Typography.Text>
          </div>
        )}

        {task.images.length > 0 && (
          <Card>
            <Carousel autoplay={task.images.length > 1} infinite={task.images.length > 1}>
              {task.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={img.url}
                  alt="任务图片"
                  style={{ width: "100%", maxHeight: 420, objectFit: "contain" }}
                />
              ))}
            </Carousel>
          </Card>
        )}

        <Card>
          <Descriptions column={1} size="middle">
            <Descriptions.Item label="进行时间">
              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                {timeSlotLines.map((s) => {
                  const hc =
                    "headcountHint" in s && s.headcountHint != null && s.headcountHint > 0 ? s.headcountHint : null;
                  return (
                    <div key={s.id} style={{ width: "100%" }}>
                      <Typography.Text style={{ display: "block" }}>
                        第 {s.sort + 1} 段：{fmt(s.startTime)} ~ {fmt(s.endTime)}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, lineHeight: 1.2 }}>
                        {hc != null ? `本段限 ${hc} 人` : "本段人数不限"}
                      </Typography.Text>
                    </div>
                  );
                })}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="整体区间（接取/统计参考）">
              {dayjs(effectiveStart).format(isMobile ? "MM-DD HH:mm" : "YYYY-MM-DD HH:mm")} ~{" "}
              {dayjs(effectiveEnd).format(isMobile ? "MM-DD HH:mm" : "YYYY-MM-DD HH:mm")}
            </Descriptions.Item>
            <Descriptions.Item label="积分">{task.points}</Descriptions.Item>
            <Descriptions.Item label="人数（参考）">
              {task.headcountHint != null && task.headcountHint > 0
                ? `限额 ${task.headcountHint}，已接 ${task.claimedCount} 人`
                : "不限制"}
            </Descriptions.Item>
            <Descriptions.Item label="描述">{task.description || "无"}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="已接取人员（按时段，所有人可见）" size="small">
          {task.claimantsBySlot.every((g) => g.claimants.length === 0) ? (
            <Typography.Text type="secondary">暂无人接取</Typography.Text>
          ) : (
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              {task.claimantsBySlot.map((group) => {
                const hc =
                  group.headcountHint != null && group.headcountHint > 0
                    ? `限 ${group.headcountHint} 人`
                    : "人数不限";
                return (
                  <div key={group.slotId}>
                    <Typography.Text strong>
                      第 {group.sort + 1} 段：{dayjs(group.startTime).format("MM/DD HH:mm")} ~{" "}
                      {dayjs(group.endTime).format("MM/DD HH:mm")}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                      （{hc}）
                    </Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      {group.claimants.length === 0 ? (
                        <Typography.Text type="secondary">该段暂无人接取</Typography.Text>
                      ) : (
                        <Space wrap>
                          {group.claimants.map((c) => {
                            const hasSub = submittedUserIds.includes(c.id);
                            const showRemove = canManage && task.status === "OPEN" && !timeEnded;
                            return (
                              <div
                                key={c.claimId}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                              >
                                <Tag>
                                  <Space size={6}>
                                    <AdminProfilePeekAvatar
                                      viewerRole={role}
                                      targetUserId={c.id}
                                      size={22}
                                      src={c.avatarUrl}
                                      displayName={c.displayName}
                                    />
                                    <span>{c.displayName}</span>
                                  </Space>
                                </Tag>
                                {showRemove &&
                                  (hasSub ? (
                                    <Tooltip
                                      title={
                                        <>
                                          该干事有待审核或「已通过」的提交记录，不能直接移出。
                                          <br />
                                          待审核：请先「驳回」或「通过」；已通过则不可移出。
                                          <br />
                                          若已驳回仍见此提示，请刷新页面。
                                        </>
                                      }
                                    >
                                      {/* disabled 按钮不冒泡 hover，外包一层以便显示 Tooltip */}
                                      <span style={{ display: "inline-block", cursor: "not-allowed" }}>
                                        <Button size="small" danger disabled>
                                          移出
                                        </Button>
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    <Popconfirm
                                      title="移出后该时段接取作废。确定？"
                                      okText="确定"
                                      cancelText="取消"
                                      onConfirm={() => void removeClaimantFromTask(c.claimId)}
                                    >
                                      <Button size="small" danger loading={removingUserId === c.claimId}>
                                        移出
                                      </Button>
                                    </Popconfirm>
                                  ))}
                              </div>
                            );
                          })}
                        </Space>
                      )}
                    </div>
                  </div>
                );
              })}
            </Space>
          )}
        </Card>

        <TaskActions
          taskId={task.id}
          taskStatus={task.status}
          endTime={effectiveEnd.toISOString()}
          timeSlots={task.timeSlots}
          role={role}
          hasAnyClaim={hasAnyClaim}
          canClaimMore={canClaimMore}
          myClaimedSlotIds={myClaimedSlotIds}
          isClaimFull={isClaimFull}
          allClaimantsApproved={allClaimantsApproved}
          mySubmission={mySubmission}
          submissionsForReview={submissionsForReview}
        />
      </Space>

      <Modal
        title="收工"
        open={settleOpen}
        onCancel={() => setSettleOpen(false)}
        onOk={settleWork}
        okText="确认收工"
        okButtonProps={{ loading: settleLoading }}
        confirmLoading={settleLoading}
      >
        <p>收工后任务关单、不可再接取。未接取/未通过审核的不计积分；<strong>已接取并审核通过的仍按原规则计考勤/月报</strong>。</p>
        <p>适用于多人接取、尚未全部提交/通过时，由部内先行结束本任务并保留正常考勤口径。</p>
      </Modal>

      <Modal
        title="提前结束（不计考勤）"
        open={closeOpen}
        onCancel={() => setCloseOpen(false)}
        onOk={earlyClose}
        okText="确认"
        okButtonProps={{ danger: true, loading: closeLoading }}
        confirmLoading={closeLoading}
      >
        <p>确定按此方式结束本任务？结束后不可再接取。</p>
        <p>
          该任务将<strong>整体不纳入部员月报与考勤</strong>，适用于需作废、不计入本部门考核的推广。
        </p>
      </Modal>
    </div>
  );
}
