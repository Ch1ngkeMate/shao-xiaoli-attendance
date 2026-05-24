const api = require("../../utils/api");

Page({
  data: {
    title: "",
    description: "",
    points: 1, // 默认1分
    headcountHint: 0, // 0 = 不限
    timeSlots: [],
    imageUrls: [],
    uploading: false,
    submitting: false,

    // 发布成功后分享
    publishedTask: null,
    showShareTip: false,

    // 时间选择器
    tempSlotStartDate: "",
    tempSlotStartTime: "",
    tempSlotEndDate: "",
    tempSlotEndTime: "",
    tempSlotHeadcount: 0, // 0 = 不限
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    if (!getApp().hasRole("ADMIN", "MINISTER")) {
      wx.showToast({ title: "无权限", icon: "none" });
      wx.navigateBack();
      return;
    }
    // 默认时间段：从现在开始，24小时后结束
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    this.setData({
      tempSlotStartDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      tempSlotStartTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      tempSlotEndDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
      tempSlotEndTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    });
  },

  // 标题
  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  // 描述
  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  // 积分 — 按钮点击
  setPoints(e) {
    const v = parseInt(e.currentTarget.dataset.v);
    this.setData({ points: v });
  },

  // 人数上限（0=不限制）
  onHeadcountChange(e) {
    const val = parseInt(e.detail.value);
    this.setData({ headcountHint: isNaN(val) ? 0 : Math.max(0, val) });
  },

  // ========== 时间段（日期 + 时间拆分，对齐 Web DatePicker showTime）==========

  onSlotStartDateChange(e) { this.setData({ tempSlotStartDate: e.detail.value }); },
  onSlotStartTimeChange(e) { this.setData({ tempSlotStartTime: e.detail.value }); },
  onSlotEndDateChange(e) { this.setData({ tempSlotEndDate: e.detail.value }); },
  onSlotEndTimeChange(e) { this.setData({ tempSlotEndTime: e.detail.value }); },

  onSlotHeadcountChange(e) {
    const val = parseInt(e.detail.value) || 0;
    this.setData({ tempSlotHeadcount: Math.max(0, val) });
  },

  onAddSlot() {
    const { tempSlotStartDate, tempSlotStartTime, tempSlotEndDate, tempSlotEndTime } = this.data;
    if (!tempSlotStartDate || !tempSlotStartTime || !tempSlotEndDate || !tempSlotEndTime) {
      wx.showToast({ title: "请选完开始和结束的日期+时间", icon: "none" });
      return;
    }

    // 拼成 YYYY-MM-DDTHH:mm 格式（本地时间）
    const startIso = `${tempSlotStartDate}T${tempSlotStartTime}:00`;
    const endIso = `${tempSlotEndDate}T${tempSlotEndTime}:00`;
    if (endIso <= startIso) {
      wx.showToast({ title: "结束时间必须晚于开始时间", icon: "none" });
      return;
    }

    const slots = [...this.data.timeSlots];
    const hc = this.data.tempSlotHeadcount > 0 ? this.data.tempSlotHeadcount : undefined;
    slots.push({ startTime: startIso, endTime: endIso, headcountHint: hc });
    this.setData({
      timeSlots: slots,
      tempSlotStartDate: "", tempSlotStartTime: "",
      tempSlotEndDate: "", tempSlotEndTime: "",
      tempSlotHeadcount: 0,
    });
  },

  onRemoveSlot(e) {
    const idx = e.currentTarget.dataset.index;
    const slots = [...this.data.timeSlots];
    slots.splice(idx, 1);
    this.setData({ timeSlots: slots });
  },

  // ========== 图片 ==========

  onChooseImage() {
    const that = this;
    wx.chooseImage({
      count: 9 - that.data.imageUrls.length,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success(res) {
        that.uploadImages(res.tempFilePaths);
      },
    });
  },

  async uploadImages(paths) {
    this.setData({ uploading: true });
    const urls = [...this.data.imageUrls];
    for (const path of paths) {
      try {
        const res = await api.uploadFile(path, "task");
        urls.push(res.url);
      } catch (err) {
        wx.showToast({ title: "图片上传失败", icon: "none" });
        break;
      }
    }
    this.setData({ imageUrls: urls, uploading: false });
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index;
    const urls = [...this.data.imageUrls];
    urls.splice(idx, 1);
    this.setData({ imageUrls: urls });
  },

  // ========== 提交 ==========

  async onSubmit() {
    if (!this.data.title.trim()) {
      wx.showToast({ title: "请输入任务标题", icon: "none" });
      return;
    }
    if (this.data.points <= 0) {
      wx.showToast({ title: "请设置积分", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
      const body = {
        title: this.data.title.trim(),
        points: this.data.points,
      };

      if (this.data.description.trim()) {
        body.description = this.data.description.trim();
      }
      if (this.data.headcountHint > 0) {
        body.headcountHint = this.data.headcountHint;
      }
      if (this.data.timeSlots.length > 0) {
        body.timeSlots = this.data.timeSlots.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          headcountHint: s.headcountHint || this.data.headcountHint,
        }));
      }
      if (this.data.imageUrls.length > 0) {
        body.imageUrls = this.data.imageUrls;
      }

      const res = await api.createTask(body);
      const task = res.task;
      wx.showToast({ title: "发布成功", icon: "success" });

      // 发布成功后引导转发到群
      wx.showShareMenu({ withShareTicket: true });
      this.setData({ publishedTask: task, showShareTip: true, submitting: false });
      return;
    } catch (err) {
      wx.showToast({ title: err.message || "发布失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /** 自定义转发内容（页面右上角菜单 + button open-type="share"） */
  onShareAppMessage() {
    const task = this.data.publishedTask;
    if (!task) {
      return { title: "干事考勤系统", path: "/pages/tasks/tasks" };
    }
    return {
      title: `新任务：${task.title} (+${task.points}分)`,
      path: `/pages/tasks/detail?id=${task.id}`,
    };
  },

  onCloseShareTip() {
    // 清空表单，返回上一页，让用户明确感知任务已发布
    this.setData({ showShareTip: false, publishedTask: null });
    wx.navigateBack();
  },
});
