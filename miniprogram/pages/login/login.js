const api = require("../../utils/api");
const { getApiBase } = require("../../utils/config");

Page({
  data: {
    realName: "",
    loading: false,
    logoUrl: getApiBase() + "/dept-logo.png",
    logoFailed: false,
    autoLogin: false,
  },

  onLoad() {
    if (wx.getStorageSync("sxl_bound")) {
      this.setData({ autoLogin: true });
      this.onWxLogin();
    }
  },

  onLogoError() {
    this.setData({ logoFailed: true });
  },

  onNameInput(e) {
    this.setData({ realName: (e.detail.value || "").trim() });
  },

  wxLoginCode() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) resolve(res.code);
          else reject(new Error("获取微信 code 失败"));
        },
        fail: reject,
      });
    });
  },

  async onBind() {
    const realName = this.data.realName;
    if (!realName) {
      wx.showToast({ title: "请输入姓名", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const code = await this.wxLoginCode();
      const data = await api.bindLogin(code, realName);
      if (!data.success) throw new Error(data.message || "绑定失败");
      getApp().setSession(data.token, data.user);
      wx.setStorageSync("sxl_bound", true);
      wx.showToast({ title: "绑定成功", icon: "success" });
      wx.reLaunch({ url: "/pages/tasks/tasks" });
    } catch (e) {
      wx.showToast({
        title: e.message || "绑定失败",
        icon: "none",
        duration: 2500,
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onWxLogin() {
    this.setData({ loading: true });
    try {
      const code = await this.wxLoginCode();
      const data = await api.wxLogin(code);
      if (!data.success) throw new Error(data.message || "登录失败");
      getApp().setSession(data.token, data.user);
      wx.setStorageSync("sxl_bound", true);
      wx.reLaunch({ url: "/pages/tasks/tasks" });
    } catch (e) {
      if (this.data.autoLogin) {
        wx.removeStorageSync("sxl_bound");
        this.setData({ autoLogin: false, loading: false });
        return;
      }
      wx.showToast({
        title: e.message || "请先完成姓名绑定",
        icon: "none",
        duration: 2500,
      });
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: false });
  },
});
