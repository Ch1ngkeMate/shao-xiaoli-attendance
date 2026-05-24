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
  },

  setSession(token, user) {
    this.globalData.token = token;
    this.globalData.user = user;
    wx.setStorageSync("sxl_token", token);
    wx.setStorageSync("sxl_user", user);
  },

  clearSession() {
    this.globalData.token = "";
    this.globalData.user = null;
    wx.removeStorageSync("sxl_token");
    wx.removeStorageSync("sxl_user");
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
