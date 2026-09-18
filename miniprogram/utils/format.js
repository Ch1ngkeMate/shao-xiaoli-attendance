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
 *
 * 后端本地上传返回的是 `/uploads/avatar/xxx.png` 这类相对路径，小程序里必须补成
 * 完整 https 地址才显示得出来。取 base 的顺序（**不要只依赖 getApp()**）：
 *   1. app.globalData.apiBase —— 正常路径
 *   2. 直接 require ./config —— 兜底。getApp() 在部分时机（自定义组件内部、
 *      某些插件页面）不可用，过去会让 base 静默变成 ''，于是头像/图片全部白屏，
 *      且不报任何错，极难排查。
 *   3. 都没有 → 原样返回，让调用方至少能看到请求路径。
 *
 * @param {string} url 原始 URL
 * @returns {string} 补全后的完整 URL
 */
function fixUrl(url) {
  if (!url) return url;
  if (url.startsWith("http")) return url;

  let base = "";
  try {
    const app = getApp();
    base = (app && app.globalData && app.globalData.apiBase) || "";
  } catch (_) { /* getApp 不可用时走下面的 config 兜底 */ }

  if (!base) {
    try {
      base = require("./config").getApiBase();
    } catch (_) { /* 再失败就只能原样返回 */ }
  }

  if (!base) return url;
  return base + (url.startsWith("/") ? "" : "/") + url;
}

module.exports = {
  formatTime,
  formatDate,
  formatTimeRelative,
  fixUrl,
};
