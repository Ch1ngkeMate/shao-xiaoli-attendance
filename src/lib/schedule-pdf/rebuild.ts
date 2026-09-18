/**
 * 课表表格重建
 * ============================================================================
 * 输入的坐标已经是**设备坐标**（pdf.js 已应用内容流的 `cm` 变换），语义为：
 *     y → 星期方向（周一 133 / 周二 236.85 / … 步长 ≈103.85）
 *     x → 节次方向（1-2 节 ≈ 89.5，3-4 节 ≈ 201，步长 ≈55.8）
 *
 * 因此不再需要上一版手写的 `applyMatrix` / `rotatePoint` / `readMediaBox`。
 *
 * ---------------------------------------------------------------------------
 * 🔴 最关键的结论：分块只能靠「绘制顺序」，不能靠几何
 * ---------------------------------------------------------------------------
 * 实测高毅周1，同一格里两门课的碎片坐标**完全相同**：
 *     #108 x=28.0 y=104.080 "(3-4节)9-12周/校区:南校区"
 *     #193 x=28.0 y=104.080 "试/选课备注:/课程学时组成"
 * x/y 逐对重合 → 任何坐标聚类 / 网格归属 / 序号配对在数学上都无解
 * （三种方案都试过，全部失败）。
 *
 * 但内容流是**按课程成组绘制**的：一门课整块画完，再画下一门。
 * 所以算法退化成最朴素的一行逻辑：
 *     按绘制顺序遍历本周碎片；遇到「课名行（以 ★/☆ 等结尾）」就开新块；
 *     其余碎片归入当前块。开块之前出现的碎片（课名被裁切）归入「孤儿块」。
 *
 * 额外的坑：**课名可能被排版切成两片**——「前半段(无★)」+「后半段(带★)」。
 * 实测李奕然周1 `针灸推拿国际创新与实践`：
 *     "针灸推拿国际创新与实"（无★） + "践☆"（带★）
 * 不处理会**整整漏掉一门课**（13 门变 12 门）。修法见 `splitBlocksInRow`。
 */
import {
  DETAIL_SECTION_RE,
  WEEKDAY_NAMES,
  cleanCourseName,
  isTitleText,
  parseCell,
  pickSemesterLabel,
  type ParsedCourse,
} from "./cell";
import type { PdfTextItem } from "./extract";

export type ScheduleWarning = {
  level: "warn" | "info";
  code: string;
  count: number;
  message: string;
  samples?: string[];
  items?: { courseName: string; teacher: string | null; weeks: string | null }[];
};

export type UnmatchedCell = {
  weekday: number;
  reason: string;
  /** 原文片段，供「识别预览」展示，方便用户判断丢了什么 */
  text: string;
};

export type RebuildResult = {
  courses: ParsedCourse[];
  warnings: ScheduleWarning[];
  unmatchedCells: UnmatchedCell[];
  confidence: number;
  semesterLabel: string;
};

/** 行带：一个星期的纵向区间 */
export type WeekdayRow = {
  weekday: number;
  y0: number;
  y1: number;
  center: number;
  rowH: number;
};

/** 统一成内部使用的字段名（pdf.js 用 `str`，迁移过来的逻辑用 `text`） */
type RowItem = { text: string; x: number; y: number; order: number };

function toRowItem(t: PdfTextItem): RowItem {
  return { text: t.str, x: t.x, y: t.y, order: t.order };
}

/**
 * 用星期表头的 y 定位 7 个行带。
 *
 * ⚠️ 必须先判星期、再判 isTitleText —— 顺序反了就永远取不到表头。
 * isTitleText 把「星期一..星期日」也归为标题（正文解析时确实要排除它们），
 * 但这里恰恰要靠它们定行。**这个顺序 bug 真实发生过**（rows 恒为 0）。
 */
export function buildWeekdayRows(items: PdfTextItem[]): WeekdayRow[] {
  const headerY: Record<number, number> = {};
  items.forEach((t) => {
    const i = WEEKDAY_NAMES.indexOf(t.str.trim());
    if (i < 0) return;
    // 同一天取最靠下的那次（避免碎片重复；设备坐标 y 越大越靠后）
    if (headerY[i + 1] === undefined || t.y > headerY[i + 1]) headerY[i + 1] = t.y;
  });

  const present = Object.keys(headerY)
    .map(Number)
    .sort((a, b) => a - b);
  if (present.length < 3) return [];

  // 相邻表头 y 间距 = 行高（同一模板固定），用中位数抗抖动
  const gaps: number[] = [];
  for (let i = 1; i < present.length; i += 1) {
    gaps.push((headerY[present[i]] - headerY[present[i - 1]]) / (present[i] - present[i - 1]));
  }
  const rowH = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (!Number.isFinite(rowH) || rowH <= 0) return [];

  const rows: WeekdayRow[] = [];
  for (let wd = 1; wd <= 7; wd += 1) {
    if (headerY[wd] === undefined) continue;
    rows.push({
      weekday: wd,
      y0: headerY[wd] - rowH / 2,
      y1: headerY[wd] + rowH / 2,
      center: headerY[wd],
      rowH,
    });
  }
  return rows;
}

