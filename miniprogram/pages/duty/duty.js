const api = require("../../utils/api");
const { formatTime, formatDate } = require("../../utils/format");

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"];
const PERIODS = ["第1节", "第2节", "第3节", "第4节", "第5节"];

Page({
  data: {
    activeTab: 0,
    tabs: [],

    // 值班
    dutyGrid: [[],[],[],[],[]].map(() => [[],[],[],[],[]]),
    dutyLoading: false,

    // 值班编辑（管理员/部长）
    showDutySheet: false,
    dutyPick: { w: -1, p: -1 },
    assignableUsers: [],
    dutyUserIndex: -1,
    dutyDeptLabel: "",

    // 会议
    meetings: [],
    meetingsLoading: false,

    // 请假
    leaves: [],
    leavesLoading: false,

    // 请假审批弹窗
    showLeaveSheet: false,
    reviewingLeave: null,
    leaveSlip: { reason: "", timeStr: "", eventStr: "", applicant: "", dateStr: "" },
    rejectPhase: false,
    rejectReason: "",
    leaveSubmitting: false,

    // 移除值班确认弹窗
    showDutyRemoveConfirm: false,
    dutyRemoveAid: null,

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

  noop() {},

  onShow() {
    const app = getApp();
    const isAdminOrMinister = app.hasRole("ADMIN", "MINISTER");
    const tabs = isAdminOrMinister
      ? ["值班表", "会议", "请假", "统计"]
      : ["值班表", "会议", "请假"];
    this.setData({ tabs, showStats: isAdminOrMinister, isAdmin: isAdminOrMinister });
    this.loadTab(this.data.activeTab);
    if (isAdminOrMinister) this.loadAssignable();
  },

  async loadAssignable() {
    try {
      const res = await api.getAssignableUsers();
      this.setData({ assignableUsers: res.users || [] });
    } catch (e) { /* 静默失败 */ }
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

  onPullDownRefresh() {
    this.loadTab(this.data.activeTab);
    // 各加载方法各自 setData loading 后停止下拉动画
    setTimeout(() => wx.stopPullDownRefresh(), 2000);
  },

  // ===== 值班表 =====

  async loadDuty() {
    this.setData({ dutyLoading: true });
    try {
      const res = await api.getDuty();
      // 预初始化 5×5 格子，避免 undefined 导致空单元格不渲染
      const grid = [];
      for (let w = 0; w < 5; w++) {
        grid[w] = [];
        for (let p = 0; p < 5; p++) {
          grid[w][p] = [];
        }
      }
      (res.assignments || []).forEach((a) => {
        if (a.weekday >= 0 && a.weekday < 5 && a.period >= 0 && a.period < 5) {
          grid[a.weekday][a.period].push({ aid: a.id, ...a.user, deptLabel: a.deptLabel });
        }
      });
      this.setData({ dutyGrid: grid, dutyLoading: false });
    } catch (err) {
      this.setData({ dutyLoading: false });
    }
  },

  // ===== 值班编辑（管理员/部长）=====

  onAddTap(e) {
    const w = parseInt(e.currentTarget.dataset.w);
    const p = parseInt(e.currentTarget.dataset.p);
    this.setData({
      showDutySheet: true,
      dutyPick: { w, p },
      dutyUserIndex: -1,
      dutyDeptLabel: "",
    });
  },

  onCloseDutySheet() {
    this.setData({ showDutySheet: false });
  },

  onDutyUserChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ dutyUserIndex: idx });
  },

  onDutyDeptLabelInput(e) {
    this.setData({ dutyDeptLabel: e.detail.value });
  },

  async onConfirmAdd() {
    const { dutyPick, dutyUserIndex, assignableUsers, dutyDeptLabel } = this.data;
    if (dutyUserIndex < 0 || !assignableUsers[dutyUserIndex]) {
      wx.showToast({ title: "请选择干事", icon: "none" });
      return;
    }
    try {
      await api.addDuty(
        dutyPick.w,
        dutyPick.p,
        assignableUsers[dutyUserIndex].id,
        dutyDeptLabel.trim() || undefined,
      );
      wx.showToast({ title: "已安排", icon: "success" });
      this.setData({ showDutySheet: false });
      this.loadDuty();
    } catch (err) {
      wx.showToast({ title: err.message || "添加失败", icon: "none" });
    }
  },

  async onRemoveTap(e) {
    const aid = e.currentTarget.dataset.aid;
    this.setData({ showDutyRemoveConfirm: true, dutyRemoveAid: aid });
  },

  cancelDutyRemove() {
    this.setData({ showDutyRemoveConfirm: false, dutyRemoveAid: null });
  },

  async confirmRemoveDuty(e) {
    const aid = (e && e.currentTarget && e.currentTarget.dataset.aid) || this.data.dutyRemoveAid;
    try {
      await api.removeDuty(aid);
      wx.showToast({ title: "已移除", icon: "success" });
      this.setData({ showDutyRemoveConfirm: false, dutyRemoveAid: null });
      this.loadDuty();
    } catch (err) {
      wx.showToast({ title: err.message || "移除失败", icon: "none" });
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

  // ===== 发布会议 =====
  onAddMeeting() {
    const now = new Date();
    const dates = []; const hours = []; const mins = ['00', '15', '30', '45'];
    for (let d = 0; d < 14; d++) { const day = new Date(now); day.setDate(day.getDate()+d); dates.push(`${day.getMonth()+1}月${day.getDate()}日`); }
    for (let h = 0; h < 24; h++) hours.push(`${h.toString().padStart(2,'0')}时`);
    this.setData({
      showMeetingSheet: true, meetingTitle: '', meetingPlace: '', meetingDesc: '',
      meetingStartIdx: [0,12,0], meetingEndIdx: [0,14,0],
      meetingStartLabel: '', meetingEndLabel: '',
      dateTimeRange: [dates, hours, mins],
    });
  },
  onMeetingTitleInput(e) { this.setData({ meetingTitle: e.detail.value }); },
  onMeetingPlaceInput(e) { this.setData({ meetingPlace: e.detail.value }); },
  onMeetingDescInput(e) { this.setData({ meetingDesc: e.detail.value }); },

  _meetingLabel(idx) {
    if (!this.data.dateTimeRange) return '';
    const [dates, hours, mins] = this.data.dateTimeRange;
    return (dates[idx[0]] || '') + ' ' + (hours[idx[1]] || '') + (mins[idx[2]] || '');
  },
  onMeetingStartViewChange(e) {
    const idx = e.detail.value;
    this.setData({ meetingStartIdx: idx, meetingStartLabel: this._meetingLabel(idx) });
  },
  onMeetingEndViewChange(e) {
    const idx = e.detail.value;
    this.setData({ meetingEndIdx: idx, meetingEndLabel: this._meetingLabel(idx) });
  },
  onMeetingStartChange(e) { this.setData({ meetingStartIdx: e.detail.value }); },
  onMeetingEndChange(e) { this.setData({ meetingEndIdx: e.detail.value }); },
  onCloseMeetingSheet() { this.setData({ showMeetingSheet: false }); },
  async onConfirmMeeting() {
    if (!this.data.meetingTitle.trim()) { wx.showToast({ title: '请输入主题', icon: 'none' }); return; }
    const now = new Date();
    const mins = ['00', '15', '30', '45'];
    const mk = (idx) => { const d = new Date(now); d.setDate(d.getDate()+idx[0]); d.setHours(idx[1], parseInt(mins[idx[2]]), 0, 0); return d.toISOString(); };
    try {
      await api.createMeeting({
        title: this.data.meetingTitle.trim(),
        startTime: mk(this.data.meetingStartIdx),
        endTime: mk(this.data.meetingEndIdx),
        place: this.data.meetingPlace.trim() || undefined,
        description: this.data.meetingDesc.trim() || undefined,
      });
      wx.showToast({ title: '已发布', icon: 'success' });
      this.setData({ showMeetingSheet: false });
      this.loadMeetings();
    } catch (err) { wx.showToast({ title: err.message || '发布失败', icon: 'none' }); }
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

  // ===== 请假审批（管理员/部长）— 对齐 Web LeaveSlipModal =====
  onLeaveTap(e) {
    if (!this.data.isAdmin) return;
    const { id, status } = e.currentTarget.dataset;
    if (status !== 'PENDING') return;

    // 从列表中取出对应请假记录
    const leave = this.data.leaves.find(l => l.id === id);
    if (!leave) return;

    // 构建请假条字段（与 Web buildSlipFields 一致）
    const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"];
    const PERIODS = ["第1节", "第2节", "第3节", "第4节", "第5节"];
    const reason = (leave.reason || "").trim() || "—";
    let timeStr = "—";
    let eventStr = "—";
    if (leave.category === "MEETING" && leave.meeting) {
      timeStr = this.formatTime(leave.meeting.startTime);
      eventStr = leave.meeting.title;
    } else if (leave.category === "DUTY" && leave.dutyWeekday != null && leave.dutyPeriod != null) {
      timeStr = WEEKDAYS[leave.dutyWeekday] + PERIODS[leave.dutyPeriod];
      eventStr = "值班";
    } else if (leave.category === "DUTY") {
      eventStr = "值班";
    } else {
      eventStr = "会议";
    }
    const applicant = (leave.user && leave.user.displayName) || "—";
    const dateStr = this.formatDate(leave.createdAt);

    this.setData({
      showLeaveSheet: true,
      reviewingLeave: leave,
      leaveSlip: { reason, timeStr, eventStr, applicant, dateStr },
      rejectPhase: false,
      rejectReason: "",
    });
  },

  onCloseLeaveSheet() {
    this.setData({ showLeaveSheet: false, reviewingLeave: null, rejectPhase: false, rejectReason: "" });
  },

  onApproveLeave() {
    if (!this.data.reviewingLeave) return;
    this.decideLeave(this.data.reviewingLeave.id, 'APPROVED', '');
  },

  onRejectLeave() {
    this.setData({ rejectPhase: true });
  },

  onCancelReject() {
    this.setData({ rejectPhase: false, rejectReason: "" });
  },

  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  async onConfirmReject() {
    if (!this.data.reviewingLeave) return;
    this.setData({ leaveSubmitting: true });
    try {
      await api.decideLeave(
        this.data.reviewingLeave.id,
        false,
        this.data.rejectReason.trim()
      );
      wx.showToast({ title: '已驳回', icon: 'success' });
      this.setData({ showLeaveSheet: false, reviewingLeave: null, rejectPhase: false, rejectReason: "", leaveSubmitting: false });
      this.loadLeaves();
    } catch (err) {
      this.setData({ leaveSubmitting: false });
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  async decideLeave(leaveId, result, reason) {
    this.setData({ leaveSubmitting: true });
    try {
      await api.decideLeave(leaveId, result === 'APPROVED', reason);
      wx.showToast({ title: result === 'APPROVED' ? '已同意' : '已驳回', icon: 'success' });
      this.setData({ showLeaveSheet: false, reviewingLeave: null, rejectPhase: false, rejectReason: "", leaveSubmitting: false });
      this.loadLeaves();
    } catch (err) {
      this.setData({ leaveSubmitting: false });
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  // ===== 统计 =====

  async loadStats() {
    this.setData({ statsLoading: true });
    try {
      const res = await api.getAttendanceStats(this.data.currentMonth);
      const people = (res.stats?.people || []).sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
      this.setData({ stats: people, statsLoading: false });
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

  // formatTime / formatDate 从 utils/format.js 引用

  getLeaveStatus(status) {
    const map = { PENDING: "待审批", APPROVED: "已通过", REJECTED: "已驳回" };
    return map[status] || status;
  },
});
