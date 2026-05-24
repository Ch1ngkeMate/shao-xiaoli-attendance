const api = require("../../utils/api");

const TYPE_ICONS = {
  TASK: "📋",
  TASK_REVIEW: "✅",
  MEETING: "📅",
  LEAVE: "📝",
  ANNOUNCEMENT: "📢",
  SYSTEM: "🔔",
};

Page({
  data: {
    messages: [],
    unreadCount: 0,
    loading: false,
    showFab: false,
    showAnnounceEditor: false,
    announceTitle: "",
    announceBody: "",
    announceSubmitting: false,
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    this.checkShowFab();
  },

  onShow() {
    if (!getApp().checkLogin()) return;
    this.checkShowFab();
    this.loadMessages();
  },

  checkShowFab() {
    const app = getApp();
    this.setData({ showFab: app.hasRole("ADMIN", "MINISTER") });
  },

  async loadMessages() {
    this.setData({ loading: true });
    try {
      const res = await api.getNotifications();
      this.setData({
        messages: res.list || [],
        unreadCount: res.unreadCount || 0,
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  onPullDownRefresh() {
    this.loadMessages().then(() => wx.stopPullDownRefresh());
  },

  onMessageTap(e) {
    const item = e.currentTarget.dataset.item;
    // 根据消息类型跳转
    const meta = item.metadata || {};
    switch (item.type) {
      case "TASK":
      case "TASK_REVIEW":
        if (meta.taskId) {
          wx.navigateTo({ url: `/pages/tasks/detail?id=${meta.taskId}` });
        } else {
          wx.navigateTo({ url: `/pages/notifications/detail?id=${item.id}` });
        }
        break;
      case "MEETING":
        if (meta.meetingId) {
          wx.navigateTo({ url: `/pages/meetings/detail?id=${meta.meetingId}` });
        } else {
          wx.navigateTo({ url: `/pages/notifications/detail?id=${item.id}` });
        }
        break;
      case "LEAVE":
        wx.navigateTo({ url: `/pages/notifications/detail?id=${item.id}` });
        break;
      case "ANNOUNCEMENT":
        if (meta.announcementId) {
          wx.navigateTo({ url: `/pages/announcements/detail?id=${meta.announcementId}` });
        } else {
          wx.navigateTo({ url: `/pages/notifications/detail?id=${item.id}` });
        }
        break;
      default:
        wx.navigateTo({ url: `/pages/notifications/detail?id=${item.id}` });
    }
  },

  async onMarkRead(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.markNotificationRead(id, false);
      this.loadMessages();
    } catch (err) {}
  },

  async onMarkAllRead() {
    try {
      await api.markNotificationRead(null, true);
      wx.showToast({ title: "已全部标记已读", icon: "success" });
      this.loadMessages();
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  // ========== 发布公告 ==========

  onPublishAnnouncement() {
    // 跳转到公告发布页 —— 小程序端公告发布通过 navigateTo
    // 此处用 showModal 收集标题和内容，走 API 创建
    const that = this;
    wx.showModal({
      title: "发布公告",
      editable: true,
      placeholderText: "请输入公告标题",
      success(res) {
        if (res.confirm && res.content) {
          that.promptAnnounceBody(res.content);
        }
      },
    });
  },

  promptAnnounceBody(title) {
    const that = this;
    wx.showModal({
      title: "公告内容",
      editable: true,
      placeholderText: "请输入公告正文",
      success(res) {
        if (res.confirm && res.content) {
          that.createAnnouncement(title, res.content);
        }
      },
    });
  },

  async createAnnouncement(title, body) {
    try {
      await api.createAnnouncement({ title, body });
      wx.showToast({ title: "公告已发布", icon: "success" });
      this.loadMessages();
    } catch (err) {
      wx.showToast({ title: err.message || "发布失败", icon: "none" });
    }
  },

  getTypeIcon(type) {
    return TYPE_ICONS[type] || "💬";
  },

  formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${m}-${day}`;
  },
});