/**
 * 把文字按「星期行」分桶。
 *
 * 关键：**只用 y 判星期**。节次直接从详情的 `(N-M节)` 读，不需要 x 参与判定。
 * 落在所有行之外的文字（标题、页脚、图例）归入 unassigned，**不静默丢弃**。
 */
export function bucketByWeekday(
  items: PdfTextItem[],
  rows: WeekdayRow[],
): { buckets: Record<number, RowItem[]>; unassigned: RowItem[] } {
  const buckets: Record<number, RowItem[]> = {};
  const unassigned: RowItem[] = [];
  if (!rows.length) return { buckets, unassigned: items.map(toRowItem) };

  /*
   * ⚠️ 容差必须**很小**（2pt），不能用「行高 × 12%」。
   *
   * 踩过的坑：用 12%（≈12.5pt）时，**节次编号行**会漏进每个星期行。
   * 实测节次编号（`1`..`12`）与 `节次` 标签的设备 y = 75.4 / 78.1 / 68.9，
   * 而周1 的行带是 [81.1, 184.9] —— 只差 3pt 就漏进来了。
   * 漏进来后会被拼进课程 blob，把课程名和详情搅乱。
   * 真正的内容文字离行边界有 20pt 以上余量（实测内容在 y=104.1），
   * 所以 2pt 足够，且能把编号行干净地挡在外面。
   */
  const margin = 2;

  items.forEach((t) => {
    let hit: WeekdayRow | null = null;
    for (const r of rows) {
      if (t.y >= r.y0 - margin && t.y <= r.y1 + margin) {
        hit = r;
        break;
      }
    }
    const item = toRowItem(t);
    if (!hit) {
      unassigned.push(item);
      return;
    }
    (buckets[hit.weekday] = buckets[hit.weekday] || []).push(item);
  });

  return { buckets, unassigned };
}

const STAR_TAIL_RE = /[★☆■◆□◇]\s*$/;

/**
 * 在「同一星期行」内按绘制顺序把碎片切成一个课程块。
 * 详细背景见文件头「分块只能靠绘制顺序」一节。
 */
