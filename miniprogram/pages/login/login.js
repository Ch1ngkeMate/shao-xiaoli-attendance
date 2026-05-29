const app = getApp();

Page({
  data: {
    realName: "",
    loading: false,
    logoUrl: "/assets/dept-logo.png",
    logoFailed: false,
    showForm: false,
  },

  onLoad() {
    // 已有 token 则自动登录，不展示表单
    const token = wx.getStorageSync("sxl_token");
    if (token) {
      app.globalData.token = token;
      app.globalData.user = wx.getStorageSync("sxl_user");
      this.onWxLogin();
    } else {
      this.setData({ showForm: true });
    }
  },

  onLogoError() {
    this.setData({ logoFailed: true });
  },

  onNameInput(e) { this.setData({ realName: e.detail.value }); },

  async onBind() {
    const realName = this.data.realName.trim();
    if (!realName) { wx.showToast({ title: "请输入真实姓名", icon: "none" }); return; }
    this.setData({ loading: true });
    try {
      const res = await wx.login();
      if (!res.code) throw new Error("微信登录失败");
      const api = require("../../utils/api");
      const result = await api.bindLogin(res.code, realName);
      app.setSession(result.token, result.user);
      wx.switchTab({ url: "/pages/tasks/tasks" });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "绑定失败", icon: "none" });
    }
  },

  async onWxLogin() {
    this.setData({ loading: true });
    try {
      const res = await wx.login();
      if (!res.code) throw new Error("微信登录失败");
      const api = require("../../utils/api");
      const result = await api.wxLogin(res.code);
      app.setSession(result.token, result.user);
      wx.switchTab({ url: "/pages/tasks/tasks" });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "登录失败", icon: "none" });
      // 自动登录失败（如后台解绑了 openid），清除旧凭据并展示表单
      app.clearSession();
      this.setData({ showForm: true, realName: "" });
    }
  },
});
