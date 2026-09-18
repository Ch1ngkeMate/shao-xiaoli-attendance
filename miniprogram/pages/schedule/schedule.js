const scheduleStore = require("../../utils/schedule");
const scheduleView = require("../../utils/schedule-view");
const { parseSchedulePdf } = require("../../utils/pdf-schedule");

const SECTION_OPTIONS = Array.from({ length: 12 }, (_, index) => `第${index + 1}节`);
const DAY_OPTIONS = scheduleStore.DAY_NAMES.slice(1);

function emptyForm() {
  return {
    courseName: "",
    teacher: "",
    room: "",
    weekdayIndex: 0,
    startSectionIndex: 0,
    endSectionIndex: 1,
    weeks: "",
    note: "",
  };
}

Page({
  // 课程表视图的状态与交互（周次、起始日、回到本周、自动滚动）来自 utils/schedule-view.js，
  // 与考勤页共用同一套逻辑。
  ...scheduleView.methods,

  data: {
    semesterLabel: "我的课程表",
    courses: [],
    weekIndex: 0,
    startDate: "",
    view: scheduleView.buildView({ courses: [], weekIndex: 0, startDate: "" }),
    /** 课程表页自带导入/编辑入口，模板里不再重复显示「导入 / 编辑课程表」 */
    showManage: false,
    /** 本页无吸顶栏，滚动到今天时只留一点上边距 */
    stickyHeaderOffset: 16,
    dayOptions: DAY_OPTIONS,
    sectionOptions: SECTION_OPTIONS,
    showEditor: false,
    editingId: "",
    editorTitle: "添加课程",
    form: emptyForm(),
    /** 课程表被设为起始页时是唯一页面，没有返回按钮也没有 TabBar，需要给出返回入口 */
    isStandalone: false,
    /** 识别预览弹层：服务端结果先给用户过目，确认后才写入本地课表 */
    showPreview: false,
    preview: null,
  },

  onLoad() {
    if (!getApp().checkLogin()) return;
    this.loadCourseView();
  },

  onShow() {
    const isStandalone = getCurrentPages().length <= 1;
    if (isStandalone !== this.data.isStandalone) this.setData({ isStandalone });
    if (getApp().globalData.token) this.loadCourseView();
  },

  goHome() {
    wx.switchTab({ url: "/pages/tasks/tasks" });
  },

  // ===== 课程增删改 =====

  onCourseTap(e) {
    const id = e.currentTarget.dataset.id;
    const course = this.data.courses.find((item) => item.id === id);
    if (!course) return;
    wx.showActionSheet({ itemList: ["编辑课程", "删除课程"], success: (result) => {
      if (result.tapIndex === 0) this.openEditor(course);
      if (result.tapIndex === 1) this.confirmDelete(course);
    }});
  },

  onAdd() {
    this.setData({ showEditor: true, editingId: "", editorTitle: "添加课程", form: emptyForm() });
  },

  openEditor(course) {
    const form = {
      courseName: course.courseName,
      teacher: course.teacher,
      room: course.room,
      weekdayIndex: Math.max(0, course.weekday - 1),
      startSectionIndex: Math.max(0, course.startSection - 1),
      endSectionIndex: Math.max(0, course.endSection - 1),
      weeks: course.weeks,
      note: course.note,
    };
    this.setData({ showEditor: true, editingId: course.id, editorTitle: "编辑课程", form });
  },

  confirmDelete(course) {
    wx.showModal({ title: "删除课程", content: `确定删除「${course.courseName}」吗？`, success: (result) => {
      if (!result.confirm) return;
      const saved = scheduleStore.readSchedule();
      const next = scheduleStore.writeSchedule({ ...saved, courses: saved.courses.filter((item) => item.id !== course.id) });
      this.applyCourses(next.courses);
      wx.showToast({ title: "已删除", icon: "success" });
    }});
  },

  onEditorClose() {
    this.setData({ showEditor: false });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onPickerChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: Number(e.detail.value) });
  },

  onSaveCourse() {
    const form = this.data.form;
    const courseName = String(form.courseName || "").trim();
    if (!courseName) {
      wx.showToast({ title: "请填写课程名称", icon: "none" });
      return;
    }
    const startSection = Number(form.startSectionIndex) + 1;
    const endSection = Math.max(startSection, Number(form.endSectionIndex) + 1);
    const course = {
      id: this.data.editingId || undefined,
      courseName,
      teacher: String(form.teacher || "").trim(),
      room: String(form.room || "").trim(),
      weekday: Number(form.weekdayIndex) + 1,
      startSection,
      endSection,
      weeks: String(form.weeks || "").trim(),
      note: String(form.note || "").trim(),
    };
    const saved = scheduleStore.readSchedule();
    const courses = this.data.editingId
      ? saved.courses.map((item) => item.id === this.data.editingId ? { ...item, ...course, id: item.id } : item)
      : [...saved.courses, course];
    const next = scheduleStore.writeSchedule({ ...saved, courses });
    this.setData({ showEditor: false }, () => this.applyCourses(next.courses));
    wx.showToast({ title: this.data.editingId ? "已修改" : "已添加", icon: "success" });
  },

  // ===== 导入 =====

  showImportError(message) {
    wx.showModal({
      title: "导入失败",
      content: String(message || "无法读取文件").slice(0, 300),
      showCancel: false,
      confirmText: "知道了",
    });
  },

  /** 校验并解析 JSON 文本，成功则进入确认导入 */
  readScheduleText(text) {
    const cleaned = String(text === undefined || text === null ? "" : text).replace(/^\uFEFF/, "").trim();
    if (!cleaned) {
      this.showImportError("内容为空，没有可解析的课程数据。");
      return;
    }
    let json;
    try {
      json = JSON.parse(cleaned);
    } catch (error) {
      // 常见误操作：把 PDF 当文本粘进来了
      if (cleaned.indexOf("%PDF") === 0) {
        this.showImportError("这是一份 PDF，请用「选文件导入」方式选择 PDF，而不是粘贴文本。");
        return;
      }
      this.showImportError(`不是有效的 JSON，请确认选的是教务系统导出的原始文件。\n（${(error && error.message) || "解析失败"}）`);
      return;
    }
    let parsed;
    try {
      parsed = scheduleStore.parseImport(json);
    } catch (error) {
      this.showImportError((error && error.message) || "没有可识别的课程记录");
      return;
    }
    this.confirmImport(parsed);
  },

  /** 解析 PDF 得到的课程直接进入确认导入 */
  readSchedulePdf(buffer) {
    let parsed;
    try {
      parsed = parseSchedulePdf(buffer);
    } catch (error) {
      this.showImportError((error && error.message) || "PDF 解析失败");
      return;
    }
    this.confirmImport(parsed);
  },

  /**
   * 统一的导入确认：无论来源是 JSON 还是 PDF 都走这里。
   *
   * ⚠️ 解析成功 ≠ 结果可信。教务模板千差万别，解析器只能保证抽出来的东西干净，
   *    不能保证一条没漏。所以：
   *      · 有 warnings → 把可疑点摆出来让用户知情后再决定
   *      · 没 warnings → 走轻量确认，不打扰
   */
  confirmImport(parsed) {
    const warnings = (parsed && parsed.warnings) || [];
    const count = parsed.courses.length;

    if (!warnings.length) {
      const source = parsed.sourceLabel ? `${parsed.sourceLabel}\n` : "";
      wx.showModal({
        title: "导入课程表",
        content: `${source}识别到 ${count} 条课程记录，导入会替换当前课程表（学期起始日保留）。继续吗？`,
        success: (result) => {
          if (!result.confirm) return;
          this.doImport(parsed);
        },
      });
      return;
    }

    // 有可疑点：先把「每条可疑点 + 具体课程名」拼成一段，避免同一条消息重复出现两次
    const detail = warnings
      .map((w) => {
        const tail = w.samples && w.samples.length ? `\n    ${w.samples.join("、")}` : "";
        return `· ${w.message}${tail}`;
      })
      .join("\n");

    wx.showModal({
      title: "解析结果需要确认",
      content: `识别到 ${count} 条课程，但有 ${warnings.length} 处可疑：\n${detail}\n\n导入后可在课表里手动补充。是否继续导入？`,
      confirmText: "仍然导入",
      cancelText: "先看看",
      success: (result) => {
        if (!result.confirm) {
          wx.showToast({ title: "已取消导入", icon: "none" });
          return;
        }
        this.doImport(parsed);
      },
    });
  },

  /** 真正写入课表（导入只替换课程，保留已设置的学期起始日） */
  doImport(parsed) {
    const next = scheduleStore.writeSchedule({ ...parsed, startDate: this.data.startDate });
    this.setData({ semesterLabel: next.semesterLabel }, () => this.applyCourses(next.courses));
    wx.showToast({ title: "导入成功", icon: "success" });
  },

  /**
   * 按扩展名分发：
   *   · `.pdf` → 上传服务端识别（服务端不可用时自动回退本地解析）
   *   · 其他   → 当作 JSON 文本读取
   */
  readScheduleFile(filePath) {
    if (/\.pdf$/i.test(filePath)) {
      this.parsePdfViaServer(filePath);
      return;
    }
    const fsManager = wx.getFileSystemManager();
    const attempt = (mayRetry) => {
      fsManager.readFile({
        filePath,
        encoding: "utf8",
        success: (readResult) => this.readScheduleText(readResult.data),
        fail: (err) => {
          const errMsg = (err && err.errMsg) || "读取文件失败";
          const notFound = /not found/i.test(errMsg);
          if (notFound && mayRetry) {
            setTimeout(() => attempt(false), 260);
            return;
          }
          // 微信开发者工具模拟器里，从电脑对话框选中的文件是 http://tmp/ 虚拟临时路径，
          // readFile 会报 not found。这不是用户操作问题，直接给可执行的替代方案。
          if (/^https?:\/\/tmp\//.test(filePath) || notFound) {
            this.showImportError("开发者工具读不到从电脑里选的文件（临时路径失效）。\n请改用「粘贴 JSON」：在电脑上打开课表 JSON → 全选复制 → 回到小程序点「粘贴 JSON」。\n真机从聊天（如文件传输助手）里选文件一般是正常的（PDF、JSON 都支持）。");
            return;
          }
          this.showImportError(`${errMsg}\n文件：${filePath}`);
        },
      });
    };
    attempt(true);
  },

  /** 弹层用：阻止触摸滚动穿透 */
  noop() {},

  /** 选文件导入：兼容 path / tempFilePath */
  onImport() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (chooseResult) => {
        const file = (chooseResult.tempFiles || [])[0] || {};
        const filePath = file.path || file.tempFilePath;
        if (!filePath) {
          this.showImportError("没有取到文件路径，请重新选择一次文件。");
          return;
        }
        this.readScheduleFile(filePath);
      },
      fail: (err) => {
        if (err && /cancel/i.test(err.errMsg || "")) return; // 用户主动取消
        this.showImportError((err && err.errMsg) || "打开文件选择器失败");
      },
    });
  },

  /** 备用通道：把 JSON 全文复制到剪贴板后直接粘贴导入（文件选择器读不到时用） */
  onPasteImport() {
    wx.getClipboardData({
      success: (res) => this.readScheduleText(res && res.data),
      fail: () => this.showImportError("无法读取剪贴板，请检查小程序剪贴板权限。"),
    });
  },
});
