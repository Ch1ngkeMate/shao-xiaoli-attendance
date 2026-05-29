const { getApiBase } = require("./utils/config");

App({
  globalData: {
    apiBase: getApiBase(),
    token: "",
    user: null,
  },

  onLaunch() {
    const token = wx.getStorageSync("sxl_token");
    const user = wx.getStorageSync("sxl_user");
    if (token) this.globalData.token = token;
    if (user) this.globalData.user = user;
    this.updateBadge();
    // 每 60 秒刷新红点
    setInterval(() => this.updateBadge(), 60000);
  },

  onShow() {
    this.updateBadge();
  },

  /** 拉取未读数并更新 TabBar 红点 */
  async updateBadge() {
    if (!this.globalData.token) return;
    try {
      const api = require("./utils/api");
      const res = await api.getNotifications();
      const unread = res.unreadCount || 0;
      if (unread > 0) {
        wx.setTabBarBadge({ index: 1, text: unread > 99 ? '99+' : String(unread) });
      } else {
        wx.removeTabBarBadge({ index: 1 });
      }
    } catch (_) { /* ignore */ }
  },

  setSession(token, user) {
    this.globalData.token = token;
    this.globalData.user = user;
    wx.setStorageSync("sxl_token", token);
    wx.setStorageSync("sxl_user", user);
    this.updateBadge();
  },

  clearSession() {
    this.globalData.token = "";
    this.globalData.user = null;
    wx.removeStorageSync("sxl_token");
    wx.removeStorageSync("sxl_user");
    wx.removeTabBarBadge({ index: 1 });
  },

  /** 检查登录状态，未登录则跳转登录页 */
  checkLogin() {
    if (!this.globalData.token) {
      wx.reLaunch({ url: "/pages/login/login" });
      return false;
    }
    return true;
  },

  /** 检查是否具有指定角色权限 */
  hasRole(...roles) {
    const user = this.globalData.user;
    if (!user) return false;
    return roles.includes(user.role);
  },
});
