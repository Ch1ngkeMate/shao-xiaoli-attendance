const api = require("../../utils/api");
const { fixUrl } = require("../../utils/format");

Page({
  data: {
    username: "",
    currentPassword: "",
    newPassword: "",
    submitting: false,
    bgPreviewUrl: "",
    buildVersion: "",
    startPage: "tasks",
    startPageIndex: 0,
    startPageOptions: ["任务大厅", "消息", "值班表", "我的", "课程表"],
    startPageValues: ["tasks", "messages", "duty", "profile", "schedule"],
  },

  onShow() {
    const user = getApp().globalData.user;
    if (user) {
      this.setData({
        username: user.username || "",
        bgPreviewUrl: fixUrl(user.profileBgUrl) || "",
      });
    }
    const startPage = getApp().getStartPage();
    const startPageIndex = this.data.startPageValues.indexOf(startPage);
    this.setData({ startPage, startPageIndex: startPageIndex >= 0 ? startPageIndex : 0 });
    // 获取版本号
    this.loadVersion();
  },

  async loadVersion() {
    try {
      const res = await api.getVersion();
      this.setData({ buildVersion: res.buildId ? res.buildId.substring(0, 8) : '-' });
    } catch (e) {
      this.setData({ buildVersion: '-' });
    }
  },

  onUsernameInput(e) { this.setData({ username: e.detail.value }); },
  onCurrentPwdInput(e) { this.setData({ currentPassword: e.detail.value }); },
  onNewPwdInput(e) { this.setData({ newPassword: e.detail.value }); },

  onStartPageChange(e) {
    const index = Number(e.detail.value);
    const startPage = this.data.startPageValues[index] || "tasks";
    getApp().setStartPage(startPage);
    this.setData({ startPage, startPageIndex: index });
    wx.showToast({ title: "起始页已设置", icon: "success" });
  },

  async onChangeAvatar() {
    const that = this;
    wx.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"],
      success(res) { that.uploadAvatar(res.tempFilePaths[0]); }
    });
  },
  async uploadAvatar(filePath) {
    try {
      const res = await api.uploadFile(filePath, "avatar");
      const saved = await api.updateMe({ avatarUrl: res.url });
      const app = getApp();
      // 用服务端回传的 user 覆盖缓存（里面是入库的原始相对路径，交给 fixUrl 统一补全）。
      // 过去这里直接写 res.url 并把整个 globalData.user 存进 storage，与 /api/me
      // 的返回结构不一致，换完头像后不同页面读到的 avatarUrl 形态会不一样。
      if (saved && saved.user) {
        app.globalData.user = saved.user;
        wx.setStorageSync("sxl_user", saved.user);
      } else {
        app.globalData.user.avatarUrl = res.url;
        wx.setStorageSync("sxl_user", app.globalData.user);
      }
      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (err) {
      wx.showToast({ title: "上传失败", icon: "none" });
    }
  },

  async onChangeBg() {
    const that = this;
    wx.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"],
      success(res) { that.uploadBg(res.tempFilePaths[0]); }
    });
  },
  async uploadBg(filePath) {
    try {
      const resUpload = await api.uploadFile(filePath, "avatar");
      const res = await api.updateMe({ profileBgUrl: resUpload.url });
      const app = getApp();
      app.globalData.user = res.user;
      wx.setStorageSync("sxl_user", res.user);
      // 统一走 fixUrl，不要在这里手写 base 拼接（重复实现容易漏掉 config 兜底）
      this.setData({ bgPreviewUrl: fixUrl(res.user.profileBgUrl) || "" });
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
        wx.showToast({ title: "新密码至少6位", icon: "none" }); return;
      }
      body.currentPassword = this.data.currentPassword;
      body.newPassword = this.data.newPassword;
    }
    if (Object.keys(body).length === 0) {
      wx.showToast({ title: "无修改", icon: "none" }); return;
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
