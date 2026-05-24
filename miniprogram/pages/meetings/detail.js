const api = require("../../utils/api");

Page({
  data: {
    meeting: null,
    members: [],
    leaves: [],
    absences: [],
    loading: true,
    isAdminOrMinister: false,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    this.meetingId = options.id;
    this.setData({ isAdminOrMinister: getApp().hasRole("ADMIN", "MINISTER") });
    this.loadDetail();
  },

  async loadDetail() {
    try {
      const res = await api.getMeetingDetail(this.meetingId);
      this.setData({
        meeting: res.meeting,
        members: res.members || [],
        leaves: res.leaves || [],
        absences: res.absences || [],
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  onApplyLeave() {
    wx.navigateTo({
      url: `/pages/leave/apply?meetingId=${this.meetingId}&category=MEETING`,
    });
  },

  formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const h = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${m}-${day} ${h}:${min}`;
  },

  onShareAppMessage() {
    const m = this.data.meeting;
    if (!m) return { title: "干事考勤系统", path: "/pages/duty/duty" };
    return {
      title: `会议通知：${m.title}`,
      path: `/pages/meetings/detail?id=${this.meetingId}`,
    };
  },
});
