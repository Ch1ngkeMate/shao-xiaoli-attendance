const api = require("../../utils/api");
const { formatTime, fixUrl } = require("../../utils/format");

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
      const announcement = res.announcement;
      if (announcement && announcement.images) {
        announcement.images.forEach((img) => { img.url = fixUrl(img.url); });
      }
      this.setData({ announcement, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  // formatTime 从 utils/format.js 引用
});
