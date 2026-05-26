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

    // 自定义 picker-view 弹窗
    showPickerSheet: false,
    pickerType: "", // 'startDate' | 'startTime' | 'endDate' | 'endTime'
    datePickerYears: [],
    datePickerMonths: [],
    datePickerDays: [],
    datePickerValue: [0, 0, 0],
    timePickerHours: [],
    timePickerMinutes: [],
    timePickerValue: [0, 0],
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    if (!getApp().hasRole("ADMIN", "MINISTER")) {
      wx.showToast({ title: "无权限", icon: "none" });
      wx.navigateBack();
      return;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    // 生成年份列表（当前年 ~ 当前年+3）
    const years = [];
    for (let i = 0; i < 4; i++) years.push(now.getFullYear() + i);
    const months = [];
    for (let i = 1; i <= 12; i++) months.push(i);
    const days = [];
    for (let i = 1; i <= 31; i++) days.push(i);
    const hours = [];
    for (let i = 0; i < 24; i++) hours.push(i);
    const mins = [];
    for (let i = 0; i < 60; i += 5) mins.push(i);
    this.setData({
      tempSlotStartDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      tempSlotStartTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      tempSlotEndDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
      tempSlotEndTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      datePickerYears: years,
      datePickerMonths: months,
      datePickerDays: days,
      timePickerHours: hours,
      timePickerMinutes: mins,
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

  // ========== 自定义 Picker 弹窗 ==========

  openPickerSheet(e) {
    const type = e.currentTarget.dataset.type; // startDate|startTime|endDate|endTime
    const currentVal = this.data[type === 'startDate' ? 'tempSlotStartDate' : type === 'startTime' ? 'tempSlotStartTime' : type === 'endDate' ? 'tempSlotEndDate' : 'tempSlotEndTime'];
    if (type === 'startDate' || type === 'endDate') {
      // 解析日期
      const [y, m, d] = currentVal ? currentVal.split('-').map(Number) : [new Date().getFullYear(), 1, 1];
      const yi = this.data.datePickerYears.indexOf(y);
      this.setData({
        showPickerSheet: true, pickerType: type,
        datePickerValue: [Math.max(0, yi), m - 1, d - 1],
      });
    } else {
      // 解析时间
      const [h, m] = currentVal ? currentVal.split(':').map(Number) : [8, 0];
      const hi = this.data.timePickerHours.indexOf(h);
      const mi = this.data.timePickerMinutes.indexOf(m >= 0 ? Math.floor(m / 5) * 5 : 0);
      this.setData({
        showPickerSheet: true, pickerType: type,
        timePickerValue: [Math.max(0, hi), Math.max(0, mi)],
      });
    }
  },

  onDatePickerChange(e) {
    this.setData({ datePickerValue: e.detail.value });
  },

  onTimePickerChange(e) {
    this.setData({ timePickerValue: e.detail.value });
  },

  confirmPicker() {
    const type = this.data.pickerType;
    const pad = (n) => String(n).padStart(2, '0');
    if (type === 'startDate' || type === 'endDate') {
      const [yi, mi, di] = this.data.datePickerValue;
      const y = this.data.datePickerYears[yi] || new Date().getFullYear();
      const m = (this.data.datePickerMonths[mi] || 1);
      const d = (this.data.datePickerDays[di] || 1);
      const val = `${y}-${pad(m)}-${pad(d)}`;
      if (type === 'startDate') this.setData({ tempSlotStartDate: val });
      else this.setData({ tempSlotEndDate: val });
    } else {
      const [hi, mii] = this.data.timePickerValue;
      const h = this.data.timePickerHours[hi] || 0;
      const m = this.data.timePickerMinutes[mii] || 0;
      const val = `${pad(h)}:${pad(m)}`;
      if (type === 'startTime') this.setData({ tempSlotStartTime: val });
      else this.setData({ tempSlotEndTime: val });
    }
    this.setData({ showPickerSheet: false });
  },

  closePickerSheet() {
    this.setData({ showPickerSheet: false });
  },

  // ========== 原生 picker 桩（保留兼容） ==========

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
      } else {
        // 未添加时间段时，自动用当前填写的时间作为单时段
        const { tempSlotStartDate, tempSlotStartTime, tempSlotEndDate, tempSlotEndTime } = this.data;
        if (tempSlotStartDate && tempSlotStartTime && tempSlotEndDate && tempSlotEndTime) {
          body.startTime = `${tempSlotStartDate}T${tempSlotStartTime}:00`;
          body.endTime = `${tempSlotEndDate}T${tempSlotEndTime}:00`;
        }
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
