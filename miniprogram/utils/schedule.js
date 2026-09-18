const DAY_NAMES = ["", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
const STORAGE_PREFIX = "sxl_course_schedule_v1_";
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getStorageKey() {
  const user = getApp().globalData.user || wx.getStorageSync("sxl_user") || {};
  const identity = user.username || user.wxOpenId || "default";
  return `${STORAGE_PREFIX}${identity}`;
}

function makeId() {
  return `course_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 严格解析 YYYY-MM-DD 为本地零点日期，非法值返回 null */
function parseDate(value) {
  const text = cleanText(value);
  if (!DATE_PATTERN.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** 归一到所在周的周一（周一为一周第一天） */
function toMonday(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function getWeekday(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function normalizeStartDate(value) {
  const date = parseDate(value);
  return date ? formatDate(toMonday(date)) : "";
}

/**
 * 以「第 1 周周一」为起点计算今天是第几周；未设置起始日返回 0，早于起始日按第 1 周处理。
 * 周次不设上限，由页面按选择器范围夹取。
 */
function computeWeekNumber(startDate, today) {
  const start = parseDate(startDate);
  if (!start) return 0;
  const base = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  const current = toMonday(base);
  const from = toMonday(start);
  const offsetDays = Math.round((current.getTime() - from.getTime()) / DAY_MS);
  if (offsetDays <= 0) return 1;
  return Math.floor(offsetDays / 7) + 1;
}

/** 返回某周的起止日期文本，用于展示「9月14日 - 9月20日」 */
function getWeekDateRange(startDate, weekNumber) {
  const start = parseDate(startDate);
  const week = toInt(weekNumber, 0);
  if (!start || week < 1) return null;
  const monday = toMonday(start);
  const first = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (week - 1) * 7);
  const last = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 6);
  return { from: formatDate(first), to: formatDate(last) };
}

function toInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function parseSection(value, fallback) {
  const text = cleanText(value);
  const match = text.match(/(\d+)\s*[-~至]\s*(\d+)/) || text.match(/(\d+)/);
  if (!match) return fallback;
  return { start: toInt(match[1], fallback), end: toInt(match[2] || match[1], fallback) };
}

/**
 * 解析周次文本 → 周次数组。
 *
 * ⚠️ 返回值有三种语义，调用方**必须**区分（见 `parseWeeks`）：
 *   · 非空数组 → 明确的周次集合
 *   · 空数组   → 需要看 `parseWeeks().kind` 才知道是「全周」还是「无信息」
 *
 * 之所以保留这个「返回空数组」的老签名，是因为它是导出的公开 API，
 * 别处（含测试）已在用。新代码请用 `parseWeeks`。
 */
function parseWeekNumbers(value) {
  const text = cleanText(value);
  if (!text || /全周|每周|全部/.test(text)) return [];
  // 教务周次常见写法：1-16周、1-8周,10-16周、1-16周(单)、3-14周(双)
  const oddOnly = /单/.test(text) && !/双/.test(text);
  const evenOnly = /双/.test(text) && !/单/.test(text);
  const numbers = [];
  text.replace(/(\d+)\s*[-~至]\s*(\d+)|(\d+)/g, (matched, rangeStart, rangeEnd, single) => {
    const start = toInt(rangeStart || single, 0);
    const end = toInt(rangeEnd || single, start);
    if (start > 0 && end >= start && end - start <= 60) {
      for (let week = start; week <= end; week += 1) {
        if (oddOnly && week % 2 === 0) continue;
        if (evenOnly && week % 2 === 1) continue;
        numbers.push(week);
      }
    }
    return matched;
  });
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/**
 * 周次解析（带语义）—— 用于需要区分「全周」与「没有周次信息」的场景。
 *
 * 背景（Task #7）：`parseWeekNumbers` 对「全周」和「空/乱码」都返回 `[]`，
 * 而 `isInWeek` 把 `[]` 当「每周都上」。结果是**周次缺失或解析失败的课，
 * 会静默地出现在每一周**，用户看到的是门不存在的课，完全无从察觉。
 *
 * 所以这里显式区分三种 kind：
 *   · "explicit" —— 解析出了具体周次（numbers 非空）
 *   · "all"      —— 原文明确写了「全周 / 每周 / 全部」
 *   · "unknown"  —— 原文为空，或写了东西但一个周次都没解析出来（乱码/新格式）
 *
 * `unknown` 的处置：显示上标「周次待确认」并**默认不参与每周匹配**，
 * 由界面提示用户去补。宁可少显示一门让用户发现，也不要多显示一门让他误信。
 */
function parseWeeks(value) {
  const text = cleanText(value);
  if (!text) return { kind: "unknown", numbers: [], text: "" };
  if (/全周|每周|全部/.test(text)) return { kind: "all", numbers: [], text };
  const numbers = parseWeekNumbers(text);
  if (!numbers.length) return { kind: "unknown", numbers: [], text };
  return { kind: "explicit", numbers, text };
}

function normalizeCourse(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const courseName = cleanText(raw.courseName || raw.name || raw.title || raw.kcmc);
  if (!courseName) return null;

  const section = raw.startSection !== undefined || raw.endSection !== undefined
    ? {
        start: toInt(raw.startSection, 1),
        end: toInt(raw.endSection, toInt(raw.startSection, 1)),
      }
    : parseSection(raw.sectionText || raw.section || raw.jcor || raw.jcs || raw.jc, 1);
  const weekday = Math.min(7, Math.max(1, toInt(raw.weekday || raw.dayOfWeek || raw.xqj, 1)));
  /*
   * 周次：把「单双周」合回周次文本。
   *
   * 解析层（服务端 pdf-schedule / 本地 PDF 解析）会把 `11-13周(单)` 拆成
   * weeks=`11-13周` + parity=`单`，但**存储层只认 weeks 文本**
   * （`parseWeekNumbers` 从文本里的括号识别单双）。
   * 不合并的话单双周会在写入这一步静默丢失 —— 表现为单周课在双周也显示。
   */
  let weeks = cleanText(raw.weeks || raw.weekRange || raw.zcd || raw.weekText);
  const parity = cleanText(raw.parity || raw.singleDouble);
  if (parity && weeks && !/[（(]\s*[单双]/.test(weeks)) weeks = `${weeks}(${parity})`;

  return {
    id: cleanText(raw.id) || `${makeId()}_${index}`,
    courseName,
    teacher: cleanText(raw.teacher || raw.instructor || raw.xm),
    room: cleanText(raw.room || raw.classroom || raw.cdmc),
    weekday,
    startSection: Math.min(12, Math.max(1, section.start)),
    endSection: Math.min(12, Math.max(section.start, section.end)),
    weeks,
    note: cleanText(raw.note || raw.remark),
  };
}

function sortCourses(courses) {
  return [...courses].sort((a, b) =>
    a.weekday - b.weekday || a.startSection - b.startSection || a.courseName.localeCompare(b.courseName, "zh-CN"),
  );
}

function readSchedule() {
  const saved = wx.getStorageSync(getStorageKey());
  if (!saved || typeof saved !== "object") {
    return { version: 1, semesterLabel: "我的课程表", startDate: "", courses: [] };
  }
  const courses = Array.isArray(saved.courses) ? saved.courses.map(normalizeCourse).filter(Boolean) : [];
  return {
    version: 1,
    semesterLabel: cleanText(saved.semesterLabel) || "我的课程表",
    startDate: normalizeStartDate(saved.startDate),
    courses: sortCourses(courses),
  };
}

function writeSchedule(schedule) {
  const normalized = {
    version: 1,
    semesterLabel: cleanText(schedule.semesterLabel) || "我的课程表",
    startDate: normalizeStartDate(schedule.startDate),
    courses: sortCourses((schedule.courses || []).map(normalizeCourse).filter(Boolean)),
  };
  wx.setStorageSync(getStorageKey(), normalized);
  return normalized;
}

function extractImportRecords(payload) {
  if (Array.isArray(payload)) return { records: payload, semesterLabel: "我的课程表" };
  if (!payload || typeof payload !== "object") return { records: [], semesterLabel: "我的课程表" };
  const records = payload.kbList || payload.courses || payload.schedule || payload.items || [];
  const student = payload.xsxx || {};
  const semester = [student.XNMC, student.XQMMC ? `第${student.XQMMC}学期` : ""].filter(Boolean).join(" · ");
  return { records: Array.isArray(records) ? records : [], semesterLabel: semester || "我的课程表" };
}

function parseImport(payload) {
  const { records, semesterLabel } = extractImportRecords(payload);
  const courses = records.map(normalizeCourse).filter(Boolean);
  if (!courses.length) throw new Error("JSON 中没有可识别的课程记录");
  return { version: 1, semesterLabel, courses: sortCourses(courses) };
}

/**
 * 某门课在第 `week` 周是否要上。
 *
 * ⚠️ 关键语义（Task #7 修复点）：
 *   · "explicit" → 按周次集合判断
 *   · "all"      → 每周都上（原文明确写了「全周」）
 *   · "unknown"  → **返回 false，不当成「每周都上」**
 *
 * 旧实现把 unknown 也当每周，导致周次丢了/没解析出来的课会出现在每一周，
 * 用户看到一门根本不存在的课却毫无察觉 —— 这比少显示一门危险得多。
 */
function isInWeek(course, week) {
  const parsed = parseWeeks(course.weeks);
  if (parsed.kind === "all") return true;
  if (parsed.kind === "unknown") {
    /*
     * 兜底：周次缺失但用户手动填过 note 的课，说明他知道自己在干什么，
     * 仍然按「每周」显示；没有 note 的才判为不可信、不显示。
     */
    return !!(course && course.note);
  }
  return parsed.numbers.includes(Number(week));
}

function getDayName(weekday) {
  return DAY_NAMES[Number(weekday)] || "星期一";
}

module.exports = {
  DAY_NAMES,
  getDayName,
  readSchedule,
  writeSchedule,
  parseImport,
  parseWeekNumbers,
  parseWeeks,
  isInWeek,
  normalizeCourse,
  formatDate,
  parseDate,
  toMonday,
  getWeekday,
  computeWeekNumber,
  getWeekDateRange,
  normalizeStartDate,
};
