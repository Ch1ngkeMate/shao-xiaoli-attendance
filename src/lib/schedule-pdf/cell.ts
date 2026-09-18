/**
 * 课表单元格字段解析
 * ============================================================================
 * 本文件是从 `miniprogram/utils/pdf-schedule.js` 迁移过来的**已验证文本解析层**。
 *
 * 分工：
 *   · extract.ts —— PDF 引擎层（原来手写，现交给 pdfjs-dist）
 *   · cell.ts    —— 单条课程文本 → 结构化字段（本文件）
 *   · rebuild.ts —— 表格重建（定位星期行/节次列、分块、汇总告警）
 *
 * 迁移时**刻意保持判定逻辑逐字一致** —— 这些正则背后是大量真实 PDF 的
 * 实测结论（见各函数上方的注释），改一个字都可能静默丢课。
 * 唯一的变化是：pdf.js 给出的碎片比手写内容流解析**更完整**，
 * 因此原先为「碎片在字段中间被切断」准备的那部分清洗逻辑命中率会下降，
 * 但保留它们没有害处（幂等），且能兜住仍然出现抖动的模板。
 */

export type ParsedCourse = {
  weekday: number;
  startSection: number;
  endSection: number;
  courseName: string;
  teacher: string;
  room: string;
  weeks: string;
  /** 单双周："单" | "双" | ""（空 = 每周） */
  parity: string;
};

export const WEEKDAY_NAMES = [
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
  "星期日",
];

export const SECTION_RE = /\((\d+)\s*-\s*(\d+)\s*节\)|\((\d+)\s*节\)/;

/**
 * 详情行判定专用正则：必须容忍「节次横跨两个碎片」。
 *
 * 实测陈亚楠周1 的详情碎片是：
 *   x=288.5  "(11-12节)3-5周,9-10周,12周"
 *   x=291.0  "(7-8节)3-5周,9-17周/校区:南"
 * 旧写法把 `\(` 写在正则里并用 exec().index<=2 判定，一旦详情碎片因拼接顺序
 * 抖动变成以空白开头，就会静默失败（表现：detailIdx=[]，星全成「无详情孤儿」）。
 * 因此放宽为：只要文本前段出现 «数字-数字节» 或 «数字节» 即认定为详情行。
 */
export const DETAIL_SECTION_RE =
  /(\d{1,2})\s*[-–—~]\s*(\d{1,2})\s*节|(?<![\d-])(\d{1,2})\s*节(?![\d-])/;

/**
 * 周次：形如 `3-5周,9-19周` / `3周` / `4-5周,9-18周`，后面可能紧跟 `(单)`/`(双)`。
 *
 * ⚠️ `(单)`/`(双)` 必须**单独捕获** —— 下游课表逻辑支持单双周，上游丢掉就无法恢复。
 * 实测 `11-13周(单)` 曾被解析成 `11-13周`。
 */
export const WEEKS_RE =
  /(\d+(?:\s*-\s*\d+)?\s*周(?:[,,]\s*\d+(?:\s*-\s*\d+)?\s*周)*)\s*(?:[(（]\s*(单|双)\s*周?\s*[)）])?/;

/** 单独再抓一次单双周标记（周次串后面可能隔着斜杠/其它内容） */
export const PARITY_RE = /[(（]\s*(单|双)\s*周?\s*[)）]/;

const COURSE_NAME_BAD_RE = /场地|教师|教学班/;

const FIELD_NAMES = [
  "场地",
  "教师",
  "教学班组成",
  "教学班",
  "考核方式",
  "选课备注",
  "课程学时",
  "周学时",
  "学分",
  "总学时",
  "校区",
  "节次",
];
const FIELD_SPLIT_RE = new RegExp(`(${FIELD_NAMES.join("|")})[:：]`, "g");

/**
 * 把拼接后的详情文本切成 { 字段名: 值 }。
 *
 * 背景：手写内容流解析时，同一行的文字被按字符块切碎成多条 Tj，拼接后会出现
 *   ...教师:张:2.0川,华永兰/场地:操场/...
 *   ...教师:黄鹤师:霍丁鹏/场地:5501/...
 * 即**下一个字段名会插进上一个字段值的中间**。裸正则要么吃进 `时:32`，
 * 要么把值切成 `黄鹤`。对策是先把整个 blob 按「字段名 + 冒号」切成有序的
 * {key, value}，值只取到下一个字段名出现之前，借此天然截断抖动碎片。
 */
