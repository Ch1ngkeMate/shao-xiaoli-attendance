const api = require("../../utils/api");

const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

Page({
  data: {
    currentMonth: "",
    stats: null,
    loading: false,
    showMonthSheet: false,
    pickerYear: new Date().getFullYear(),
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, "0");
    this.setData({ currentMonth: `${y}-${m}`, pickerYear: y }, () => {
      this.loadReport();
    });
  },

  openMonthPicker() {
    const [y] = this.data.currentMonth.split("-");
    this.setData({ showMonthSheet: true, pickerYear: parseInt(y) });
  },

  onPickerYearPrev() {
    this.setData({ pickerYear: this.data.pickerYear - 1 });
  },

  onPickerYearNext() {
    this.setData({ pickerYear: this.data.pickerYear + 1 });
  },

  onMonthSelect(e) {
    const m = e.currentTarget.dataset.month;
    const mm = m < 10 ? "0" + m : "" + m;
    const val = `${this.data.pickerYear}-${mm}`;
    this.setData({ currentMonth: val, showMonthSheet: false }, () => {
      this.loadReport();
    });
  },

  closeMonthPicker() {
    this.setData({ showMonthSheet: false });
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
