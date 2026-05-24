const api = require("../../utils/api");

Page({
  data: {
    task: null,
    me: null,
    loading: true,
    myClaimedSlotIds: [],
    mySubmission: null,
    submissionsForReview: [],

    showSubmitSheet: false,
    submitNote: "",
    evidenceUrls: [],
    uploading: false,

    showCloseConfirm: false,
    excludeAttendance: true,

    showReviewSheet: false,
    reviewSubmissionId: "",
    reviewResult: "APPROVED",
    reviewReason: "",
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
      const base = getApp().globalData.apiBase;

      // 补全图片 URL
      const fixUrl = (url) => {
        if (!url) return url;
        return (!url.startsWith('http')) ? base + (url.startsWith('/')?'':'/') + url : url;
      };
      if (task.images) task.images.forEach((img) => { img.url = fixUrl(img.url); });
      if (task.claims) task.claims.forEach((c) => { if (c.user) c.user.avatarUrl = fixUrl(c.user.avatarUrl); });

      const hasClaimed = me && task.claims
        ? task.claims.some((c) => c.user && c.user.id === me.id)
        : false;

      this.setData({
        task,
        loading: false,
        hasClaimed,
        isMEMBER: getApp().hasRole("MEMBER"),
        isAdminOrMinister: getApp().hasRole("ADMIN", "MINISTER"),
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || "加载失败", icon: "none" });
    }
  },

  // ========== 管理员移除接取 ==========
  onRemoveTap(e) {
    const userId = e.currentTarget.dataset.userId;
    const that = this;
    wx.showModal({
      title: "移出接取人员",
      content: "确定移除此人的接取记录吗？",
      success(res) {
        if (res.confirm) {
          that.confirmRemove(userId);
        }
      },
    });
  },

  async confirmRemove(userId) {
    try {
      await api.removeClaim(this.taskId, userId);
      wx.showToast({ title: "已移出", icon: "success" });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "操作失败", icon: "none" });
    }
  },
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

  // ========== 提交凭证 ==========
  onOpenSubmit() {
    this.setData({ showSubmitSheet: true, submitNote: "", evidenceUrls: [] });
  },
  onNoteInput(e) { this.setData({ submitNote: e.detail.value }); },
  async onChooseImage() {
    const that = this;
    wx.chooseImage({
      count: 9 - that.data.evidenceUrls.length,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success(res) { that.uploadImages(res.tempFilePaths); },
    });
  },
  async uploadImages(paths) {
    this.setData({ uploading: true });
    const urls = [...this.data.evidenceUrls];
    for (const path of paths) {
      try { const res = await api.uploadFile(path, "evidence"); urls.push(res.url); }
      catch (err) { wx.showToast({ title: "上传失败", icon: "none" }); break; }
    }
    this.setData({ evidenceUrls: urls, uploading: false });
  },
  removeImage(e) {
    const urls = [...this.data.evidenceUrls]; urls.splice(e.currentTarget.dataset.index, 1);
    this.setData({ evidenceUrls: urls });
  },
  async onSubmit() {
    try {
      await api.submitTask(this.taskId, { note: this.data.submitNote, evidenceUrls: this.data.evidenceUrls });
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
    this.setData({ showReviewSheet: true, reviewSubmissionId: submissionId, reviewResult: result || "APPROVED", reviewReason: "" });
  },
  onReviewResultChange(e) { this.setData({ reviewResult: e.currentTarget.dataset.result }); },
  onReviewReasonInput(e) { this.setData({ reviewReason: e.detail.value }); },
  async onReviewSubmit() {
    try {
      await api.reviewSubmission(this.data.reviewSubmissionId, this.data.reviewResult, this.data.reviewReason || undefined);
      wx.showToast({ title: "审核完成", icon: "success" });
      this.setData({ showReviewSheet: false });
      this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err.message || "审核失败", icon: "none" });
    }
  },

  // ========== 关单 ==========
  onCloseTask(e) { this.setData({ showCloseConfirm: true, excludeAttendance: false }); },
  onConfirmCloseSkip() { this.setData({ showCloseConfirm: true, excludeAttendance: true }); },
  onExcludeChange() { this.setData({ excludeAttendance: !this.data.excludeAttendance }); },
  async onConfirmClose() {
    try {
      await api.closeTask(this.taskId, this.data.excludeAttendance);
      wx.showToast({ title: "已关单", icon: "success" });
      this.setData({ showCloseConfirm: false });
      this.loadDetail();
    } catch (err) { wx.showToast({ title: err.message || "失败", icon: "none" }); }
  },

  // ========== 弹窗 ==========
  onCloseSubmitSheet() { this.setData({ showSubmitSheet: false }); },
  onCloseReviewSheet() { this.setData({ showReviewSheet: false }); },
  onCloseCloseConfirm() { this.setData({ showCloseConfirm: false }); },
  onCloseRemoveSheet() { this.setData({ showRemoveSheet: false }); },
  onSheetStop() {},
});