export function splitFields(blob: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!blob) return out;
  const marks: { key: string; start: number; valueStart: number }[] = [];
  FIELD_SPLIT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIELD_SPLIT_RE.exec(blob)) !== null) {
    marks.push({ key: m[1], start: m.index, valueStart: m.index + m[0].length });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const cur = marks[i];
    const end = i + 1 < marks.length ? marks[i + 1].start : blob.length;
    let value = blob.slice(cur.valueStart, end);
    // 截掉「/」分隔与尾部残留的冒号片段
    value = value.split("/")[0];
    value = value.replace(/[:：][^:：]*$/, "");
    value = value.replace(/^[\s/:：]+/, "").replace(/[\s]+$/, "").trim();
    if (out[cur.key] === undefined || !out[cur.key]) out[cur.key] = value;
  }
  return out;
}

/**
 * 清洗提取到的字段值：去掉混进来的学时/学分碎片与装饰符。
 * 例：`张川,华永兰时:32` → `张川,华永兰`；`张:2.0川,华永兰` → `张川,华永兰`。
 */
export function cleanFieldValue(value: string, kind: "room" | "teacher"): string {
  if (!value) return "";
  let s = String(value);

  if (kind === "room") {
    /*
     * 房间位置不该出现课程号 / 班级串。实测 `-130008-01`、`2027-1)-130008-01`
     * 会因碎片抖动落进场地字段，必须在**剥掉前后缀之前**就判掉
     * （后一步会把前导 `-` 去掉，`^\d{4}-` 类判据就失效了）。
     */
    const raw = s.replace(/[\s/]+/g, "");
    if (/\d{4}-\d+-\d/.test(raw)) return "";
    if (/\d{6}-\d{2}/.test(raw)) return "";
    if (/教学班|组成/.test(raw)) return "";
  }

  // 去掉「xx:数字」形式的学时/学分残片（值内部被塞进的字段名尾巴）
  s = s.replace(/[时分区班核注学][:：]?\s*[\d.]+/g, "");
  s = s.replace(/(学时|学分|考核|备注|周学时|总学时)[:：]?[\d.]*/g, "");

  if (kind === "teacher") {
    /*
     * 教师值尾部常粘连被切碎的字段名残片，实测形态：
     *   `石馨心学班组成`  ← `教学班组成:` 被截成 `学班组成`
     *   `雷筱菁式`        ← `考核方式:` 只剩 `式`
     *   `张川,华永兰时`   ← `学时:32` 的 `时`
     *   `史旋100319-05`   ← 课程号残片
     * 统一在字段名残片上截断（取最早出现的位置）。
     *
     * ⚠️ 残片列表必须同时包含「完整词」和「被切掉头部的残片」——
     * 实测残片比完整词更常见（碎片切点落在词中间）。
     * 也正因如此，这些残片只在**没有冒号跟随**时才作为截断点，
     * 否则会误伤「王式」这类正常姓名（用 `式$` 而非裸 `式` 来约束）。
     */
    const cuts = [
      /学班组成/,
      /教学班组成/,
      /教学班组/,
      /教学班/,
      /考核方式/,
      /核方式/,
      /式(?=[:：])/,
      /式$/,
      /选课备注/,
      /课备注/,
      /备注(?=[:：])/,
      /课程学时/,
      /程学时/,
      /周学时/,
      /总学时/,
      /学时/,
      /学分(?=[:：])/,
      /学分$/,
      /场地/,
      /校区/,
    ];
    let cut = s.length;
    cuts.forEach((re) => {
      const mm = re.exec(s);
      if (mm && mm.index < cut) cut = mm.index;
    });
    s = s.slice(0, cut);
    // 截断粘连的课程号（6 位数字-2 位数字，允许前置负号）
    s = s.replace(/-?\d{6}-\d{2,}$/, "");
    /*
     * 尾部孤立的字段名单字残片。实测 `教师:黄鹤师`（后接 `师:霍丁鹏` 的残片）
     * → 需要把尾巴的 `师` 切掉。字符集必须覆盖所有字段名的单字。
     * 只切「位于结尾」的连续残片，且要求前面已有足量内容（≥2 字），
     * 避免把「王」「李」这类真实单字姓也一起吃掉。
     */
    s = s.replace(/[教师场地校区学分时段周总考核备注选课教学班组核注组成]+$/, (tail) =>
      s.length - tail.length >= 2 ? "" : tail,
    );
  }
  s = s.replace(/[:：]/g, "");
  s = s.replace(/[★☆◇■◆□]+$/g, "");
  /*
   * 清掉夹在姓名之间的数字残片。
   * 必须在删冒号**之后**做：`张:2.0川` 先变成 `张2.0川`，才能被这里的
   * 「汉字+数字+汉字」形态命中 → `张川`。
   */
  if (kind === "teacher") {
    s = s.replace(/([\u4e00-\u9fa5])\d+(?:\.\d+)?(?=[\u4e00-\u9fa5])/g, "$1");
  }
  s = s.replace(/^[\s/\-–—,，、]+/, "").replace(/[\s/\-–—,，、]+$/, "").trim();

  if (kind === "teacher") {
    if (/^\d/.test(s) && !/^[\d]+$/.test(s)) s = s.replace(/^[\d.]+/, "");
  }
  return s;
}

