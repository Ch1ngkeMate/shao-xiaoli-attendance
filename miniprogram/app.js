const { getApiBase } = require("./utils/config");

App({
  globalData: {
    apiBase: getApiBase(),
    token: "",
    user: null,
    /** 起始页为课程表/值班表时，提示考勤页切换到哪个子页（0 课程表 / 1 值班表） */
    pendingDutyTab: null,
  },

  /** 登录成功后的默认落点；设置只保存在当前设备，不改变底部 TabBar。 */
  getStartPage() {
    const allowed = ["tasks", "messages", "duty", "profile", "schedule"];
    const saved = wx.getStorageSync("sxl_start_page");
    return allowed.includes(saved) ? saved : "tasks";
  },

  setStartPage(page) {
    const allowed = ["tasks", "messages", "duty", "profile", "schedule"];
    const value = allowed.includes(page) ? page : "tasks";
    wx.setStorageSync("sxl_start_page", value);
    return value;
  },

  openStartPage() {
    const page = this.getStartPage();
    const routes = {
      tasks: "/pages/tasks/tasks",
      messages: "/pages/messages/messages",
      profile: "/pages/profile/profile",
    };
    // 课程表与值班表都是考勤页里的子页：课程表是第一个，值班表是第二个
    if (page === "schedule" || page === "duty") {
      this.globalData.pendingDutyTab = page === "schedule" ? 0 : 1;
      wx.switchTab({ url: "/pages/duty/duty" });
      return;
    }
    wx.switchTab({ url: routes[page] || routes.tasks });
  },

  onLaunch() {
    const token = wx.getStorageSync("sxl_token");
    const user = wx.getStorageSync("sxl_user");
    if (token) this.globalData.token = token;
    if (user) this.globalData.user = user;
    this.updateBadge();
    // 每 60 秒刷新红点
    setInterval(() => this.updateBadge(), 60000);
  },

  onShow() {
    this.updateBadge();
  },

  /** 拉取未读数并更新 TabBar 红点 */
  async updateBadge() {
    if (!this.globalData.token) return;
    try {
      const api = require("./utils/api");
      const res = await api.getNotifications();
      const unread = res.unreadCount || 0;
      if (unread > 0) {
        wx.setTabBarBadge({ index: 1, text: unread > 99 ? '99+' : String(unread) });
      } else {
        wx.removeTabBarBadge({ index: 1 });
      }
    } catch (_) { /* ignore */ }
  },

  setSession(token, user) {
    this.globalData.token = token;
    this.globalData.user = user;
    wx.setStorageSync("sxl_token", token);
    wx.setStorageSync("sxl_user", user);
    this.updateBadge();
  },

  clearSession() {
    this.globalData.token = "";
    this.globalData.user = null;
    wx.removeStorageSync("sxl_token");
    wx.removeStorageSync("sxl_user");
    wx.removeTabBarBadge({ index: 1 });
  },

  /** 检查登录状态，未登录则跳转登录页 */
  checkLogin() {
    if (!this.globalData.token) {
      wx.reLaunch({ url: "/pages/login/login" });
      return false;
    }
    return true;
  },

  /** 检查是否具有指定角色权限 */
  hasRole(...roles) {
    const user = this.globalData.user;
    if (!user) return false;
    return roles.includes(user.role);
  },
});
