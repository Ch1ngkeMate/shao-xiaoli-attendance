const api = require("../../utils/api");

Page({
  data: {
    meeting: null,
    members: [],
    checkIns: [],
    loading: true,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    if (!getApp().hasRole("ADMIN", "MINISTER")) {
      wx.showToast({ title: "无权限", icon: "none" });
      wx.navigateBack();
      return;
    }
    this.meetingId = options.id;
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [detailRes, checkInRes] = await Promise.all([
        api.getMeetingDetail(this.meetingId),
        api.getCheckInList(this.meetingId),
      ]);

      const memberNameMap = {};
      (detailRes.members || []).forEach((m) => { memberNameMap[m.id] = m.displayName; });

      // 已签到 + 未签到（带姓名）
      const checkedInList = (checkInRes.checkIns || []).map((c) => ({
        ...c,
        displayName: c.user ? c.user.displayName : (memberNameMap[c.userId] || c.userId),
        createdAt: c.createdAt,
      }));

      const checkedInIds = new Set((checkInRes.checkIns || []).map((c) => c.userId));
      const notCheckedIn = (checkInRes.members || []).filter((m) => !checkedInIds.has(m.id));

      this.setData({
        meeting: detailRes.meeting,
        checkIns: checkedInList,
        members: detailRes.members || [],
        notCheckedIn,
        totalMembers: (detailRes.members || []).length,
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
});
