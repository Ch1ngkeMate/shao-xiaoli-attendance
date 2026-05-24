/** 后端 API 根地址（须为 HTTPS，且已在微信公众平台配置 request 合法域名） */
const API_BASE = "https://shaoxiaoli.top";

function getApiBase() {
  return API_BASE.replace(/\/$/, "");
}

module.exports = { getApiBase, API_BASE };
