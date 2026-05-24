/**
 * 微信小程序订阅消息发送
 *
 * 前提条件：
 * 1. 用户在小程序端完成 wx.requestSubscribeMessage 订阅
 * 2. 环境变量配置 WX_TASK_TMPL_ID / WX_MEETING_TMPL_ID
 *
 * 用法：
 *   await notifyTaskPublished({ taskId, title, points, deadline, openids: [...] });
 *   await notifyMeetingPublished({ meetingId, title, startTime, place, openids: [...] });
 */

import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/wechat";

/* ========== 环境变量 ========== */

function getTmplIds() {
  const task = process.env.WX_TASK_TMPL_ID?.trim();
  const meeting = process.env.WX_MEETING_TMPL_ID?.trim();
  return { task, meeting };
}

/* ========== 核心：发送单条订阅消息 ========== */

interface SubscribeData {
  [key: string]: { value: string };
}

async function sendOne(openid: string, templateId: string, data: SubscribeData, page?: string): Promise<boolean> {
  try {
    const token = await getAccessToken();
    const res = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touser: openid,
          template_id: templateId,
          page: page || undefined,
          data,
          miniprogram_state: "formal", // formal = 正式版, trial = 体验版, developer = 开发版
        }),
      },
    );
    const result = (await res.json()) as { errcode: number; errmsg: string };
    if (result.errcode !== 0) {
      console.error(`[wx-subscribe] 发送失败 openid=${openid} tmpl=${templateId}:`, result.errmsg);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[wx-subscribe] 发送异常 openid=${openid}:`, e);
    return false;
  }
}

/* ========== 按 openid 批量发送 ========== */

async function sendToOpenids(openids: string[], templateId: string, data: SubscribeData, page?: string) {
  if (openids.length === 0 || !templateId) return;
  const results = await Promise.allSettled(
    openids.map((oid) => sendOne(oid, templateId, data, page)),
  );
  const success = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const fail = results.length - success;
  if (fail > 0) {
    console.warn(`[wx-subscribe] 批量发送完成: ${success}/${results.length} 成功, ${fail} 失败`);
  }
}

/* ========== 查询所有活跃部员的 openid ========== */

async function getMemberOpenids(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: "MEMBER", wxOpenId: { not: null } },
    select: { wxOpenId: true },
  });
  return users.map((u) => u.wxOpenId!).filter(Boolean);
}

/* ========== 公开 API：发布任务时通知 ========== */

export async function notifyTaskPublished(args: {
  taskId: string;
  title: string;
  points: number;
  deadline: string; // ISO string
}) {
  const { task: taskTmplId } = getTmplIds();
  if (!taskTmplId) {
    console.warn("[wx-subscribe] 未配置 WX_TASK_TMPL_ID，跳过任务通知");
    return;
  }

  const openids = await getMemberOpenids();
  if (openids.length === 0) return;

  const deadlineDate = new Date(args.deadline);
  const deadlineStr = Number.isNaN(deadlineDate.getTime())
    ? args.deadline
    : `${deadlineDate.getFullYear()}-${String(deadlineDate.getMonth() + 1).padStart(2, "0")}-${String(deadlineDate.getDate()).padStart(2, "0")}`;

  await sendToOpenids(
    openids,
    taskTmplId,
    {
      thing1: { value: args.title.slice(0, 20) },          // 任务标题
      time2: { value: deadlineStr },                        // 截止时间
      thing3: { value: `+${args.points}分` },              // 备注
    },
    `/pages/tasks/detail?id=${args.taskId}`,
  );
}

/* ========== 公开 API：发布会议时通知 ========== */

export async function notifyMeetingPublished(args: {
  meetingId: string;
  title: string;
  startTime: Date;
  place?: string | null;
}) {
  const { meeting: meetingTmplId } = getTmplIds();
  if (!meetingTmplId) {
    console.warn("[wx-subscribe] 未配置 WX_MEETING_TMPL_ID，跳过会议通知");
    return;
  }

  const openids = await getMemberOpenids();
  if (openids.length === 0) return;

  const startStr = `${args.startTime.getFullYear()}-${String(args.startTime.getMonth() + 1).padStart(2, "0")}-${String(args.startTime.getDate()).padStart(2, "0")} ${String(args.startTime.getHours()).padStart(2, "0")}:${String(args.startTime.getMinutes()).padStart(2, "0")}`;

  await sendToOpenids(
    openids,
    meetingTmplId,
    {
      thing1: { value: args.title.slice(0, 20) },          // 会议名称
      time2: { value: startStr },                           // 开始时间
      thing3: { value: args.place || "待通知" },           // 地点
    },
    `/pages/meetings/detail?id=${args.meetingId}`,
  );
}
