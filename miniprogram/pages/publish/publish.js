const api = require("../../utils/api");

Page({
  data: {
    title: "",
    description: "",
    points: 0,
    headcountHint: 1,
    timeSlots: [],
    imageUrls: [],
    uploading: false,
    submitting: false,

    // 时间选择器
    showStartPicker: false,
    showEndPicker: false,
    tempSlotStart: "",
    tempSlotEnd: "",
    tempSlotHeadcount: 1,
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    if (!getApp().hasRole("ADMIN", "MINISTER")) {
      wx.showToast({ title: "无权限", icon: "none" });
      wx.navigateBack();
    }
  },

  // 标题
  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  // 描述
  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  // 积分
  onPointsChange(e) {
    const val = parseInt(e.detail.value) || 0;
    this.setData({ points: Math.max(0, val) });
  },

  // 人数上限
  onHeadcountChange(e) {
    const val = parseInt(e.detail.value) || 1;
    this.setData({ headcountHint: Math.max(1, val) });
  },

  // ========== 时间段 ==========

  onSlotStartChange(e) {
    this.setData({ tempSlotStart: e.detail.value });
  },

  onSlotEndChange(e) {
    this.setData({ tempSlotEnd: e.detail.value });
  },

  onSlotHeadcountChange(e) {
    const val = parseInt(e.detail.value) || 1;
    this.setData({ tempSlotHeadcount: Math.max(1, val) });
  },

  onAddSlot() {
    if (!this.data.tempSlotStart || !this.data.tempSlotEnd) {
      wx.showToast({ title: "请选择完整时段", icon: "none" });
      return;
    }

    const slots = [...this.data.timeSlots];
    slots.push({
      startTime: this.data.tempSlotStart,
      endTime: this.data.tempSlotEnd,
      headcountHint: this.data.tempSlotHeadcount,
    });
    this.setData({
      timeSlots: slots,
      tempSlotStart: "",
      tempSlotEnd: "",
      tempSlotHeadcount: 1,
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
      if (this.data.headcountHint > 1) {
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

      await api.createTask(body);
      wx.showToast({ title: "发布成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (err) {
      wx.showToast({ title: err.message || "发布失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
