const api = require("../../utils/api");

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"];
const PERIODS = ["第1节", "第2节", "第3节", "第4节", "第5节"];

Page({
  data: {
    activeTab: 0,
    tabs: ["值班表", "会议", "请假", "统计"],

    // 值班
    dutyGrid: [[],[],[],[],[]],
    dutyLoading: false,

    // 会议
    meetings: [],
    meetingsLoading: false,

    // 请假
    leaves: [],
    leavesLoading: false,

    // 统计（MINISTER/ADMIN）
    stats: null,
    statsLoading: false,
    showStats: false,
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
    const app = getApp();
    this.setData({ showStats: app.hasRole("ADMIN", "MINISTER") });
    this.loadTab(this.data.activeTab);
  },

  onTabChange(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ activeTab: idx });
    this.loadTab(idx);
  },

  loadTab(idx) {
    switch (idx) {
      case 0: this.loadDuty(); break;
      case 1: this.loadMeetings(); break;
      case 2: this.loadLeaves(); break;
      case 3: if (this.data.showStats) this.loadStats(); break;
    }
  },

  // ===== 值班表 =====

  async loadDuty() {
    this.setData({ dutyLoading: true });
    try {
      const res = await api.getDuty();
      const grid = [[],[],[],[],[]];
      (res.assignments || []).forEach((a) => {
        if (a.weekday >= 0 && a.weekday < 5) {
          if (!grid[a.weekday][a.period]) grid[a.weekday][a.period] = [];
          grid[a.weekday][a.period].push(a.user);
        }
      });
      this.setData({ dutyGrid: grid, dutyLoading: false });
    } catch (err) {
      this.setData({ dutyLoading: false });
    }
  },

  // ===== 会议 =====

  async loadMeetings() {
    this.setData({ meetingsLoading: true });
    try {
      const res = await api.getMeetings();
      this.setData({ meetings: res.meetings || [], meetingsLoading: false });
    } catch (err) {
      this.setData({ meetingsLoading: false });
    }
  },

  onMeetingTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/meetings/detail?id=${id}` });
  },

  // ===== 请假 =====

  async loadLeaves() {
    this.setData({ leavesLoading: true });
    try {
      const res = await api.getLeaves();
      this.setData({ leaves: res.list || [], leavesLoading: false });
    } catch (err) {
      this.setData({ leavesLoading: false });
    }
  },

  onApplyLeave() {
    wx.navigateTo({ url: "/pages/leave/apply" });
  },

  // ===== 统计 =====

  async loadStats() {
    this.setData({ statsLoading: true });
    try {
      const res = await api.getAttendanceStats(this.data.currentMonth);
      this.setData({ stats: res.stats, statsLoading: false });
    } catch (err) {
      this.setData({ statsLoading: false });
    }
  },

  onStatTap(e) {
    const userId = e.currentTarget.dataset.userId;
    if (userId) {
      wx.navigateTo({ url: `/pages/others/profile?id=${userId}` });
    }
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

  getLeaveStatus(status) {
    const map = { PENDING: "待审批", APPROVED: "已通过", REJECTED: "已驳回" };
    return map[status] || status;
  },
});
