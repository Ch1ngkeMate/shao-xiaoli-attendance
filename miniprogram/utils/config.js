/** 后端 API 根地址（须为 HTTPS，且已在微信公众平台配置 request 合法域名） */
const API_BASE = "https://shaoxiaoli.top";

/** 微信订阅消息模板ID（在微信公众平台「功能→订阅消息」中获取） */
const SUBSCRIBE_TMPL_IDS = {
  /** 任务发布通知 — 管理员发布新任务时推送给部员 */
  task: "ZgbaKQGSM6KlNtvv0RyRwhcFKLhhe7oBFcuvXaP_yDQ",
  /** 会议通知 — 管理员发布新会议时推送给部员 */
  meeting: "JgaEBpufJ3JJx-LJYXh-01PPTjVzEUL4JeIpCe-zTT4",
};

function getApiBase() {
  return API_BASE.replace(/\/$/, "");
}

function getSubscribeTmplIds() {
  const ids = [];
  if (SUBSCRIBE_TMPL_IDS.task) ids.push(SUBSCRIBE_TMPL_IDS.task);
  if (SUBSCRIBE_TMPL_IDS.meeting) ids.push(SUBSCRIBE_TMPL_IDS.meeting);
  return ids;
}

module.exports = { getApiBase, API_BASE, SUBSCRIBE_TMPL_IDS, getSubscribeTmplIds };
