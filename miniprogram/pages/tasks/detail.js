const api = require("../../utils/api");

Page({
  data: {
    task: null,
    me: null,
    loading: true,
    myClaimedSlotIds: [],
    mySubmission: null,
    submissionsForReview: [],
    isTimeEnded: false,

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
      task.imageUrls = (task.images || []).map((img) => img.url);
      if (task.claims) task.claims.forEach((c) => { if (c.user) c.user.avatarUrl = fixUrl(c.user.avatarUrl); });
      if (task.claims) task.claims.forEach((c) => { if (c.user) c.user.avatarUrl = fixUrl(c.user.avatarUrl); });

      // 我接取了哪些时段（支持一人接多段）
      const myClaimedSlotIds = [];
      const myClaims = me && task.claims
        ? task.claims.filter((c) => c.user && c.user.id === me.id)
        : [];
      myClaims.forEach((c) => { myClaimedSlotIds.push(c.timeSlotId); });

      const hasClaimed = myClaimedSlotIds.length > 0;

      // 计算每个时段的已接人数和名额，供模板判断"可接/已满" + 显示接取按钮
      if (task.timeSlots && task.timeSlots.length > 0) {
        const claims = task.claims || [];
        task.timeSlots.forEach((slot) => {
          slot.claimedCount = claims.filter((c) => c.timeSlotId === slot.id).length;
          slot.limit = slot.headcountHint > 0 ? slot.headcountHint : null;
        });
      }

      this.setData({
        task,
        loading: false,
        hasClaimed,
        myClaimedSlotIds,
        allClaimantsApproved: res.allClaimantsApproved || false,
        slotsOrTaskFull: res.slotsOrTaskFull || false,
        isTimeEnded: task.endTime ? new Date(task.endTime).getTime() < Date.now() : false,
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
    const claimId = e.currentTarget.dataset.claimId;
    if (!claimId) return;
    const that = this;
    wx.showModal({
      title: "移出接取人员",
      content: "确定移除此人的接取记录吗？",
      success(res) {
        if (res.confirm) {
          that.confirmRemove(claimId);
        }
      },
    });
  },

  async confirmRemove(claimId) {
    try {
      await api.removeClaim(this.taskId, undefined, claimId);
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

  // ========== 图片预览 ==========
  onPreviewImage(e) {
    const urls = this.data.task.imageUrls || [];
    const current = e.currentTarget.dataset.current || (urls[0] || '');
    wx.previewImage({ current: current, urls: urls });
  },

  // ========== 分享 ==========
  onShareAppMessage() {
    const task = this.data.task;
    if (!task) return { title: "干事考勤系统", path: "/pages/tasks/tasks" };
    return {
      title: `${task.title} (+${task.points}分)`,
      path: `/pages/tasks/detail?id=${this.taskId}`,
    };
  },
});
