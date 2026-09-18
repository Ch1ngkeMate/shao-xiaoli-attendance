const api = require("../../utils/api");
const { fixUrl, formatTime } = require("../../utils/format");

/** 一次最多查多少个月（与后端 MAX_MONTHS 对齐） */
const MAX_MONTHS = 24;

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 取最近 N 个月（含当前月），倒序返回 */
function recentMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

Page({
  data: {
    profileUser: null,
    attendance: null,
    loading: true,
    currentMonth: "",

    /** 按月折叠：[{ month, label, approvedCount, approvedPoints, otherPoints, totalPoints, items[], expanded }] */
    monthGroups: [],
    /** 是否有任意活动/扣分记录，用于空状态 */
    hasAnyRecord: false,
    /** 加载失败原因（非空时展示错误态，而不是「用户不存在」） */
    loadError: "",
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    this.userId = options.id;
    const months = recentMonths(MAX_MONTHS);
    this.setData({ currentMonth: months[0] });
    this.loadProfile();
  },

  /** 把某个月的 row 转成折叠面板里的条目列表 */
  buildItems(row) {
    const items = [];
    (row.approvedTasks || []).forEach((t) => {
      items.push({
        type: "task",
        id: t.taskId,
        title: t.title,
        points: t.points,
        time: formatTime(t.reviewTime),
        timeRaw: t.reviewTime || "",
      });
    });
    (row.meetingAbsences || []).forEach((a) => {
      items.push({
        type: "absence",
        id: a.id,
        title: a.label,
        points: a.amount,
        time: formatTime(a.recordedAt),
        timeRaw: a.recordedAt || "",
      });
    });
    // 其它加减分（不含会议旷会部分，后端 otherPoints 包含会议；这里只做兜底提示）
    const meetingSum = (row.meetingAbsences || []).reduce((s, a) => s + (a.amount || 0), 0);
    const otherOnly = (row.otherPoints || 0) - meetingSum;
    if (otherOnly !== 0) {
      items.push({
        type: "adjust",
        id: `adjust-${row.month}`,
        title: "其它加减分",
        points: otherOnly,
        time: "",
        timeRaw: "",
      });
    }
    // 按时间倒序，最新的排前面
    items.sort((a, b) => String(b.timeRaw).localeCompare(String(a.timeRaw)));
    return items;
  },

  async loadProfile() {
    try {
      const months = recentMonths(MAX_MONTHS);
      const res = await api.getUserProfileMonths(this.userId, months);

      const profileUser = res.user;
      // 接口没返回 user 时是异常响应，不能当成「用户不存在」（后者是 404 的语义）
      if (!profileUser) {
        this.setData({ loading: false, profileUser: null, loadError: "加载失败：接口返回异常" });
        return;
      }
      if (profileUser.avatarUrl) {
        profileUser.avatarUrl = fixUrl(profileUser.avatarUrl);
      }

      const monthly = res.monthly || [];
      // 只保留有过记录（任务 / 旷会 / 其它分）的月份，避免一长串空面板
      const monthGroups = monthly
        .map((m) => {
          const items = this.buildItems(m);
          const [y, mm] = String(m.month).split("-");
          return {
            month: m.month,
            label: `${y}年${Number(mm)}月`,
            approvedCount: m.approvedCount || 0,
            approvedPoints: m.approvedPoints || 0,
            otherPoints: m.otherPoints || 0,
            totalPoints: m.totalPoints || 0,
            items,
            expanded: false,
          };
        })
        .filter((g) => g.items.length > 0);

      // 默认展开最近有记录的月份，其余折叠
      if (monthGroups.length > 0) monthGroups[0].expanded = true;

      this.setData({
        profileUser,
        attendance: res.row,
        monthGroups,
        hasAnyRecord: monthGroups.length > 0,
        loadError: "",
        loading: false,
      });
    } catch (err) {
      // 400/403/500 等：清掉旧数据并保留错误原因，不再伪装成「用户不存在」
      this.setData({
        loading: false,
        profileUser: null,
        attendance: null,
        monthGroups: [],
        hasAnyRecord: false,
        loadError: err.message || "加载失败",
      });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  /** 失败重试 */
  onRetry() {
    this.setData({ loading: true, loadError: "" });
    this.loadProfile();
  },

  /** 点击月份标题：展开/折叠当月活动 */
  onToggleMonth(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;
    this.setData({ [`monthGroups[${index}].expanded`]: !this.data.monthGroups[index].expanded });
  },

  /** 点击活动条目 → 跳到任务详情 */
  onOpenTask(e) {
    const taskId = e.currentTarget.dataset.taskId;
    if (!taskId) return;
    wx.navigateTo({ url: `/pages/tasks/detail?id=${taskId}` });
  },

  roleLabel(role) {
    const map = { ADMIN: "管理员", MINISTER: "部长", MEMBER: "部员" };
    return map[role] || role;
  },
});
