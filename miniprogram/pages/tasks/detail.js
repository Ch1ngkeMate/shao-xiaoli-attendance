const api = require("../../utils/api");

Page({
  data: {
    task: null,
    me: null,
    loading: true,

    // 操作弹窗
    showSubmitSheet: false,
    submitNote: "",
    evidenceUrls: [],
    uploading: false,

    showCloseConfirm: false,
    excludeAttendance: true,

    // 审核
    showReviewSheet: false,
    reviewSubmissionId: "",
    reviewResult: "APPROVED",
    reviewReason: "",

    // 移除确认
    showRemoveSheet: false,
    removeTarget: null,
  },

  onLoad(options) {
    if (!getApp().checkLogin()) return;
    this.taskId = options.id;
    this.setData({ me: getApp().globalData.user });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await api.getTaskDetail(this.taskId);
      const task = res.task;
      const me = getApp().globalData.user;
      const app = getApp();
      const hasClaimed = me && task.claims
        ? task.claims.some((c) => c.user && c.user.id === me.id)
        : false;

      this.setData({
        task,
        loading: false,
        isMEMBER: app.hasRole("MEMBER"),
        isAdminOrMinister: app.hasRole("ADMIN", "MINISTER"),
        hasClaimed,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  // ========== 接取 / 取消接取 ==========

  async onClaim(e) {
    const timeSlotId = e.currentTarget.dataset.slotId || undefined;
    try {
      await api.claimTask(this.taskId, timeSlotId);
      wx.showToast({ title: "接取成功", icon: "success" });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "接取失败", icon: "none" });
    }
  },

  onCancelClaimTap(e) {
    const userId = e.currentTarget.dataset.userId;
    this.setData({
      showRemoveSheet: true,
      removeTarget: { userId },
    });
  },

  async onCancelClaim() {
    const { userId } = this.data.removeTarget;
    try {
      await api.removeClaim(this.taskId, userId);
      wx.showToast({ title: "已取消接取", icon: "success" });
      this.setData({ showRemoveSheet: false });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "操作失败", icon: "none" });
    }
  },

  // ========== 提交凭证 ==========

  onOpenSubmit() {
    this.setData({
      showSubmitSheet: true,
      submitNote: "",
      evidenceUrls: [],
    });
  },

  onNoteInput(e) {
    this.setData({ submitNote: e.detail.value });
  },

  async onChooseImage() {
    const that = this;
    wx.chooseImage({
      count: 9 - that.data.evidenceUrls.length,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success(res) {
        that.uploadImages(res.tempFilePaths);
      },
    });
  },

  async uploadImages(paths) {
    this.setData({ uploading: true });
    const urls = [...this.data.evidenceUrls];
    for (const path of paths) {
      try {
        const res = await api.uploadFile(path, "evidence");
        urls.push(res.url);
      } catch (err) {
        wx.showToast({ title: "图片上传失败", icon: "none" });
        break;
      }
    }
    this.setData({ evidenceUrls: urls, uploading: false });
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.index;
    const urls = [...this.data.evidenceUrls];
    urls.splice(idx, 1);
    this.setData({ evidenceUrls: urls });
  },

  async onSubmit() {
    try {
      await api.submitTask(this.taskId, {
        note: this.data.submitNote,
        evidenceUrls: this.data.evidenceUrls,
      });
      wx.showToast({ title: "提交成功", icon: "success" });
      this.setData({ showSubmitSheet: false });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "提交失败", icon: "none" });
    }
  },

  // ========== 审核 ==========

  onReview(e) {
    const { submissionId, result } = e.currentTarget.dataset;
    this.setData({
      showReviewSheet: true,
      reviewSubmissionId: submissionId,
      reviewResult: result || "APPROVED",
      reviewReason: "",
    });
  },

  onReviewResultChange(e) {
    this.setData({ reviewResult: e.currentTarget.dataset.result });
  },

  onReviewReasonInput(e) {
    this.setData({ reviewReason: e.detail.value });
  },

  async onReviewSubmit() {
    try {
      await api.reviewSubmission(
        this.data.reviewSubmissionId,
        this.data.reviewResult,
        this.data.reviewReason || undefined
      );
      wx.showToast({ title: "审核完成", icon: "success" });
      this.setData({ showReviewSheet: false });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "审核失败", icon: "none" });
    }
  },

  // ========== 关单 ==========

  onCloseTask(e) {
    const exclude = e.currentTarget.dataset.exclude === 'true' || e.currentTarget.dataset.exclude === true;
    if (exclude) {
      this.setData({ showCloseConfirm: true, excludeAttendance: true });
    } else {
      // 收工（不计考勤=false），直接确认
      this.setData({ showCloseConfirm: true, excludeAttendance: false });
    }
  },

  onConfirmCloseSkip() {
    this.setData({ showCloseConfirm: true, excludeAttendance: true });
  },

  onExcludeChange() {
    this.setData({ excludeAttendance: !this.data.excludeAttendance });
  },

  async onConfirmClose() {
    try {
      await api.closeTask(this.taskId, this.data.excludeAttendance);
      wx.showToast({ title: "已关单", icon: "success" });
      this.setData({ showCloseConfirm: false });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "关单失败", icon: "none" });
    }
  },

  // ========== 弹窗通用 ==========

  onCloseSubmitSheet() { this.setData({ showSubmitSheet: false }); },
  onCloseReviewSheet() { this.setData({ showReviewSheet: false }); },
  onCloseCloseConfirm() { this.setData({ showCloseConfirm: false }); },
  onCloseRemoveSheet() { this.setData({ showRemoveSheet: false }); },
  onSheetStop() {},

  // ========== 工具 ==========

  getMyClaims() {
    const me = getApp().globalData.user;
    const task = this.data.task;
    if (!me || !task || !task.claims) return [];
    return task.claims.filter((c) => c.user && c.user.id === me.id);
  },

  formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const h = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${m}-${day} ${h}:${min}`;
  },
});
