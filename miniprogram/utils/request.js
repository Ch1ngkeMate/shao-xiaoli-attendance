const { getApiBase } = require("./config");

/**
 * 通用请求封装
 * 自动附加 Bearer Token，统一错误处理，Token 过期自动跳转登录
 */
function request(options) {
  const app = getApp();
  const base = getApiBase();
  const header = Object.assign({}, options.header || {});
  if (app.globalData.token) {
    header.Authorization = `Bearer ${app.globalData.token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      url: `${base}${options.url}`,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        // 401 未授权：token 过期或无效，跳转登录
        if (res.statusCode === 401) {
          app.clearSession();
          wx.reLaunch({ url: "/pages/login/login" });
          reject(new Error("登录已过期，请重新登录"));
          return;
        }

        // 403 权限不足
        if (res.statusCode === 403) {
          wx.showToast({ title: "权限不足", icon: "none" });
          reject(new Error("权限不足"));
          return;
        }

        const msg =
          (res.data && (res.data.message || res.data.msg)) ||
          `请求失败 (${res.statusCode})`;
        reject(new Error(msg));
      },
      fail(err) {
        wx.showToast({ title: "网络异常，请检查网络", icon: "none" });
        reject(err);
      },
    });
  });
}

module.exports = { request };
