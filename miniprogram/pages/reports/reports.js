const api = require("../../utils/api");

Page({
  data: {
    currentMonth: "",
    stats: null,
    loading: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    const now = new Date();
    const m = (now.getMonth() + 1).toString().padStart(2, "0");
    this.setData({ currentMonth: `${now.getFullYear()}-${m}` }, () => {
      this.loadReport();
    });
  },

  onMonthChange(e) {
    this.setData({ currentMonth: e.detail.value }, () => {
      this.loadReport();
    });
  },

  async loadReport() {
    this.setData({ loading: true });
    try {
      const res = await api.getMonthlyReport(this.data.currentMonth);
      const people = res.stats?.people || [];
      this.setData({ stats: people, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },
});
