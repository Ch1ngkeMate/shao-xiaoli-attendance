const api = require("../../utils/api");
const { fixUrl, formatTime } = require("../../utils/format");

const STATUS_MAP = {
  OPEN: { label: "进行中", cls: "tag-blue" },
  CLOSED: { label: "已结束", cls: "tag-gray" },
};

Page({
  data: {
    tasks: [],
    loading: false,
    searchText: "",
    activeFilter: "ALL",
    filters: [
      { key: "ALL", label: "全部" },
      { key: "CLAIMABLE", label: "可接取" },
      { key: "FULL", label: "已满" },
      { key: "PENDING", label: "待处理" },
      { key: "ENDED", label: "已结束" },
    ],
    showFab: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    this.checkShowFab();
  },

  onShow() {
    this.checkShowFab();
    this.loadTasks();
  },

  checkShowFab() {
    const app = getApp();
    const showFab = app.hasRole("ADMIN", "MINISTER");
    if (this.data.showFab !== showFab) {
      this.setData({ showFab });
    }
  },

  async loadTasks() {
    this.setData({ loading: true });
    try {
      const params = {};
      if (this.data.searchText) params.q = this.data.searchText;
      if (this.data.activeFilter !== "ALL") {
        params.visibility = this.data.activeFilter;
      }

      const res = await api.getTasks(params);
      const tasks = (res.tasks || []).map((t) => {
        if (t.publisher) t.publisher.avatarUrl = fixUrl(t.publisher.avatarUrl);
        if (t.images) t.images.forEach((img) => { img.url = fixUrl(img.url); });
        return t;
      });
      this.setData({ tasks, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
  },

  onSearch() {
    this.loadTasks();
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key }, () => {
      this.loadTasks();
    });
  },

  onTaskTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/tasks/detail?id=${id}` });
  },

  onPublish() {
    wx.navigateTo({ url: "/pages/publish/publish" });
  },

  onPullDownRefresh() {
    this.loadTasks().then(() => wx.stopPullDownRefresh());
  },

  getStatusInfo(status) {
    return STATUS_MAP[status] || { label: status, cls: "tag-gray" };
  },
});
