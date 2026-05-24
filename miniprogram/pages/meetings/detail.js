const api = require("../../utils/api");
const { formatTime } = require("../../utils/format");

Page({
  data: {
    meeting: null,
    members: [],
    leaves: [],
    absences: [],
    loading: true,
    isAdminOrMinister: false,

    // 关会
    absentUserIds: [],
    showEndConfirm: false,
    ending: false,
    approvedUserIds: [],
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
      // 已准假的用户 ID 集合
      const approvedUserIds = (res.leaves || [])
        .filter((l) => l.status === "APPROVED")
        .map((l) => l.userId);

      this.setData({
        meeting: res.meeting,
        members: res.members || [],
        leaves: res.leaves || [],
        absences: res.absences || [],
        approvedUserIds,
        loading: false,
        // 重置关会状态
        absentUserIds: res.meeting && res.meeting.status === "OPEN" ? [] : this.data.absentUserIds,
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

  // ========== 关会 ==========

  onToggleAbsent(e) {
    const userId = e.currentTarget.dataset.uid;
    const { approvedUserIds } = this.data;
    // 已准假的不可选
    if (approvedUserIds.indexOf(userId) >= 0) return;

    const absent = [...this.data.absentUserIds];
    const idx = absent.indexOf(userId);
    if (idx >= 0) {
      absent.splice(idx, 1);
    } else {
      absent.push(userId);
    }
    this.setData({ absentUserIds: absent });
  },

  onOpenEndConfirm() {
    this.setData({ showEndConfirm: true });
  },

  onCloseEndConfirm() {
    this.setData({ showEndConfirm: false });
  },

  async onConfirmEnd() {
    this.setData({ ending: true });
    try {
      // 过滤掉已准假的人员（后端也会校验，但前端提前过滤）
      const { absentUserIds, approvedUserIds } = this.data;
      const realAbsent = absentUserIds.filter((uid) => approvedUserIds.indexOf(uid) < 0);
      await api.endMeeting(this.meetingId, realAbsent);
      wx.showToast({ title: "会议已结束，已记录旷会扣分", icon: "success" });
      this.setData({ showEndConfirm: false, ending: false });
      this.loadDetail();
    } catch (err) {
      this.setData({ ending: false });
      wx.showToast({ title: err.message || "操作失败", icon: "none" });
    }
  },

  // formatTime 从 utils/format.js 引用

  onShareAppMessage() {
    const m = this.data.meeting;
    if (!m) return { title: "干事考勤系统", path: "/pages/duty/duty" };
    return {
      title: `会议通知：${m.title}`,
      path: `/pages/meetings/detail?id=${this.meetingId}`,
    };
  },
});