/** 表头/图例等「不是课程内容」的文字 */
export function isTitleText(text: string | undefined | null): boolean {
  if (!text) return true;
  const s = String(text).trim();
  if (!s) return true;
  // 星期表头本身不是课程内容
  if (WEEKDAY_NAMES.indexOf(s) >= 0) return true;
  if (/学号|打印时间|打印日期|课表|学期|学年/.test(s)) return true;
  // 装饰符图例：`★: 理论 ☆: 实验 ■: 见习 ◆: 讨论 □: 线上 ◇: 实训`
  if (/[★☆◇■◆□]\s*[:：]\s*(理论|实验|见习|讨论|线上|实训)/.test(s)) return true;
  if (/^(理论|实验|见习|讨论|线上|实训)\s*[:：]/.test(s)) return true;
  return false;
}

/**
 * 清洗课程名：把粘连在名字后面的详情尾巴截掉。
 *
 * 教务 PDF 的碎片切分点没有任何语义，实际会出现
 *   「中医基础理论★2027-1)-130008-01/教学班组」
 *   「大学体育（一）★:80/周学时:6/总学时:80/学分」
 * 这类拼接结果。这里按「详情起始特征」在第一个命中处截断。
 */
export function cleanCourseName(name: string): string {
  if (!name) return "";
  let s = String(name).trim();

  s = s.replace(/[\s]+/g, "");

  const cutPatterns = [
    /\(\d+\s*-\s*\d+\s*节\)/, // (1-2节)
    /\(\d+\s*节\)/, // (3节)
    /\(\d{4}-\d{4}-\d\)/, // (2026-2027-1)
    /\d{4}-\d{4}-\d\)?/, // 2026-2027-1（含被切掉左括号的情况）
    /\d{4}-\d+\)/, // 2601-1) 之类的残片
    /校区|场地|教师|教学班|考核|选课|备注|学时|学分|周学时/,
    /\/[^/]{0,6}[：:]/,
    /[：:]/,
    /[;；]/,
    /[★☆◇■◆□]/, // 装饰星号之后一定不是课程名
  ];
  let cut = s.length;
  cutPatterns.forEach((re) => {
    const m = re.exec(s);
    if (m && m.index < cut) cut = m.index;
  });
  s = s.slice(0, cut);

  s = s.replace(/[★☆◇■◆□+\-—–_\s/、,，.。]+$/g, "").trim();
  s = s.replace(/^[\s/:：、,，.。+\-—–_]+/g, "").trim();
  s = s.replace(/[\s]+/g, "");
  s = s.replace(/[（(\[【]+$/g, "").trim();

  if (s.length < 2) return "";
  return s;
}

/**
 * 从表头上方的标题行里挑出真正的「学期名」（如 2026-2027学年第1学期）。
 *
 * 实测表头上方会有多条被切碎的文字：
 *   2026-2027学年第1学期   ← 想要这条
 *   郭亦菲课表
 *   学号：526010801548
 * 顺序不保证，所以优先匹配学期特征，匹配不到再退化为「含『课表』的那条」。
 */
export function pickSemesterLabel(titleTexts: { text: string }[]): string {
  if (!titleTexts || !titleTexts.length) return "";
  const clean = (s: string) => String(s || "").replace(/[\s]+/g, "").trim();

  for (const t of titleTexts) {
    const s = clean(t.text);
    if (/\d{4}\s*[-—–]\s*\d{4}/.test(s) && /学年|学期/.test(s)) return s;
  }
  for (const t of titleTexts) {
    const s = clean(t.text);
    if (/学年|学期/.test(s)) return s;
  }
  for (const t of titleTexts) {
    const s = clean(t.text);
    if (/课表/.test(s)) return s;
  }
  for (const t of titleTexts) {
    const s = clean(t.text);
    if (/学号|打印时间|^[\d\-.]+$/.test(s)) continue;
    if (s.length >= 2) return s;
  }
  return "";
}

/**
 * 判断某段文字是不是「课程名行」（一个课程块的起点候选）。
 *
 * 难点：教务 PDF 会把一格的详情切成很多碎片，后面几段都是详情碎片。
 * 旧实现只排除「含 场地|教师|教学班」的整段，而碎片往往被切在关键字中间
 * （如「地:5803…」「成:中医定向…」），于是被当成新的课程名 →
 * 一门课被拆成十几条假记录（实测高毅多出 40 条）。
 */
export function isCourseNameLine(text: string): boolean {
  if (!text) return false;
  if (SECTION_RE.test(text)) return false;
  if (/^\s*[/:：]/.test(text)) return false;
  if (COURSE_NAME_BAD_RE.test(text)) return false;
  if (/^[★☆◇\s]+$/.test(text)) return false;

  if (/^[^：:]{0,6}[：:]/.test(text)) return false;
  if (/学时|学分|考核|备注|周学时|选课/.test(text)) return false;
  if (/\/[^/]{0,4}[：:]/.test(text)) return false;
  if (/^\(\d+\s*-\s*\d+\s*节\)/.test(text)) return false;
  if (/^[\d\s.,%\-–—]+$/.test(text)) return false;
  if (/^[（(]/.test(text) && /[)）]?\s*[\/:：]/.test(text)) return false;
  if (/教学班组成|定向\d{4}|护理\d{4}|中西医\d{4}/.test(text)) return false;
  if (/^\d{4}-\d{4}-\d\)/.test(text)) return false;
  if (text.length < 2) return false;

  return true;
}

