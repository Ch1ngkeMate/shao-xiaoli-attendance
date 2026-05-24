const api = require("../../utils/api");
const { fixUrl } = require("../../utils/format");

Page({
  data: {
    profileUser: null,
    attendance: null,
    loading: true,
    currentMonth: "",
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    this.userId = options.id;
    const now = new Date();
    const m = (now.getMonth() + 1).toString().padStart(2, "0");
    this.setData({ currentMonth: `${now.getFullYear()}-${m}` });
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const res = await api.getUserProfile(this.userId, this.data.currentMonth);
      const profileUser = res.user;
      // 补全头像 URL
      if (profileUser && profileUser.avatarUrl) {
        profileUser.avatarUrl = fixUrl(profileUser.avatarUrl);
      }
      this.setData({
        profileUser,
        attendance: res.row,
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  roleLabel(role) {
    const map = { ADMIN: "管理员", MINISTER: "部长", MEMBER: "部员" };
    return map[role] || role;
  },
});
