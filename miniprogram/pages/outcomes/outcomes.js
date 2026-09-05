const api = require("../../utils/api");
const { formatTime } = require("../../utils/format");

function matches(item, query) {
  if (!query) return true;
  const source = [item.title, item.task && item.task.title, item.updatedBy && item.updatedBy.displayName, item.summary]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return source.indexOf(query.toLowerCase()) !== -1;
}

Page({
  data: { outcomes: [], shownOutcomes: [], searchText: "", loading: false },

  onLoad() {
    if (!getApp().checkLogin()) return;
    this.loadOutcomes();
  },

  onPullDownRefresh() {
    this.loadOutcomes().finally(() => wx.stopPullDownRefresh());
  },

  async loadOutcomes() {
    this.setData({ loading: true });
    try {
      const res = await api.getOutcomes();
      const outcomes = (res.outcomes || []).map((item) => ({
        ...item,
        displayTitle: item.title || `${(item.updatedBy && item.updatedBy.displayName) || "未命名"}+${(item.task && item.task.title) || "任务"}+其他`,
        submittedText: formatTime(item.submittedAt),
        typeText: this.typeText(item.types || []),
      }));
      this.setData({ outcomes, loading: false }, () => this.filterOutcomes());
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "成果档案加载失败", icon: "none" });
    }
  },

  typeText(types) {
    const labels = { IMAGE: "图片", VIDEO: "视频", DOCUMENT: "文件" };
    return types.map((type) => labels[type] || type).join("、") || "说明";
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value }, () => this.filterOutcomes());
  },

  filterOutcomes() {
    const { outcomes, searchText } = this.data;
    this.setData({ shownOutcomes: outcomes.filter((item) => matches(item, searchText.trim())) });
  },

  onOutcomeTap(e) {
    const id = e.currentTarget.dataset.taskId;
    if (id) wx.navigateTo({ url: `/pages/tasks/detail?id=${id}` });
  },
});
