/**
 * 公共格式化工具
 * 统一管理时间格式化和图片 URL 补全逻辑
 */

/**
 * 标准时间格式化：MM-DD HH:mm
 * @param {string} dateStr ISO 日期字符串
 * @returns {string} 格式化后的时间
 */
function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

/**
 * 中文日期格式化：YYYY年M月D日
 * @param {string} dateStr ISO 日期字符串
 * @returns {string} 格式化后的日期
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 相对时间格式化（消息列表专用）
 * @param {string} dateStr ISO 日期字符串
 * @returns {string} 刚刚 / X分钟前 / X小时前 / MM-DD
 */
function formatTimeRelative(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${m}-${day}`;
}

/**
 * 补全图片/文件 URL（相对路径 → 绝对路径）
 * @param {string} url 原始 URL
 * @returns {string} 补全后的完整 URL
 */
function fixUrl(url) {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  const app = getApp();
  const base = app ? (app.globalData.apiBase || '') : '';
  return base + (url.startsWith('/') ? '' : '/') + url;
}

module.exports = {
  formatTime,
  formatDate,
  formatTimeRelative,
  fixUrl,
};
