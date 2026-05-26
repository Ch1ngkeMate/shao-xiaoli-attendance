const api = require("../../utils/api");
const { formatTime } = require("../../utils/format");

Page({
  data: {
    meeting: null,
    members: [],
    leaves: [],
    absences: [],
    checkIns: [],
    loading: true,
    isAdminOrMinister: false,
    isMEMBER: false,

    // 关会
    absentUserIds: [],
    showEndConfirm: false,
    ending: false,
    approvedUserIds: [],

    // 签到
    checkingIn: false,
    checkInResult: null, // { success, distance, message }
    showGpsPermModal: false,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    this.meetingId = options.id;
    const app = getApp();
    this.setData({
      isAdminOrMinister: app.hasRole("ADMIN", "MINISTER"),
      isMEMBER: app.hasRole("MEMBER"),
    });
    this.loadDetail();
  },

  async loadDetail() {
    try {
      const res = await api.getMeetingDetail(this.meetingId);
      const approvedUserIds = (res.leaves || [])
        .filter((l) => l.status === "APPROVED")
        .map((l) => l.userId);

      const me = getApp().globalData.user;
      const myCheckIn = (res.checkIns || []).find((c) => c.userId === (me && me.id));

      // 将 userId 映射为 displayName
      const memberNameMap = {};
      (res.members || []).forEach((m) => { memberNameMap[m.id] = m.displayName; });
      const checkIns = (res.checkIns || []).map((c) => ({
        ...c,
        displayName: memberNameMap[c.userId] || c.userId,
      }));

      this.setData({
        meeting: res.meeting,
        members: res.members || [],
        leaves: res.leaves || [],
        absences: res.absences || [],
        checkIns,
        approvedUserIds,
        loading: false,
        hasCheckedIn: !!myCheckIn,
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

  // ========== GPS 签到 ==========

  onCheckIn() {
    const that = this;
    wx.getLocation({
      type: "gcj02",
      timeout: 10000,
      success(res) {
        that.doCheckIn(res.latitude, res.longitude);
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf("auth deny") >= 0) {
          that.setData({ showGpsPermModal: true });
        } else {
          wx.showToast({ title: "获取位置失败，请重试", icon: "none" });
        }
      },
    });
  },

  confirmGpsPerm() {
    this.setData({ showGpsPermModal: false });
    wx.openSetting();
  },

  cancelGpsPerm() {
    this.setData({ showGpsPermModal: false });
  },

  async doCheckIn(lat, lng) {
    this.setData({ checkingIn: true, checkInResult: null });
    try {
      const res = await api.checkInMeeting(this.meetingId, lat, lng);
      if (res.success) {
        wx.showToast({ title: `签到成功（${res.distance}m）`, icon: "success" });
      } else {
        wx.showToast({ title: res.message || "签到失败", icon: "none", duration: 3000 });
      }
      this.setData({ checkInResult: res, checkingIn: false });
      this.loadDetail();
    } catch (err) {
      this.setData({ checkingIn: false });
      wx.showToast({ title: err.message || "签到失败", icon: "none" });
    }
  },

  onViewCheckInList() {
    wx.navigateTo({ url: `/pages/meetings/checkin-list?id=${this.meetingId}` });
  },

  // ========== 关会 ==========

  onToggleAbsent(e) {
    const userId = e.currentTarget.dataset.uid;
    const { approvedUserIds } = this.data;
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

  onShareAppMessage() {
    const m = this.data.meeting;
    if (!m) return { title: "干事考勤系统", path: "/pages/duty/duty" };
    return {
      title: `会议通知：${m.title}`,
      path: `/pages/meetings/detail?id=${this.meetingId}`,
    };
  },
});
