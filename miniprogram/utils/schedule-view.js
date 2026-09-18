/**
 * 课程表视图层：由课程数据生成模板所需数据，并提供页面级交互方法。
 * 课程表页（pages/schedule）和考勤页（pages/duty）共用，避免两处各写一套渲染逻辑。
 * 用法：
 *   const scheduleView = require("../../utils/schedule-view");
 *   Page({ ...scheduleView.methods, data: { showManage: false, stickyHeaderOffset: 16, ... } });
 * 页面需自行提供 data.showManage（是否显示「导入 / 编辑课程表」入口）与 data.stickyHeaderOffset（滚动预留的吸顶高度，单位 px）。
 */
const store = require("./schedule");

const WEEK_OPTIONS = Array.from({ length: 20 }, (_, index) => `第${index + 1}周`);

/** 周次在选择器里的下标（超出 20 周时夹到最后一周） */
function weekIndexOf(weekNumber) {
  return Math.min(WEEK_OPTIONS.length, Math.max(1, Number(weekNumber) || 1)) - 1;
}

function formatMonthDay(dateText) {
  const date = store.parseDate(dateText);
  if (!date) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function buildWeekRangeLabel(startDate, weekNumber) {
  const range = store.getWeekDateRange(startDate, weekNumber);
  if (!range) return "";
  return `${formatMonthDay(range.from)} - ${formatMonthDay(range.to)}`;
}

/** 生成模板（templates/course-schedule.wxml）所需的全部字段 */
function buildView({ courses, weekIndex, startDate, showManage }) {
  const today = new Date();
  const todayWeekday = store.getWeekday(today);
  const currentWeek = store.computeWeekNumber(startDate, today);
  const index = Math.min(WEEK_OPTIONS.length - 1, Math.max(0, Number(weekIndex) || 0));
  const week = index + 1;
  const isCurrentWeek = currentWeek > 0 && index === weekIndexOf(currentWeek);
  const list = Array.isArray(courses) ? courses : [];

  const visibleDays = store.DAY_NAMES.slice(1).map((name, position) => {
    const weekday = position + 1;
    return {
      name,
      weekday,
      isToday: isCurrentWeek && weekday === todayWeekday,
      courses: list
        .filter((course) => course.weekday === weekday && store.isInWeek(course, week))
        .map((course) => {
          /*
           * 周次文案（Task #7）：
           *   有周次        → 原文
           *   明确写「全周」 → 「每周」
           *   周次缺失/乱码 → 「周次待确认」，并标 needsWeeks 供模板加警示样式
           * 不要再用 `course.weeks || "每周"` —— 它会把「没有周次」也说成每周。
           */
          const weeks = store.parseWeeks(course.weeks);
          const needsWeeks = weeks.kind === "unknown";
          return {
            id: course.id,
            courseName: course.courseName,
            sectionText: `${course.startSection}-${course.endSection}节`,
            detailText: [course.teacher, course.room].filter(Boolean).join(" · "),
            weekText: needsWeeks ? "周次待确认" : (weeks.kind === "all" ? "每周" : weeks.text),
            needsWeeks,
            note: course.note,
          };
        }),
    };
  });

  return {
    weekOptions: WEEK_OPTIONS,
    weekIndex: index,
    selectedWeekLabel: WEEK_OPTIONS[index],
    weekRangeLabel: buildWeekRangeLabel(startDate, week),
    currentWeek,
    isCurrentWeek,
    todayWeekday,
    hasStartDate: !!startDate,
    startDateLabel: startDate ? `${startDate}（周一）` : "未设置",
    startDatePickerValue: startDate || store.formatDate(store.toMonday(today)),
    hasCourses: list.length > 0,
    courseCount: list.length,
    visibleDays,
    showManage: !!showManage,
  };
}

/** 页面级交互方法，通过展开运算符混入 Page() */
const scheduleViewMethods = {
  /** 从缓存读取课程表并生成视图；本次进入页面或起始日变化时定位到当前周 */
  loadCourseView() {
    const saved = store.readSchedule();
    const currentWeek = store.computeWeekNumber(saved.startDate);
    // 起始日可能在课程表页被改过（考勤页与课程表页共用同一份缓存），此时要跟着重新定位
    const startDateChanged = saved.startDate !== this.data.startDate;
    const weekIndex = (!this.coursePositioned || startDateChanged) && currentWeek > 0
      ? weekIndexOf(currentWeek)
      : this.data.weekIndex;
    this.coursePositioned = true;
    if (startDateChanged) this.courseAutoScrolled = false;
    this.setData({
      courses: saved.courses,
      startDate: saved.startDate,
      semesterLabel: saved.semesterLabel,
      weekIndex,
      view: buildView({ courses: saved.courses, weekIndex, startDate: saved.startDate, showManage: this.data.showManage }),
    }, () => this.autoScrollToToday());
  },

  /** 课程数据变化（增删改、导入）后刷新视图，保持当前周次不变 */
  applyCourses(courses) {
    this.setData({
      courses,
      view: buildView({ courses, weekIndex: this.data.weekIndex, startDate: this.data.startDate, showManage: this.data.showManage }),
    });
  },

  /**
   * 打开时自动滚到今天那一栏；force 用于「回到本周」后强制再滚一次。
   * 用 createSelectorQuery 量出卡片位置后按 scrollTop 滚动（pageScrollTo 的 selector 方式
   * 在开发者工具里不稳定），卡片还没渲染时最多重试 3 次。
   */
  autoScrollToToday(force) {
    if (this.courseAutoScrolled && !force) return;
    const view = this.data.view;
    if (!view || !view.isCurrentWeek || !view.hasCourses) return;
    this.courseAutoScrolled = true;
    const reserve = Number(this.data.stickyHeaderOffset) || 16;
    const selector = `#day-${view.todayWeekday}`;
    let retries = 3;
    const run = () => {
      const query = wx.createSelectorQuery();
      query.select(selector).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec((res) => {
        const rect = res && res[0];
        const viewport = res && res[1];
        if (!rect || typeof rect.top !== "number") {
          if (retries > 0) {
            retries -= 1;
            setTimeout(run, 200);
          }
          return;
        }
        const currentScrollTop = (viewport && viewport.scrollTop) || 0;
        wx.pageScrollTo({
          scrollTop: Math.max(0, currentScrollTop + rect.top - reserve),
          duration: 320,
          fail: () => { /* 滚动失败不影响主流程 */ },
        });
      });
    };
    setTimeout(run, 120);
  },

  onWeekChange(e) {
    const weekIndex = Number(e.detail.value);
    this.setData({
      weekIndex,
      view: buildView({ courses: this.data.courses, weekIndex, startDate: this.data.startDate, showManage: this.data.showManage }),
    });
  },

  onStartDateChange(e) {
    const picked = String(e.detail.value || "");
    const startDate = store.normalizeStartDate(picked);
    if (!startDate) {
      wx.showToast({ title: "日期无效", icon: "none" });
      return;
    }
    const saved = store.readSchedule();
    store.writeSchedule({ ...saved, startDate });
    // 按新起始日重新定位到当前周，并滚到今天
    this.coursePositioned = false;
    this.courseAutoScrolled = false;
    this.loadCourseView();
    wx.showToast({
      title: picked === startDate ? "起始日已保存" : `已按第 1 周周一 ${startDate} 计算`,
      icon: picked === startDate ? "success" : "none",
    });
  },

  onGoCurrentWeek() {
    const view = this.data.view || {};
    if (!view.currentWeek) {
      wx.showToast({ title: "请先设置学期起始日", icon: "none" });
      return;
    }
    const weekIndex = weekIndexOf(view.currentWeek);
    this.setData({
      weekIndex,
      view: buildView({ courses: this.data.courses, weekIndex, startDate: this.data.startDate, showManage: this.data.showManage }),
    }, () => this.autoScrollToToday(true));
  },

  onManage() {
    wx.navigateTo({ url: "/pages/schedule/schedule" });
  },
};

module.exports = {
  buildView,
  weekIndexOf,
  formatMonthDay,
  buildWeekRangeLabel,
  WEEK_OPTIONS,
  /** 混入 Page() 的交互方法：Page({ ...scheduleView.methods, data: {...} }) */
  methods: scheduleViewMethods,
};