export type CellParseResult = {
  courseName: string;
  startSection: number;
  endSection: number;
  weeks: string;
  parity: string;
  room: string;
  teacher: string;
  sectionFromDetail: boolean;
};

/** 把一个课程块的拼接文本解析成结构化字段 */
export function parseCell(blob: string): CellParseResult {
  const m = SECTION_RE.exec(blob);
  let name = blob;
  let start = 0;
  let end = 0;
  let sectionFromDetail = false;
  if (m) {
    start = parseInt(m[1] || m[3], 10);
    end = parseInt(m[2] || m[3], 10);
    name = blob.slice(0, m.index);
    sectionFromDetail = true;
  }
  name = name.replace(/[★☆◇■◆□]+$/g, "").replace(/^[\s/:：]+/, "").trim();

  /*
   * 周次提取。旧实现在整个 blob 上跑 `\)\s*([\d\-,周]+?)\s*\/`，而 blob 开头是
   * 课程名 + 课程号（如 `中医基础理论★2027-1)-130008-01/教学班组(1-2节)…`），
   * 课程号里的 `)` 会先被命中 → weeks 变成 `-130008-01`。
   * 现在从 `(N-M节)` 之后开始找 —— 那里才是 `周次/校区:场地:…` 详情区。
   */
  const detail = m ? blob.slice(m.index + m[0].length) : blob;
  const weeksExec = WEEKS_RE.exec(detail) || WEEKS_RE.exec(blob);
  const weeks = weeksExec ? weeksExec[1] : "";

  /*
   * 单双周标记。优先取 WEEKS_RE 的第 2 组（`11-13周(单)` 这种紧邻形态）；
   * 若没贴着周次串，再在 detail 区单独找一次 `(单)`/`(双)`。
   */
  let parity = "";
  if (weeksExec && weeksExec[2]) parity = weeksExec[2];
  else if (weeks) {
    const pm = PARITY_RE.exec(detail) || PARITY_RE.exec(blob);
    if (pm) parity = pm[1];
  }

  // 用字段切分代替裸正则，避免值被抖动碎片污染
  const fields = splitFields(detail);
  const room = cleanFieldValue(fields["场地"], "room");
  const teacher = cleanFieldValue(fields["教师"], "teacher");

  return {
    courseName: name,
    startSection: Math.min(12, Math.max(1, start || 1)),
    endSection: Math.min(12, Math.max(start || 1, end || start || 1)),
    weeks: weeks || "",
    parity: parity || "",
    room: room || "",
    teacher: teacher || "",
    sectionFromDetail,
  };
}
