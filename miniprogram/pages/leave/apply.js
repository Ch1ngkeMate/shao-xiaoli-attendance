const api = require("../../utils/api");

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"];
const PERIODS = ["第1节", "第2节", "第3节", "第4节", "第5节"];

Page({
  data: {
    category: "DUTY",
    meetingId: "",
    dutyWeekday: 0,
    dutyPeriod: 0,
    reason: "",
    meetings: [],
    submitting: false,
    weekdayLabels: WEEKDAYS,
    periodLabels: PERIODS,

    // 用户实际值班安排
    myDutySlots: [],       // { weekday, period, label }
    dutySlotIndex: 0,
    hasDuty: false,
    dutyLoading: false,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    if (options.meetingId) {
      this.setData({ category: "MEETING", meetingId: options.meetingId });
    }
    if (options.category) {
      this.setData({ category: options.category });
    }
    this.loadMeetings();
    this.loadMyDuty();
  },

  async loadMeetings() {
    try {
      const res = await api.getMeetings();
      this.setData({ meetings: res.meetings || [] });
    } catch (err) {}
  },

  async loadMyDuty() {
    this.setData({ dutyLoading: true });
    try {
      const me = getApp().globalData.user;
      if (!me || !me.id) return;
      const res = await api.getDuty();
      const myAssignments = (res.assignments || []).filter((a) => a.userId === me.id || (a.user && a.user.id === me.id));
      // 去重：同一时段只保留一条
      const seen = new Set();
      const myDutySlots = [];
      myAssignments.forEach((a) => {
        const key = `${a.weekday}-${a.period}`;
        if (!seen.has(key)) {
          seen.add(key);
          myDutySlots.push({
            weekday: a.weekday,
            period: a.period,
            label: `${WEEKDAYS[a.weekday]} ${PERIODS[a.period]}`,
          });
        }
      });
      const hasDuty = myDutySlots.length > 0;
      this.setData({
        myDutySlots,
        hasDuty,
        dutyLoading: false,
        // 默认选中第一项
        dutyWeekday: hasDuty ? myDutySlots[0].weekday : 0,
        dutyPeriod: hasDuty ? myDutySlots[0].period : 0,
      });
    } catch (err) {
      this.setData({ dutyLoading: false });
    }
  },

  onCategoryChange(e) {
    this.setData({ category: e.currentTarget.dataset.cat });
  },

  onWeekdayChange(e) {
    this.setData({ dutyWeekday: parseInt(e.detail.value) });
  },

  onPeriodChange(e) {
    this.setData({ dutyPeriod: parseInt(e.detail.value) });
  },

  /** 从我的值班列表中选取时段 */
  onDutySlotChange(e) {
    const idx = parseInt(e.detail.value);
    const slot = this.data.myDutySlots[idx];
    if (slot) {
      this.setData({ dutySlotIndex: idx, dutyWeekday: slot.weekday, dutyPeriod: slot.period });
    }
  },

  onMeetingChange(e) {
    const idx = e.detail.value;
    const meetings = this.data.meetings;
    if (meetings && meetings[idx]) {
      this.setData({ meetingId: meetings[idx].id });
    }
  },

  onReasonInput(e) {
    this.setData({ reason: e.detail.value });
  },

  async onSubmit() {
    if (!this.data.reason.trim()) {
      wx.showToast({ title: "请输入请假原因", icon: "none" });
      return;
    }
    this.setData({ submitting: true });

    const body = {
      category: this.data.category,
      reason: this.data.reason.trim(),
    };
    if (this.data.category === "MEETING") {
      body.meetingId = this.data.meetingId;
    } else {
      body.dutyWeekday = this.data.dutyWeekday;
      body.dutyPeriod = this.data.dutyPeriod;
    }

    try {
      await api.applyLeave(body);
      wx.showToast({ title: "提交成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (err) {
      wx.showToast({ title: err.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
