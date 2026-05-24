const api = require("../../utils/api");

Page({
  data: {
    username: "",
    currentPassword: "",
    newPassword: "",
    submitting: false,
  },

  onShow() {
    const user = getApp().globalData.user;
    if (user) this.setData({ username: user.username || "" });
  },

  onUsernameInput(e) { this.setData({ username: e.detail.value }); },
  onCurrentPwdInput(e) { this.setData({ currentPassword: e.detail.value }); },
  onNewPwdInput(e) { this.setData({ newPassword: e.detail.value }); },

  async onChangeAvatar() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success(res) {
        that.uploadAvatar(res.tempFilePaths[0]);
      },
    });
  },

  async uploadAvatar(filePath) {
    try {
      const res = await api.uploadFile(filePath, "avatar");
      await api.updateMe({ avatarUrl: res.url });
      const app = getApp();
      app.globalData.user.avatarUrl = res.url;
      wx.setStorageSync("sxl_user", app.globalData.user);
      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (err) {
      wx.showToast({ title: "上传失败", icon: "none" });
    }
  },

  async onChangeBg() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success(res) {
        that.uploadBg(res.tempFilePaths[0]);
      },
    });
  },

  async uploadBg(filePath) {
    try {
      const resUpload = await api.uploadFile(filePath, "avatar");
      const res = await api.updateMe({ profileBgUrl: resUpload.url });
      const app = getApp();
      app.globalData.user = res.user;
      wx.setStorageSync("sxl_user", res.user);
      wx.showToast({ title: "背景已更新", icon: "success" });
    } catch (err) {
      wx.showToast({ title: "上传失败", icon: "none" });
    }
  },

  async onSave() {
    const body = {};
    if (this.data.username && this.data.username !== getApp().globalData.user.username) {
      body.username = this.data.username;
    }
    if (this.data.currentPassword && this.data.newPassword) {
      if (this.data.newPassword.length < 6) {
        wx.showToast({ title: "新密码至少6位", icon: "none" });
        return;
      }
      body.currentPassword = this.data.currentPassword;
      body.newPassword = this.data.newPassword;
    }

    if (Object.keys(body).length === 0) {
      wx.showToast({ title: "无修改", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await api.updateMe(body);
      const app = getApp();
      app.globalData.user = res.user;
      wx.setStorageSync("sxl_user", res.user);
      wx.showToast({ title: "已保存", icon: "success" });
      this.setData({ currentPassword: "", newPassword: "" });
    } catch (err) {
      wx.showToast({ title: err.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
