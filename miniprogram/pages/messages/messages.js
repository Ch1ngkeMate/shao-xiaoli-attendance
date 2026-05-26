const api = require("../../utils/api");
const { formatTimeRelative } = require("../../utils/format");

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
      const unread = res.unreadCount || 0;
      this.setData({
        messages: res.list || [],
        unreadCount: unread,
        loading: false,
      });
      if (unread > 0) {
        wx.setTabBarBadge({ index: 1, text: unread > 99 ? '99+' : String(unread) });
      } else {
        wx.removeTabBarBadge({ index: 1 });
      }
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
    this.setData({
      showAnnounceEditor: true,
      announceTitle: "",
      announceBody: "",
    });
  },

  onAnnounceTitleInput(e) {
    this.setData({ announceTitle: e.detail.value });
  },

  onAnnounceBodyInput(e) {
    this.setData({ announceBody: e.detail.value });
  },

  closeAnnounceEditor() {
    if (this.data.announceSubmitting) return;
    this.setData({ showAnnounceEditor: false });
  },

  async submitAnnouncement() {
    const { announceTitle, announceBody } = this.data;
    if (!announceTitle.trim()) {
      wx.showToast({ title: "请输入公告标题", icon: "none" });
      return;
    }
    if (!announceBody.trim()) {
      wx.showToast({ title: "请输入公告正文", icon: "none" });
      return;
    }
    this.setData({ announceSubmitting: true });
    try {
      await api.createAnnouncement({ title: announceTitle.trim(), body: announceBody.trim() });
      wx.showToast({ title: "公告已发布", icon: "success" });
      this.setData({ showAnnounceEditor: false });
      this.loadMessages();
    } catch (err) {
      wx.showToast({ title: err.message || "发布失败", icon: "none" });
    } finally {
      this.setData({ announceSubmitting: false });
    }
  },

  getTypeIcon(type) {
    return TYPE_ICONS[type] || "💬";
  },

  // formatTimeRelative 从 utils/format.js 引用
});
