const api = require("../../utils/api");

Page({
  data: {
    announcement: null,
    loading: true,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    this.announceId = options.id;
    this.loadDetail();
  },

  async loadDetail() {
    try {
      const res = await api.getAnnouncementDetail(this.announceId);
      this.setData({ announcement: res.announcement, loading: false });
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
});