export function splitBlocksInRow(items: RowItem[]): RowItem[][] {
  if (!items.length) return [];

  // 按绘制顺序排。order 缺失（测试直接构造）时退化为数组原序，保证不引入随机性
  const sorted = items
    .map((t, i) => ({ t, d: Number.isFinite(t.order) ? t.order : i }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.t);

  const isStarLine = (t: RowItem) => !isTitleText(t.text) && STAR_TAIL_RE.test(t.text);

  /*
   * ★ 位置修正：课名被排版切成两片时，「前半段」不带 ★。
   * 假设「课名行一定以 ★ 结尾」在课名较长时会失效。实测李奕然周1：
   *     "针灸推拿国际创新与实"（无★） + "践☆"（带★）
   * 不处理的话：前半段被并进上一门课污染它，后半段单独开块后课名只剩
   * 一个字「践」→ 被 `length < 2` 丢掉，**净效果是整整漏掉一门课**。
   *
   * 判据用**内容**（不含数字/冒号/节/周）而不是坐标 —— 坐标在这里依旧不可靠，
   * 那两片的 x 相差 13.5，与「课名→详情」的常规步长 12 太接近，无法区分。
   */
  const isNameOnly = (t: RowItem) => {
    const s = t?.text || "";
    if (isTitleText(s)) return false;
    if (!/[\u4e00-\u9fa5]/.test(s)) return false; // 必须含中文
    if (s.length < 2) return false;
    if (/\d/.test(s)) return false; // 详情行一定含数字（节次/周次/班级号）
    if (/[：:]/.test(s)) return false; // 详情行有 `场地:` / `教师:`
    if (/[节周]/.test(s)) return false; // `3-4节` / `5周`
    return true;
  };

  const ordered: RowItem[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const t = sorted[i];
    const next = sorted[i + 1];
    if (next && isNameOnly(t) && isStarLine(next)) {
      // 合并后以带 ★ 那片的 order 为准（它更接近整行的位置）
      ordered.push({ x: next.x, y: next.y, text: t.text + next.text, order: next.order });
      i += 1; // 跳过已被合并的带 ★ 片
      continue;
    }
    ordered.push(t);
  }

  const blocks: RowItem[][] = [];
  let current: RowItem[] | null = null;
  const orphans: RowItem[] = [];

  ordered.forEach((t) => {
    if (isTitleText(t.text)) return; // 表头/图例不进块

    if (isStarLine(t)) {
      if (current) blocks.push(current);
      current = [t];
      return;
    }
    if (current) current.push(t);
    else orphans.push(t); // 课名被裁切：这些详情在首个 ★ 之前
  });
  if (current) blocks.push(current);

  /*
   * 块内不再排序 —— 绘制顺序本身就是阅读顺序（课名行 → 详情第1行 → 第2行…）。
   * 仅当某块因拼接顺序抖动而出现「详情行跑到课名行前面」时，把课名行提到首位。
   */
  const normalized = blocks.map((g) => {
    const starAt = g.findIndex(isStarLine);
    if (starAt <= 0) return g;
    return [g[starAt]].concat(g.slice(0, starAt), g.slice(starAt + 1));
  });

  /*
   * 孤儿块：单独成块，交给 parseCell 尽力解析。
   * 但只有它真的含 `(N-M节)` 时才值得保留 —— 否则就是页脚/图例碎片，
   * 实测会出现 `核方式`/`时组成` 这种纯碎片伪课名。
   */
  if (orphans.length) {
    const hasSection = orphans.some((t) => DETAIL_SECTION_RE.test(t.text || ""));
    if (hasSection) {
      const starAt = orphans.findIndex(isStarLine);
      const rest =
        starAt >= 0
          ? [orphans[starAt]].concat(orphans.slice(0, starAt), orphans.slice(starAt + 1))
          : orphans;
      normalized.push(rest);
    }
  }

  return normalized;
}

/**
 * 解析「其他课程」脚注 —— 表格外的一类真实课程，绝不能静默丢掉。
 *
 * 教务课表会单独列出**不占固定星期/节次**的课程（军事理论走线上、思想政治
 * 实践课按周次安排），它们画不进格子里。解析器没办法把它们放到课表上，
 * 但丢掉就等于告诉学生「你没这门课」。
 *
 * 原文形如：
 *   其他课程：军事理论教育□外校线上教师(共18周)/1-18周/无;  思想政治实践课（一）◇朱蕾(共4周)/2-5周/无;
 */
export function parseOtherCourses(text: string) {
  const body = text.replace(/^[\s\S]*?其他课程\s*[:：]?/, "");
  return body
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const markerAt = s.search(/[★☆■◆□◇]/);
      const head = markerAt >= 0 ? s.slice(0, markerAt) : s;
      const rest = markerAt >= 0 ? s.slice(markerAt + 1) : "";
      const teacher = ((rest.match(/^([^（(]*)/) || [])[1] || "").trim();
      // 优先取 `(共18周)/1-18周/` 里的实际周次，其次退回括号内的总周数
      const weeks =
        (s.match(/[（(][^）)]*[）)]\s*\/\s*([^/;]+)\//) || [])[1] ||
        (s.match(/[（(]([^）)]*)[）)]/) || [])[1] ||
        "";
      const name = cleanCourseName(head) || head.trim();
      if (!name) return null;
      return { courseName: name, teacher: teacher || null, weeks: weeks.trim() || null };
    })
    .filter(Boolean) as { courseName: string; teacher: string | null; weeks: string | null }[];
}

/**
 * 计算置信度。**解析成功 ≠ 结果可信**，这个数字是给导入前确认框用的。
 *
 * 保守设计：任何一处「没能识别成课程」的文本都显著扣分，
 * 缺周次扣得比缺教师/教室重（周次错了会直接把课表显示错周次）。
 */
