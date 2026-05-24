const api = require("../../utils/api");

Page({
  data: {
    user: null,
    attendanceSummary: null,
    loading: true,
    isAdminOrMinister: false,
    currentMonth: "",
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    const now = new Date();
    const m = (now.getMonth() + 1).toString().padStart(2, "0");
    this.setData({ currentMonth: `${now.getFullYear()}-${m}` });
  },

  onShow() {
    if (!getApp().checkLogin()) return;
    this.setData({
      user: getApp().globalData.user,
      isAdminOrMinister: getApp().hasRole("ADMIN", "MINISTER"),
    });
    this.loadAttendance();
  },

  async loadAttendance() {
    try {
      const res = await api.getMyAttendance(this.data.currentMonth);
      this.setData({ attendanceSummary: res.row, loading: false });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  onSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  onReports() {
    wx.navigateTo({ url: "/pages/reports/reports" });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "确定要退出当前账号吗？",
      success: (res) => {
        if (res.confirm) {
          getApp().clearSession();
          wx.reLaunch({ url: "/pages/login/login" });
        }
      },
    });
  },

  roleLabel(role) {
    const map = { ADMIN: "管理员", MINISTER: "部长", MEMBER: "部员" };
    return map[role] || role;
  },
});
