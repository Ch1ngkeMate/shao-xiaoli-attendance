const api = require("../../utils/api");

Page({
  data: {
    category: "DUTY",
    meetingId: "",
    dutyWeekday: 0,
    dutyPeriod: 0,
    reason: "",
    meetings: [],
    submitting: false,
    weekdayLabels: ["周一", "周二", "周三", "周四", "周五"],
    periodLabels: ["第1节", "第2节", "第3节", "第4节", "第5节"],
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
  },

  async loadMeetings() {
    try {
      const res = await api.getMeetings();
      this.setData({ meetings: res.meetings || [] });
    } catch (err) {}
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

  onMeetingChange(e) {
    const idx = e.detail.value;
    this.setData({ meetingId: this.data.meetings[idx].id });
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