export function computeConfidence(input: {
  courseCount: number;
  missingWeeks: number;
  missingTeacher: number;
  missingRoom: number;
  droppedBlocks: number;
  unassigned: number;
  otherCourses: number;
  hasTextLayer: boolean;
}): number {
  if (!input.hasTextLayer) return 0;
  if (!input.courseCount) return 0;

  let score = 1;
  score -= Math.min(0.3, input.missingWeeks * 0.03);
  score -= Math.min(0.1, input.missingTeacher * 0.01);
  score -= Math.min(0.1, input.missingRoom * 0.01);
  score -= Math.min(0.4, input.droppedBlocks * 0.08);
  score -= Math.min(0.3, input.unassigned * 0.04);
  score -= Math.min(0.1, input.otherCourses * 0.02);

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/** 按星期行分桶 → 分块 → 字段解析 → 去重 → 告警，产出最终结果 */
export function rebuildSchedule(items: PdfTextItem[]): RebuildResult {
  const rows = buildWeekdayRows(items);
  if (!rows.length) throw new Error("没识别到星期表头，可能不是标准教务课表");

  const { buckets, unassigned } = bucketByWeekday(items, rows);

  // 学期名：取所有行带之外的标题文字
  const titleTexts = unassigned
    .filter((t) => !isTitleText(t.text))
    .sort((a, b) => b.y - a.y);
  const semesterLabel = pickSemesterLabel(
    titleTexts.concat(
      items
        .filter((t) => /课表|学年|学期/.test(t.str))
        .map((t) => ({ text: t.str, x: t.x, y: t.y, order: t.order })),
    ),
  );

  const courses: ParsedCourse[] = [];
  const droppedBlocks: { weekday: number; reason: string; text: string }[] = [];

  Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((weekday) => {
      const rowItems = buckets[weekday].filter((t) => !isTitleText(t.text));
      const blocks = splitBlocksInRow(rowItems);

      blocks.forEach((group) => {
        if (!group.length) return;
        /*
         * 按绘制顺序拼接 = 还原原文阅读顺序。
         * splitBlocksInRow 返回的块已经是绘制顺序（课名行打头、详情依次跟随），
         * 直接用数组顺序 join —— **不要再按 x 排序**，几何重合的碎片会被排乱。
         */
        const blob = group.map((t) => t.text).join("");

        const parsed = parseCell(blob);
        const courseName = cleanCourseName(parsed.courseName);

        if (!courseName) {
          droppedBlocks.push({ weekday, reason: "课名为空", text: blob.slice(0, 60) });
          return;
        }
        // 挡掉「假课程名」：纯数字（班级号/课程号碎片）、纯符号、单字符
        if (/^[\d\s.\-]+$/.test(courseName)) {
          droppedBlocks.push({ weekday, reason: "课名是纯数字", text: blob.slice(0, 60) });
          return;
        }
        if (/^[^\u4e00-\u9fa5a-zA-Z]+$/.test(courseName)) {
          droppedBlocks.push({ weekday, reason: "课名是纯符号", text: blob.slice(0, 60) });
          return;
        }
        if (courseName.length < 2) {
          droppedBlocks.push({ weekday, reason: "课名过短", text: blob.slice(0, 60) });
          return;
        }
        /*
         * 幽灵记录判定：课程名**不含任何中文**（纯数字/字母/符号碎片），
         * 且详情字段全空。真实课程名必含中文，所以这条不会误删真课程。
         */
        const hasCJK = /[\u4e00-\u9fa5]/.test(courseName);
        if (!hasCJK && !parsed.teacher && !parsed.room && !parsed.weeks) {
          droppedBlocks.push({ weekday, reason: "幽灵记录（无中文课名且详情全空）", text: blob.slice(0, 60) });
          return;
        }

        courses.push({
          weekday,
          startSection: parsed.startSection,
          endSection: parsed.endSection,
          courseName,
          teacher: parsed.teacher,
          room: parsed.room,
          weeks: parsed.weeks,
          parity: parsed.parity,
        });
      });
    });

  /*
   * 去重（同一天同一时段同一门课只保留信息最全的一条）。
   *
   * ⚠️ 判重键**必须包含周次与教师**。旧实现只有「星期+节次+课程名」，
   * 已证实会合并掉真实存在的不同课次：实测陈亚楠周2 有三条
   * `中医护理学导论`，教师分别是 林洁 / 王萍丽 / 李翠娟，
   * 周次分别是 12-13周 / 3-4周 / 5周,9周 —— 它们**是三次不同的课**。
   * 所以只有「周次 + 节次 + 课名 + 单双 + 教师 + 教室」全一样才算重复。
   */
  const merged: ParsedCourse[] = [];
  const indexOfKey: Record<string, number> = {};
  courses.forEach((c) => {
    const key = [
      c.weekday,
      c.startSection,
      c.endSection,
      c.courseName,
      c.weeks,
      c.parity,
      c.teacher,
      c.room,
    ].join("|");
    const at = indexOfKey[key];
    if (at === undefined) {
      indexOfKey[key] = merged.length;
      merged.push(c);
      return;
    }
    // 完全同键 → 只补空字段（碎片抖动产生的同一条课）
    const prev = merged[at];
    if (!prev.weeks && c.weeks) prev.weeks = c.weeks;
    if (!prev.room && c.room) prev.room = c.room;
    if (!prev.teacher && c.teacher) prev.teacher = c.teacher;
    if (!prev.parity && c.parity) prev.parity = c.parity;
  });

  const warnings: ScheduleWarning[] = [];

  const noWeeks = merged.filter((c) => !c.weeks);
  const noTeacher = merged.filter((c) => !c.teacher);
  const noRoom = merged.filter((c) => !c.room);

  if (noWeeks.length) {
    warnings.push({
      level: "warn",
      code: "MISSING_WEEKS",
      count: noWeeks.length,
      message: `${noWeeks.length} 条课程没有周次信息`,
      samples: noWeeks.slice(0, 3).map((c) => c.courseName),
    });
  }
  if (noTeacher.length) {
    warnings.push({
      level: "info",
      code: "MISSING_TEACHER",
      count: noTeacher.length,
      message: `${noTeacher.length} 条课程没有教师信息`,
      samples: noTeacher.slice(0, 3).map((c) => c.courseName),
    });
  }
  if (noRoom.length) {
    warnings.push({
      level: "info",
      code: "MISSING_ROOM",
      count: noRoom.length,
      message: `${noRoom.length} 条课程没有教室信息`,
      samples: noRoom.slice(0, 3).map((c) => c.courseName),
    });
  }
  if (droppedBlocks.length) {
    warnings.push({
      level: "warn",
      code: "DROPPED_BLOCKS",
      count: droppedBlocks.length,
      message: `${droppedBlocks.length} 段文字没能识别成课程`,
      samples: droppedBlocks.slice(0, 3).map((d) => `周${d.weekday}（${d.reason}）`),
    });
  }

  /*
   * 表格之外的文字：区分「正常表头」与「真的漏读了」。
   *
   * 行带之外本来就会有大量正常文字：`时间段` `节次`、`1`..`12`（节次轴编号）、
   * `上午` `中午` `下午` `晚上`、图例、标题。旧实现只要「非标题且超过 12 条」
   * 就报警，于是每份课表都报一次「19 段文字落在课程表格之外」——
   * **假警报比不报警更糟**：用户会开始忽略警告。
   */
  const AXIS_LABEL_RE = /^(时间段|节次|上午|中午|下午|晚上|\d{1,2})$/;
  const looksLikeCourseText = (s: string) =>
    /[节周]|场地|教室|教师|校区|教学班|学分|学时/.test(s);
  const suspicious = unassigned.filter((t) => {
    const s = String(t?.text || "").trim();
    if (isTitleText(s)) return false;
    if (AXIS_LABEL_RE.test(s)) return false;
    // 「其他课程」脚注由下面单独处理，不再重复当成「漏读的文字」
    if (/其他课程/.test(s)) return false;
    return looksLikeCourseText(s);
  });
  if (suspicious.length) {
    warnings.push({
      level: "warn",
      code: "UNASSIGNED_TEXT",
      count: suspicious.length,
      message: `${suspicious.length} 段课程文字落在了课程表格之外（可能课表列宽与模板不符）`,
      samples: suspicious.slice(0, 3).map((t) => String(t.text).slice(0, 16)),
    });
  }

  // 「其他课程」脚注
  const otherFootnote = unassigned
    .map((t) => String(t?.text || ""))
    .find((s) => /其他课程/.test(s));
  const otherCourses = otherFootnote ? parseOtherCourses(otherFootnote) : [];
  if (otherCourses.length) {
    warnings.push({
      level: "info",
      code: "OTHER_COURSES",
      count: otherCourses.length,
      message: `另有 ${otherCourses.length} 门「其他课程」不在课表格子里（没有固定星期/节次，需自行安排时间）`,
      samples: otherCourses.slice(0, 3).map((c) => c.courseName),
      items: otherCourses,
    });
  }

  const confidence = computeConfidence({
    courseCount: merged.length,
    missingWeeks: noWeeks.length,
    missingTeacher: noTeacher.length,
    missingRoom: noRoom.length,
    droppedBlocks: droppedBlocks.length,
    unassigned: suspicious.length,
    otherCourses: otherCourses.length,
    hasTextLayer: true,
  });

  return {
    courses: merged,
    warnings,
    unmatchedCells: droppedBlocks.map((d) => ({
      weekday: d.weekday,
      reason: d.reason,
      text: d.text,
    })),
    confidence,
    semesterLabel: semesterLabel || "我的课程表",
  };
}
