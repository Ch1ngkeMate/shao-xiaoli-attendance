const api = require("../../utils/api");

Page({
  data: {
    message: null,
    loading: true,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    this.messageId = options.id;
    this.loadDetail();
  },

  async loadDetail() {
    try {
      const res = await api.getNotificationDetail(this.messageId);
      this.setData({ message: res.messageItem, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
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

  onJump(e) {
    const item = this.data.message;
    if (!item) return;
    const meta = item.metadata || {};
    switch (item.type) {
      case "TASK":
        if (meta.taskId) {
          wx.navigateTo({ url: `/pages/tasks/detail?id=${meta.taskId}` });
        }
        break;
      case "ANNOUNCEMENT":
        if (meta.announcementId) {
          wx.navigateTo({ url: `/pages/announcements/detail?id=${meta.announcementId}` });
        }
        break;
      case "MEETING":
        if (meta.meetingId) {
          wx.navigateTo({ url: `/pages/meetings/detail?id=${meta.meetingId}` });
        }
        break;
    }
  },
});
