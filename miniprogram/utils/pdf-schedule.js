/**
 * 课表 PDF 解析（纯算法，不依赖任何外部 API / OCR）
 *
 * 适用对象：教务系统导出的「文本型」课表 PDF —— 页面由文字绘制指令（Tj）和表格线（re S）
 * 构成，不带位图。这类 PDF 可以直接读出文字与坐标，不需要图像识别。
 * 若 PDF 是扫描件（整页是一张图片，只有 /Image 没有 Tj），本模块会明确报错，
 * 因为纯算法无法处理，需要 OCR，而 OCR 必须依赖外部服务。
 *
 * 解析思路（与 Word/Excel 版不同，PDF 没有「表格模型」，只有坐标）：
 *   1) 解压内容流（FlateDecode → zlib），拿到 PDF 绘制指令文本；
 *   2) 抓出所有 `1 0 0 1 x y Tm ... (字符串) Tj`，即「文本 + 坐标」；
 *   3) 解 PDF 字符串转义，并把双字节编码解成 UTF-16BE（教务 PDF 常见做法）；
 *   4) 用表头「星期一..星期日」的文字 x 定列，用左侧「1..12」的 y 定行；
 *   5) 以「课程名行」为每门课的起点切分文字段，再正则提取节次/周次/教师/教室。
 *
 * 依赖：只用到小程序基础库自带的 ArrayBuffer/Uint8Array；zlib 解压用内置的
 *       miniz 实现（见 inflate.js），因为小程序没有 node 的 zlib。
 */

const { inflateRaw, inflate } = require("./inflate");

const WEEKDAY_NAMES = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
const SECTION_RE = /\((\d+)\s*-\s*(\d+)\s*节\)|\((\d+)\s*节\)/;
/*
 * ⚠️ 详情行判定专用正则：必须容忍「节次横跨两个碎片」。
 *
 * 实测陈亚楠周1 的详情碎片是：
 *   x=288.5  "(11-12节)3-5周,9-10周,12周"
 *   x=291.0  "(7-8节)3-5周,9-17周/校区:南"
 * 但同页面其它位置会出现被切成两半的写法，例如
 *   "(11-" + "12节)…"  或者  "(11-12节)3-5周" 前带空格。
 * 旧写法把 `\(` 写在正则里并直接用 exec().index<=2 判定，
 * 只要碎片以 `(` 开头就成立；一旦详情碎片因拼接顺序抖动
 * 变成以空白或别的字符开头，index 判断题就会静默失败 ——
 * 表现就是 detailIdx=[]，星全成了「无详情孤儿」。
 *
 * 因此这里放宽为：**只要在文本前段出现 «数字-数字节» 或 «数字节»**，
 * 就认定为详情行（不再强制要求前导左括号）。
 */
const DETAIL_SECTION_RE = /(\d{1,2})\s*[-–—~]\s*(\d{1,2})\s*节|(?<![\d-])(\d{1,2})\s*节(?![\d-])/;
/*
 * 周次：形如 `3-5周,9-19周` / `3周` / `4-5周,9-18周`，
 * 后面可能紧跟 `(单)` 或 `(双)` —— 例：`11-13周(单)`。
 * 直接匹配「数字周次串」，不再依赖前导 `)` —— 实测 detail 区以周次开头。
 *
 * ⚠️ `(单)`/`(双)` 必须**单独捕获**：旧正则只取数字部分，
 * 把单双周标记直接丢掉了，而下游课表逻辑是支持单双周的 —— 上游丢信息，
 * 下游无法恢复。实测 `11-13周(单)` 曾被解析成 `11-13周`（见 parity 字段）。
 */
const WEEKS_RE = /(\d+(?:\s*-\s*\d+)?\s*周(?:[,,]\s*\d+(?:\s*-\s*\d+)?\s*周)*)\s*(?:[(（]\s*(单|双)\s*周?\s*[)）])?/;
/* 单独再抓一次单双周标记（周次串后面可能隔着斜杠/其它内容） */
const PARITY_RE = /[(（]\s*(单|双)\s*周?\s*[)）]/;
const COURSE_NAME_BAD_RE = /场地|教师|教学班/;

/*
 * 详情字段提取 —— 不能再用「冒号后吃到斜杠」的裸正则。
 *
 * 实测数据里同一行的文字被按字符块切碎成多条 Tj，拼接后会出现：
 *   ...教师:张川,华永兰时:32/学分:2.0/...
 *   ...教师:张:2.0川,华永兰/场地:操场/...
 *   ...教师:黄鹤师:霍丁鹏/场地:5501/...
 * 也就是说**下一个字段名会插进上一个字段值的中间**（碎片顺序抖动导致）。
 * 裸正则要么吃进 `时:32`，要么把值切成 `黄鹤`。
 *
 * 对策：先把整个 blob 按「已知字段名 + 冒号」切成有序的 {key, value}，
 * 值只取到下一个字段名出现之前，借此天然截断抖动碎片。
 */
const FIELD_NAMES = ["场地", "教师", "教学班组成", "教学班", "考核方式", "选课备注", "课程学时", "周学时", "学分", "总学时", "校区", "节次"];
const FIELD_SPLIT_RE = new RegExp(`(${FIELD_NAMES.join("|")})[:：]`, "g");

/**
 * 把拼接后的详情文本切成 { 字段名: 值 }。
 * 值会在遇到下一个字段名时截断，且清掉尾部孤立的冒号残片。
 */
function splitFields(blob) {
  const out = {};
  if (!blob) return out;
  const marks = [];
  FIELD_SPLIT_RE.lastIndex = 0;
  let m;
  while ((m = FIELD_SPLIT_RE.exec(blob)) !== null) marks.push({ key: m[1], start: m.index, valueStart: m.index + m[0].length });
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
function cleanFieldValue(value, kind) {
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
  // 例：`张川,华永兰时:32` → 先删 `时:32`；`张:2.0川` → 删 `:2.0`
  s = s.replace(/[时分区班核注学][:：]?\s*[\d.]+/g, "");
  s = s.replace(/(学时|学分|考核|备注|周学时|总学时)[:：]?[\d.]*/g, "");
  if (kind === "teacher") {
    /*
     * 教师值尾部常粘连被切碎的字段名残片，实测形态：
     *   `石馨心学班组成`  ← `教学班组成:` 被截成 `学班组成`
     *   `史旋100319-05`   ← 课程号残片
     *   `张川,华永兰时`   ← `学时:32` 的 `时`
     * 统一在字段名残片上截断（取最早出现的位置）。
     * 注意要同时列「完整词」和「被切掉头部的残片」，实测残片更常见。
     */
    const raw = s.replace(/[\s/]+/g, "");
    /*
     * 教师值尾部粘连的字段名残片，实测形态（前 4 条来自真实 PDF）：
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
      /学班组成/, /教学班组成/, /教学班组/, /教学班/,
      /考核方式/, /核方式/, /式(?=[:：])/, /式$/,
      /选课备注/, /课备注/, /备注(?=[:：])/,
      /课程学时/, /程学时/, /周学时/, /总学时/, /学时/, /学分(?=[:：])/, /学分$/,
      /场地/, /校区/,
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
     * 尾部孤立的字段名单字残片。
     * 实测 `教师:黄鹤师`（后接 `师:霍丁鹏` 的残片）→ 需要把尾巴的 `师` 切掉。
     * 因此这个字符集必须覆盖所有字段名的单字：教师场地校区学分时周…
     * 注意只切「位于结尾」的连续残片，且要求前面已有足量内容（≥2 字），
     * 避免把「王」「李」这类真实单字姓也一起吃掉。
     */
    s = s.replace(/[教师场地校区学分时段周总考核备注选课教学班组核注组成]+$/, (tail) =>
      s.length - tail.length >= 2 ? "" : tail
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

/**
 * 把「内容流坐标」换算成「阅读方向坐标」。
 *
 * ⚠️ 实测结论（很重要）：教务系统导出的课表虽然带 `/Rotate 90`，
 * 但**内容流里的坐标本来就是按阅读方向绘制的** —— x 递增 = 星期从左到右，
 * y 递减 = 节次从上到下。`/Rotate` 只是让 PDF 阅读器在竖版纸面上把横表
 * 转过来显示，**不影响内容流的坐标语义**。
 *
 * 实测数据（郭亦菲课表，未做任何旋转换算）：
 *   x=104.1 y=505.5  中医基础理论★        ← 星期一、第 1 行
 *   x=104.1 y=493.5  (1-2节)3-5周,...     ← 同一格的详情，y 递减
 *   x=415.6 y=505.5  人体解剖学（一）★     ← 星期三、第 1 行
 * 表头「星期一..星期日」x=133→756 递增、y=521 恒定 → 列方向就是 x。
 *
 * 如果按 `/Rotate 90` 去换算，x/y 互换后详情会跑到课程名**上面**，
 * 切片顺序颠倒，反而解析失败。所以这里**恒等返回**。
 *
 * 保留本函数是为了：万一某些模板确实需要换算（内容按竖版坐标系绘制），
 * 可以在此按 rotation 分支处理，而不必改动调用方。
 */
function rotatePoint(x, y, rotation, pageW, pageH) {
  // 目前所有实测模板都不需要换算，rotation 仅作为诊断信息保留
  return { x, y };
}

/* ==========================================================================
 * 应用内容流里的 `cm` 变换（**v5 的核心修正**）
 * ==========================================================================
 *
 * 走过的弯路（务必先读，不要再回退）：
 *
 * v4 以为「`re` 矩形和 `Tm` 文字同处一个坐标系，直接做几何判定即可」，
 * 实测**对不上**：郭亦菲周2 的矩形 `202.92 529 103.85 50 re` 划出 y∈[529,579]，
 * 但该格自己的详情 `(7-8节)3-5周,9-16周/...` 在 y=538.5 —— 名义上在框内，
 * 归组结果却只收到 2 片文字（y=555.0 / y=550.5），详情整条漂走。
 *
 * 根因：内容流的**第一条指令**就是 `0 1 -1 0 595 0 cm`（三份 PDF 都是），
 * 它是 90° 旋转 + 平移的坐标系变换。`cm` 会 concat 到 CTM：
 * 因为它在流开头、CTM 初值为单位阵，所以此后**所有** `re` 与 `Tm`
 * 都工作在「旋转后的用户空间」，要靠这个矩阵才能还原到设备（阅读）空间。
 *
 * 实测三份 PDF 的 cm 完全一致，且变换后几何**高度自洽**（见下），
 * 所以这里直接应用矩阵，而不是像 rotatePoint 那样恒等返回。
 *
 * ---------------------------------------------------------------------------
 * 变换后的几何长什么样（这是理解整个表格结构的钥匙）
 * ---------------------------------------------------------------------------
 *
 * PDF 矩阵 [a b c d e f] 作用于点：x' = a·x + c·y + e,  y' = b·x + d·y + f
 * 代入 [0 1 -1 0 595 0]：  x' = 595 - y,  y' = x
 *
 * 于是：
 *   · **x' = 星期方向**。表头「星期一…星期日」变换后 x'≈74 一致，
 *     y' = 133 / 237 / 341 / 445 / 548 / 652 / 756 —— 星期是**行**。
 *   · **y' = 节次方向**。节次编号 1..12 变换后 y'≈78 一致（在表格上方），
 *     x' 就是它们在节次轴上的位置。
 *
 * 也就是说：**原 PDF 是「横版课表被塞进竖版页面」，整张表旋转了 90°。**
 * 三份 PDF 变换后的星期行边界完全相同：
 *     周一 y'∈[ 99.1, 202.9]   周二 [202.9, 306.8]   ……   周日 [722.1, 826.0]
 * 行高统一 ≈103.85，[62.7, 99.1] 是节次编号行，[16, 62.7] 是周次/日期行。
 *
 * 这就是为什么 v4「矩形包含判定」必然失败 —— 在原空间里，
 * `re` 画的是「横跨 7 天的整行条」，把矩形当单元格用是概念性错误。
 */
const CM_IDENTITY = [1, 0, 0, 1, 0, 0];

/**
 * 从内容流里取 `cm` 矩阵。取**第一条**（= 流开头那条全局变换）。
 * 三条以上时只认前三条完全一致的场景（实测如此）；不一致返回单位阵，
 * 让下游退化为「不做变换」，至少不比 v4 更差。
 */
function readContentMatrix(content) {
  if (!content) return CM_IDENTITY.slice();
  const re = /((?:-?[\d.]+\s+){6})cm\b/g;
  const found = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const n = m[1].trim().split(/\s+/).map(Number);
    if (n.length === 6 && !n.some((v) => Number.isNaN(v))) found.push(n);
  }
  if (!found.length) return CM_IDENTITY.slice();
  const first = found[0];
  // 允许后续出现的是重复的同一矩阵（实测 3 条全同）；出现不同的就退化
  const allSame = found.every((n) => n.every((v, i) => Math.abs(v - first[i]) < 1e-6));
  if (!allSame) return CM_IDENTITY.slice();
  return first;
}

/** 用 cm 矩阵变换一个点：x' = a·x + c·y + e, y' = b·x + d·y + f */
function applyMatrix(x, y, m) {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

/** 用 cm 矩阵变换一个矩形（四角映射后取包围盒） */
function applyMatrixToRect(r, m) {
  const pts = [
    applyMatrix(r.x, r.y, m),
    applyMatrix(r.x + r.w, r.y, m),
    applyMatrix(r.x, r.y + r.h, m),
    applyMatrix(r.x + r.w, r.y + r.h, m),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min.apply(null, xs);
  const x1 = Math.max.apply(null, xs);
  const y0 = Math.min.apply(null, ys);
  const y1 = Math.max.apply(null, ys);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, top: y1, right: x1, area: (x1 - x0) * (y1 - y0) };
}

/**
 * 读取页面对象的 /Rotate 值（0 / 90 / 180 / 270）。
 *
 * 仅用于诊断/日志（例如将来 UI 提示「此课表为横版」），
 * **不参与坐标换算** —— 原因见 rotatePoint 的注释。
 */
function readPageRotation(bytes) {
  const latin1 = bytesToLatin1(bytes);
  const re = /\/Rotate\s+(-?\d+)/g;
  let m;
  while ((m = re.exec(latin1)) !== null) {
    const v = parseInt(m[1], 10);
    if (v !== 90 && v !== 180 && v !== 270) continue;
    const around = latin1.slice(Math.max(0, m.index - 400), m.index + 400);
    if (/\/Contents\b/.test(around) && /\/Type\s*\/Page(?!s)/.test(around)) {
      return v;
    }
  }
  return 0;
}

/** 从 PDF 里读 MediaBox（取第一个），拿不到就用 A4 竖版默认值 */
function readMediaBox(bytes) {
  const latin1 = bytesToLatin1(bytes);
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(latin1);
  if (m) {
    const x0 = parseFloat(m[1]);
    const y0 = parseFloat(m[2]);
    const x1 = parseFloat(m[3]);
    const y1 = parseFloat(m[4]);
    if (x1 > x0 && y1 > y0) return { w: x1 - x0, h: y1 - y0 };
  }
  return { w: 595, h: 842 };
}

/** 把 latin1 字符串（每字符 0-255）还原成字节数组 */
function toBytes(latin1) {
  const out = new Uint8Array(latin1.length);
  for (let i = 0; i < latin1.length; i += 1) {
    out[i] = latin1.charCodeAt(i) & 0xff;
  }
  return out;
}

function bytesToLatin1(bytes) {
  let s = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return s;
}

/**
 * 从 PDF 字节流里取出解压后的内容流文本。
 *
 * 关键：一份课表的内容**常常分散在多条 stream 里**（实测某教务系统把
 * 表头放在 stream 0、正文放在 stream 1、页脚放在 stream 2）。
 * 旧实现「取最大的那条」，导致拿不到表头 → 报「没识别到星期表头」。
 * 因此这里把所有可解压的 FlateDecode 流**按出现顺序全部拼接**。
 */
function extractContentStream(bytes) {
  const latin1 = bytesToLatin1(bytes);

  // 定位所有 `... /Filter /FlateDecode ... stream\r?\n`
  const parts = [];
  const headRe = /<<(?:[^<>]|<[^<>]*>)*?\/Filter\s*\/FlateDecode(?:[^<>]|<[^<>]*>)*?>>\s*stream\r?\n/g;
  let m;
  while ((m = headRe.exec(latin1)) !== null) {
    const start = m.index + m[0].length;
    const end = latin1.indexOf("endstream", start);
    if (end < 0) continue;
    let raw = latin1.slice(start, end);
    // 去掉结尾可能多出的换行
    raw = raw.replace(/\r?\n$/, "");
    parts.push(raw);
  }

  // 逐条解压并拼接；解不开的（字体文件、图片等）跳过
  const chunks = [];
  for (const raw of parts) {
    const inflated = inflate(toBytes(raw));
    if (!inflated || !inflated.length) continue;
    const text = bytesToLatin1(inflated);
    // 只保留页面内容流：必须带文本绘制指令
    if (text.indexOf("Tj") < 0) continue;
    chunks.push(text);
  }
  if (!chunks.length) throw new Error("这个 PDF 里没有可解析的文字层（可能是扫描件/图片版）");
  // 用换行分隔，避免两条流首尾粘连
  return chunks.join("\n");
}

/**
 * 从内容流里抓出全部矩形绘制指令（`x y w h re`）。
 *
 * ⚠️ 返回的是**变换前**的原始坐标。请务必先过 `applyMatrixToRect` 再用几何判定 ——
 * 直接拿它当单元格用是 v4 失败的原因，详见 `readContentMatrix` 的长注释。
 *
 * 变换后这些矩形是「横跨若干天的行条 / 列条」，**不是**单个单元格。
 * 它们现在的价值是：给出精确的**星期行边界**（不信任时可用表头 y 兜底）。
 */
function extractRects(content) {
  if (!content) return [];
  const rects = [];
  const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re\b/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const x = parseFloat(m[1]);
    const y = parseFloat(m[2]);
    const w = parseFloat(m[3]);
    const h = parseFloat(m[4]);
    // 忽略零面积（有些实现用它画点/线）
    if (!(w > 0) || !(h > 0)) continue;
    rects.push({ x, y, w, h, top: y + h, right: x + w, area: w * h });
  }
  return rects;
}

/**
 * 推导**星期行**的 y 区间 —— v5 里「星期几」的唯一判定依据。
 *
 * 优先用表头「星期一…星期日」的 y（每行中心），行高取相邻表头 y 的间距；
 * 缺失表头时退回「矩形 y 边界聚类」（变换后矩形边界正好落在行边界上）。
 *
 * 返回 `[{ weekday, y0, y1, center }]`，按 weekday 升序（周一在前）。
 * 判行用「文字 y 落在 [y0-margin, y1+margin]」——
 * margin 默认取行高的 12%：实测文字**基线**会略微超出格子边框
 * （表头「星期一」y=133 而行为 [99.1,202.9]，安全；但部分详情行会贴边）。
 */
function buildWeekdayRows(texts, matrix) {
  const headerYs = {};
  texts.forEach((t) => {
    /*
     * ⚠️ 必须先判星期、再判 isTitleText —— 顺序反了就永远取不到表头。
     * isTitleText 把「星期一..星期日」也归为标题（正文解析时确实要排除它们），
     * 但这里恰恰要靠它们定行。**这个顺序 bug 真实发生过**（rows 恒为 0）。
     */
    const i = WEEKDAY_NAMES.indexOf(t.text);
    if (i < 0) return;
    const p = applyMatrix(t.x, t.y, matrix);
    // 同一天取最靠上的那次（避免碎片重复）
    if (headerYs[i + 1] === undefined || p.y > headerYs[i + 1]) headerYs[i + 1] = p.y;
  });

  const present = Object.keys(headerYs).map(Number).sort((a, b) => a - b);
  if (present.length >= 3) {
    // 相邻表头 y 间距 = 行高（同一模板固定），用中位数抗抖动
    const gaps = [];
    for (let i = 1; i < present.length; i += 1) {
      gaps.push((headerYs[present[i]] - headerYs[present[i - 1]]) / (present[i] - present[i - 1]));
    }
    const rowH = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const rows = [];
    for (let wd = 1; wd <= 7; wd += 1) {
      if (headerYs[wd] === undefined) continue;
      rows.push({
        weekday: wd,
        y0: headerYs[wd] - rowH / 2,
        y1: headerYs[wd] + rowH / 2,
        center: headerYs[wd],
        rowH,
      });
    }
    return rows;
  }
  return [];
}

/**
 * 表头缺失时的兜底：用**变换后矩形**的 y 边界聚类出星期行。
 *
 * 原理：变换后的 `re` 边界正好落在行边界上。实测三份 PDF 的 y 边界簇为
 *   16 / 62.7 / 99.1 / 202.9 / 306.8 / 410.6 / 514.5 / 618.3 / 722.1
 * 其中 [99.1,202.9] 起连续 7 条等距边界（间距 ≈103.85）就是 7 个星期行。
 *
 * 做法：把所有矩形的 y / top 收集起来聚类（1.5pt 容差），
 * 找「连续 8 个等距边界」的那一段。
 */
function buildWeekdayRowsFromRects(rectsDev) {
  if (!rectsDev || rectsDev.length < 8) return [];
  const vals = [];
  rectsDev.forEach((r) => {
    vals.push(r.y);
    vals.push(r.top);
  });
  vals.sort((a, b) => a - b);

  // 聚类
  const edges = [];
  vals.forEach((v) => {
    if (!edges.length || v - edges[edges.length - 1] > 1.5) edges.push(v);
  });
  if (edges.length < 8) return [];

  // 找连续 8 个「间距近似相等」的边界（抗抖动：间距极差 < 2pt）
  for (let i = 0; i + 7 < edges.length; i += 1) {
    const seg = edges.slice(i, i + 8);
    let minGap = Infinity;
    let maxGap = 0;
    for (let k = 1; k < seg.length; k += 1) {
      const g = seg[k] - seg[k - 1];
      if (g < minGap) minGap = g;
      if (g > maxGap) maxGap = g;
    }
    // 行高在 60~160pt 之间才可能是星期行；间距足够均匀才认
    if (minGap < 60 || maxGap > 160) continue;
    if (maxGap - minGap > 2) continue;
    const rowH = (seg[7] - seg[0]) / 7;
    const rows = [];
    for (let wd = 1; wd <= 7; wd += 1) {
      rows.push({
        weekday: wd,
        y0: seg[wd - 1],
        y1: seg[wd],
        center: (seg[wd - 1] + seg[wd]) / 2,
        rowH,
      });
    }
    return rows;
  }
  return [];
}

/**
 * 把文字按「星期行」分桶。
 *
 * 关键：**只用 y 判星期，不再用 x**。
 * v3/v4 用 x 判星期（`locateColumn`）在旋转模板下必然错；
 * v5 里 x 是**节次方向**，节次直接从详情的 `(N-M节)` 读，不需要 x 做任何判定。
 *
 * 落在所有行之外的文字（标题、页脚、图例）归入 unassigned，**不静默丢弃**，
 * 由调用方决定是否兜底 —— 宁可报错也不要悄悄漏课。
 */
function bucketByWeekday(texts, rows, matrix) {
  const buckets = {};
  const unassigned = [];
  if (!rows.length) return { buckets, unassigned: texts.slice() };

  /*
   * ⚠️ 容差必须**很小**（2pt），不能用「行高 × 12%」。
   *
   * 踩过的坑：用 12%（≈12.5pt）时，**节次编号行**会漏进每个星期行。
   * 实测节次编号（`1`..`12`）与 `节次` 标签的 device y = 75.4 / 78.1 / 68.9，
   * 而 周1 的行带是 [81.1, 184.9] —— 只差 3pt 就漏进来了。
   * 漏进来之后它们会被拼进课程 blob，把课程名和详情搅乱
   * （实测症状：`节次` 字符串污染教师字段、`x=28 (3-4节)…` 变成孤片）。
   *
   * 真正的内容文字离行边界有 20pt 以上余量（实测内容在 y=104.1，行带下界 81.1），
   * 所以 2pt 容差足够，且能把编号行干净地挡在外面。
   */
  const margin = 2;

  /*
   * ⚠️ 必须保留 `drawOrder`（原始绘制顺序）。
   *
   * 这是 v5 最关键的发现：**课程分块不能靠几何（x/y），只能靠绘制顺序。**
   *
   * 实测高毅周1，两门课（孤儿A 与 孤儿B）的碎片坐标**完全相同**
   * （都是 x=28/40/52/64…、y=104.080 逐对重合），x 排序无法区分：
   *     #108 x=28.0 "(3-4节)9-12周/校区:南校区"      ← A 的第 1 行
   *     #193 x=28.0 "试/选课备注:/课程学时组成"      ← B 的第 1 行
   * 但**绘制顺序是分课连续的**：一门课的整块先画完，再画下一门课。
   * 实测三份 PDF 的绘制顺序都是「按课程成组」：
   *     高毅周1： #14-22=中医基础理论  #70-78=医古文 #79-87=医古文
   *              #88=医古文(只剩星)  #108-115=孤儿A  #116-124=医古文
   *              #150-158=大学体育  #159-164=大学体育  #193-195=孤儿B
   *     陈亚楠周1：#139-147=思想道德与法治  #224-233=大学生心理健康教育
   *     陈亚楠周2：10 个干净的组，含 2 个孤儿组
   * 所以只要「按绘制顺序遍历、遇到 ★ 就开新块」，分块就是精确的。
   */
  texts.forEach((t, order) => {
    const p = applyMatrix(t.x, t.y, matrix);
    let hit = null;
    for (const r of rows) {
      if (p.y >= r.y0 - margin && p.y <= r.y1 + margin) {
        hit = r;
        break;
      }
    }
    if (!hit) {
      unassigned.push({ x: p.x, y: p.y, text: t.text, drawOrder: order });
      return;
    }
    (buckets[hit.weekday] = buckets[hit.weekday] || []).push({
      x: p.x,
      y: p.y,
      text: t.text,
      drawOrder: order,
    });
  });

  return { buckets, unassigned };
}

/**
 * 在**一个星期行内**把文字切成课程块 —— v5 分块算法（绘制顺序模型）。
 *
 * ============================================================================
 * 核心事实：分块只能靠「绘制顺序」，不能靠几何
 * ============================================================================
 *
 * 变换到设备空间后，一周之内有很多门课。它们的碎片**几何上可能完全重合**：
 *
 * 实测高毅周1（两门课的星都被裁切，只剩详情）：
 *     #108  x=28.0  y=104.080  "(3-4节)9-12周/校区:南校区"   ← 课 A 第 1 行
 *     #193  x=28.0  y=104.080  "试/选课备注:/课程学时组成"   ← 课 B 第 1 行
 * x、y 一模一样，任何「按坐标聚类 / 按网格归属」的办法都无法区分它们。
 *
 * 但**内容流里的绘制顺序是按课程成组的**：一门课的整块画完，才画下一门课。
 * 实测三份 PDF 完全符合：
 *     高毅周1  ：#14-22 中医基础理论 | #70-78 医古文 | #79-87 医古文
 *                #88 医古文(只剩星)  | #108-115 孤儿A | #116-124 医古文
 *                #150-158 大学体育   | #159-164 大学体育 | #193-195 孤儿B
 *     陈亚楠周1：#139-147 思想道德与法治 | #224-233 大学生心理健康教育
 *     陈亚楠周2：10 个连续组（含 2 个孤儿组），每组恰好一门课
 *     陈亚楠周3：#14-22 大学英语 | #61-69 中医护理学导论 | …
 *
 * 因此算法退化成最朴素的一行逻辑：
 *
 *     按 drawOrder 遍历本周碎片；遇到「课名行（以 ★/☆ 等结尾）」就开新块；
 *     其余碎片归入当前块。开块之前出现的碎片（课名被裁切）归入「孤儿块」。
 *
 * 唯一的额外步骤：课名过长被排版切成「前半段(无★)+后半段(带★)」时先合并两片，
 * 否则会漏掉整个课程（详见下方 `isNameOnly` 处的实测记录）。
 *
 * ---------------------------------------------------------------------------
 * 为什么 x 排序 + 配对/网格都失败（保留教训，勿回退）
 * ---------------------------------------------------------------------------
 * v4/v5 前几版都在试图用**几何**解决分块，全部失败：
 *   · 「按 x 排序 → 课名到下一个课名」：陈亚楠周1 两个 ★ 紧挨（276.5/279.0），
 *     首个块只有星没详情 → 幽灵记录 1-1 节；第二个块吞掉两个详情。
 *   · 「详情按 x 排序、与星序号一对一」：要求星与详情数量相等且顺序一致，
 *     两端被裁切（孤儿）时会全体错位一格。
 *   · 「每门课一条 12pt 行网格，碎片归给最贴合的网格」：几何重合时无解，
 *     且多个星的网格同余会互相抢行（91.5 被 55.5 抢走、384.5 被 276.5 抢走）。
 * 这三版都提升过一部分指标，但都无法同时通过三份 PDF，根因就是**忽略了
 * 绘制顺序这个天然的一维序**。现在只用它。
 *
 * 返回 `Text[][]`，每块已把课名行提到首位；孤儿块排在最后（课名会空，
 * 但节次/周次/教室/教师都在，不能丢 —— 丢了就是漏课）。
 */
function splitBlocksInRow(items) {
  if (!items.length) return [];

  // 按绘制顺序排。drawOrder 缺失（老调用点/测试直接构造）时退化为稳定排序，
  // 用「数组原序」当 drawOrder，保证不引入随机性。
  const sorted = items
    .map((t, i) => ({ t, d: Number.isFinite(t.drawOrder) ? t.drawOrder : i }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.t);

  const STAR_TAIL_RE = /[★☆■◆□◇]\s*$/;
  const isStarLine = (t) => !isTitleText(t.text) && STAR_TAIL_RE.test(t.text);

  /*
   * ---------------------------------------------------------------------------
   * ★ 位置修正：课名被排版切成两片时，「前半段」不带 ★
   * ---------------------------------------------------------------------------
   * 假设「课名行一定以 ★ 结尾」在课名较长时会失效 —— 排版会把课名切成两片：
   *     「前半段（无★）」+「后半段（带★）」
   *
   * 实测 李亦然周1：
   *     #85 x=464    "针灸推拿国际创新与实"   ← 课名前半段，**不带 ★**
   *     #86 x=477.5  "践☆"                   ← 课名后半段 + ★
   *     #87 x=489.5  "(7-8节)3-5周,9-17周/…"  ← 详情
   * 不处理的话：#85 被并进上一门课（大学英语）污染它，而 #86 单独开块，
   * 课名只剩一个字「践」→ 被 `courseName.length < 2` 丢掉。
   * **净效果是整整漏掉一门课**（李亦然课表 13 门变 12 门）。
   *
   * 修法：分块之前先合并「纯名字片 + 紧随其后的带★片」。
   * 判据用**内容**（不含数字/冒号/节/周）而不是坐标 —— 坐标在这里依旧不可靠，
   * 上面两片的 x 相差 13.5，与「课名→详情」的常规步长 12 很接近，无法区分。
   */
  const isNameOnly = (t) => {
    const s = (t && t.text) || "";
    if (isTitleText(s)) return false;
    if (!/[\u4e00-\u9fa5]/.test(s)) return false; // 必须含中文
    if (s.length < 2) return false;
    if (/\d/.test(s)) return false; // 详情行一定含数字（节次/周次/班级号）
    if (/[：:]/.test(s)) return false; // 详情行有 `场地:` / `教师:`
    if (/[节周]/.test(s)) return false; // `3-4节` / `5周`
    return true;
  };

  const ordered = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const t = sorted[i];
    const next = sorted[i + 1];
    if (next && isNameOnly(t) && isStarLine(next)) {
      // 合并后以带 ★ 那片的 drawOrder 为准（它更接近整行的位置）
      ordered.push({
        x: next.x,
        y: next.y,
        text: t.text + next.text,
        drawOrder: next.drawOrder,
      });
      i += 1; // 跳过已被合并的带 ★ 片
      continue;
    }
    ordered.push(t);
  }

  const blocks = [];
  let current = null;
  const orphans = [];

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
   * 仅当某块因为拼接顺序抖动而出现「详情行跑到课名行前面」时，把课名行提到首位。
   */
  const normalized = blocks.map((g) => {
    const starAt = g.findIndex((t) => isStarLine(t));
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
      const starAt = orphans.findIndex((t) => isStarLine(t));
      const rest =
        starAt >= 0
          ? [orphans[starAt]].concat(orphans.slice(0, starAt), orphans.slice(starAt + 1))
          : orphans;
      normalized.push(rest);
    }
  }

  return normalized;
}


/** 解 PDF 字符串字面量的转义，并按 UTF-16BE 解码（回退 GBK→latin1） */
function decodePdfString(literal) {
  const out = [];
  for (let i = 0; i < literal.length; i += 1) {
    const c = literal[i];
    if (c === "\\" && i + 1 < literal.length) {
      const n = literal[i + 1];
      const simple = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
      if (Object.prototype.hasOwnProperty.call(simple, n)) {
        out.push(simple[n]);
        i += 1;
        continue;
      }
      if (n >= "0" && n <= "7") {
        let digits = "";
        let j = i + 1;
        while (j < literal.length && digits.length < 3 && literal[j] >= "0" && literal[j] <= "7") {
          digits += literal[j];
          j += 1;
        }
        out.push(parseInt(digits, 8) & 0xff);
        i = j - 1;
        continue;
      }
      out.push(n.charCodeAt(0) & 0xff);
      i += 1;
      continue;
    }
    out.push(c.charCodeAt(0) & 0xff);
  }

  const bytes = new Uint8Array(out);
  if (bytes.length % 2 === 0) {
    let text = "";
    let ok = true;
    for (let i = 0; i < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code === 0xfffd) { ok = false; break; }
      text += String.fromCharCode(code);
    }
    if (ok && text && !/\u0000/.test(text)) return text;
  }
  // 单字节编码的回退：逐字节当作 latin1 处理，常见中文 PDF 不会走到这里
  let fallback = "";
  for (let i = 0; i < bytes.length; i += 1) fallback += String.fromCharCode(bytes[i]);
  return fallback;
}

/** 抓出所有带坐标的文字段 */
function extractTexts(content, rotation, pageW, pageH) {
  // 注意：body 里可能带 2 Tr / 0.3 w 之类的状态设置，但不允许跨过别的 Tj，
  // 所以 body 用「不含 Tj 的任意字符」来限定，避免非贪婪匹配串到下一段。
  //
  // Tm 矩阵不一定是 `1 0 0 1`：部分教务系统会写成旋转/缩放矩阵。
  // 这里放宽成「任意 6 个数」，把 a b c d x y 都抓出来，再按需做坐标换算。
  const re = /((?:[\d.\-]+\s+){6})Tm\s*((?:\/F\d+ [\d.]+ Tf\s*)?)((?:[^T]|T(?!j))*?)Tj/g;
  const texts = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const nums = m[1].trim().split(/\s+/).map(Number);
    if (nums.length !== 6 || nums.some((n) => Number.isNaN(n))) continue;
    const [, , , , tx, ty] = nums;
    const body = m[3];

    // 一个 Tj 前可能有多个 (...) 字面量；全部拼接，不要只取最后一个（会丢字）
    const lits = [];
    const litRe = /\(((?:[^()\\]|\\.)*)\)/g;
    let lm;
    while ((lm = litRe.exec(body)) !== null) lits.push(lm[1]);
    if (!lits.length) continue;

    let text = "";
    for (const lit of lits) text += decodePdfString(lit);
    text = text.trim();
    if (!text) continue;

    // 统一到「阅读方向」坐标：x = 星期方向，y = 节次方向（越大越靠上）
    const p = rotatePoint(tx, ty, rotation, pageW, pageH);
    texts.push({ x: p.x, y: p.y, text });
  }
  return texts;
}

/** 表头文字 x - 单元格左边界，得到列内边距（同一模板固定） */
const COL_PADDING = 33.92;

/**
 * 标题区特征：这些文字出现在表格上方，绝不能参与课表解析。
 *
 * ⚠️ 关键教训（曾造成三份 PDF 共 10 门课静默丢失）：
 * 旧实现用 `t.y < headerY` 划分正文区，把表头 y 当成正文上界 —— **这是错的**。
 * 教务 PDF 里表格第一行（节次 1-2）的**完整课程块**（课名 + 详情 + 场地教师）
 * 是画在表头线**上方**的，实测：
 *   郭亦菲 y=550.5 「大学体育（一）★」… 表头 y=521
 *   高毅   y=527.5 「国家安全教育★」…  表头 y=521
 *   陈亚楠 y=539.5 「大学体育（一）★」… 表头 y=521
 * 用 `y < headerY` 过滤后，这些课名行被静默丢弃，只留下它们的详情行，
 * 表现为「某门课整门缺失」（高毅周四第 11-12 节的国家安全教育就是这么丢的）。
 *
 * 正确做法：**列归属完全靠 x 判定**，y 只用来定行，不用来划分区域。
 * 只把「标题文字」排除掉即可 —— 它们有明确特征（学号/课表/学期/打印时间）。
 */
function buildColumns(texts) {
  const header = texts
    .filter((t) => WEEKDAY_NAMES.indexOf(t.text) >= 0)
    .sort((a, b) => a.x - b.x);
  if (header.length < 7) {
    // 兼容「头部被合并成一行/被裁掉」的情况：至少要有 3 个才能推出列宽
    if (header.length < 3) throw new Error("没识别到星期表头，可能不是标准教务课表");
  }
  const headerY = Math.max.apply(null, header.map((t) => t.y));

  // 相邻表头的 x 间距就是列宽（同一模板固定），用中位数抗抖动
  const gaps = [];
  for (let i = 1; i < header.length; i += 1) gaps.push(header[i].x - header[i - 1].x);
  const colWidth = gaps.length
    ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    : 103.85;

  // 用「表头 x - 内边距」反推每列左边界；缺的星期用列宽补齐
  const cols = header.map((t) => ({
    weekday: WEEKDAY_NAMES.indexOf(t.text) + 1,
    left: Math.round((t.x - COL_PADDING) * 100) / 100,
  }));  return { cols, colWidth, headerY };
}

/**
 * 判断一段文字是否属于「表格之外的标题/页眉页脚区」。
 *
 * 用于替代旧的 `t.y < headerY` 区域划分 —— 那个条件会误杀表格第一行的课程块。
 * 标题区的特征很明确，逐条判定：
 *   1) 学号 / 姓名课表 / 学期 / 打印时间 等元信息
 *   2) 装饰符图例（`★: 理论 ☆: 实验 ...`，x 极小、在表格左外侧）
 *   3) 说明性文字（含「课表」「学号」「打印」「学期」「学年」）
 */
function isTitleText(text) {
  if (!text) return true;
  const s = String(text).trim();
  if (!s) return true;
  // 星期表头本身不是课程内容（body 不再按 y 划界后，表头行会进入候选）
  if (WEEKDAY_NAMES.indexOf(s) >= 0) return true;
  if (/学号|打印时间|打印日期|课表|学期|学年/.test(s)) return true;
  // 装饰符图例：`★: 理论 ☆: 实验 ■: 见习 ◆: 讨论 □: 线上 ◇: 实训`
  if (/[★☆◇■◆□]\s*[:：]\s*(理论|实验|见习|讨论|线上|实训)/.test(s)) return true;
  if (/^(理论|实验|见习|讨论|线上|实训)\s*[:：]/.test(s)) return true;
  return false;
}

/**
 * 定位某段文字属于星期几。
 *
 * 旧实现是「取最后一个满足 x >= left - 2 的列」，它在两种情况下都会错：
 *   1) x 落在两列之间的空白（例如课程详情换行后左移到列边缘）→ 落到最左列；
 *   2) x 比第一列左边界还小 → 兜底成「星期一」，于是星期一虚高、其余列缺课。
 *
 * 改成「找 x 最接近的列中心」，并限定最大偏移不超过半个列宽。
 *
 * ⚠️ 边界处理：当 x 恰好落在两列正中（浮点上可能相等）时，必须**偏向右侧列**，
 * 否则会返回 0（无法判断）把文字丢掉。PDF 里文字的 x 是**起点**，按左对齐
 * 排版，因此压在左边界上的文字属于该列，偏向右侧是正确语义。
 */
function locateColumn(x, cols, colWidth) {
  if (!cols.length) return 0;
  const half = colWidth / 2;
  let best = cols[0];
  let bestDist = Infinity;
  for (const c of cols) {
    const center = c.left + half;
    const dist = Math.abs(x - center);
    // 用 <= 且后出现的列优先：等距时取更靠右（更大 weekday）的那列
    if (dist <= bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  // 容差加一点点余量（1e-6 的浮点保护），避免正好卡在边界被判成「无法判断」
  return bestDist <= half + 1e-6 ? best.weekday : 0;
}


/**
 * 清洗课程名：把粘连在名字后面的详情尾巴截掉。
 *
 * 教务 PDF 的碎片切分点没有任何语义，实际会出现
 *   「中医基础理论★2027-1)-130008-01/教学班组」
 *   「大学体育（一）★:80/周学时:6/总学时:80/学分」
 * 这类拼接结果。这里按「详情起始特征」在第一个命中处截断。
 */
function cleanCourseName(name) {
  if (!name) return "";
  let s = String(name).trim();

  // 去掉尾部装饰星号（先去掉，便于后续判断）
  s = s.replace(/[\s]+/g, "");

  // 在最早出现的详情特征处截断
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

  // 去掉尾部的星号/符号/连接符
  s = s.replace(/[★☆◇■◆□+\-—–_\s/、,，.。]+$/g, "").trim();
  // 去掉开头的符号
  s = s.replace(/^[\s/:：、,，.。+\-—–_]+/g, "").trim();
  // 去掉名字里混入的连字符残片（如「医古文医2603」→ 保留；「XX-1)」→ 已在上方截断）
  s = s.replace(/[\s]+/g, "");
  // 结尾若剩下孤立的单字符标点或括号
  s = s.replace(/[（(\[【]+$/g, "").trim();

  // 过短（少于 2 个字）视为无效
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
 * 且随着碎片合并，顺序不保证。旧实现取「y 最大的第一条」，可能拿到学号或残片。
 * 这里优先匹配学期特征，匹配不到再退化为「含『课表』的那条」，最后才取第一条。
 */
function pickSemesterLabel(titleTexts) {
  if (!titleTexts || !titleTexts.length) return "";
  const clean = (s) => String(s || "").replace(/[\s]+/g, "").trim();

  // 1) 含「学年」或「学期」且带年份的，最像学期名
  for (const t of titleTexts) {
    const s = clean(t.text);
    if (/\d{4}\s*[-—–]\s*\d{4}/.test(s) && /学年|学期/.test(s)) return s;
  }
  // 2) 只含「学年/学期」的
  for (const t of titleTexts) {
    const s = clean(t.text);
    if (/学年|学期/.test(s)) return s;
  }
  // 3) 含「课表」的（如「郭亦菲课表」）—— 不如学期名，但比学号好
  for (const t of titleTexts) {
    const s = clean(t.text);
    if (/课表/.test(s)) return s;
  }
  // 4) 最后退化：取第一条，但排除纯学号/日期之类的
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
 * 难点：教务 PDF 会把一格的详情切成很多碎片，例如
 *   大学体育（一）★
 *   (7-8节)3周/校区:南校区/场
 *   地:5803/教师:外聘1,李维强
 *   （外聘5）/教学班:(2026-
 *   2027-1)-130008-01/教学班组
 *   成:中医定向2601/考核方式
 *   :考试/选课备注:/课程学时
 *   组成:理论:32/周学时:2/总学
 *   时:32/学分:1
 * 后面 8 段都是详情碎片。旧实现只排除「含 场地|教师|教学班」的整段，
 * 而碎片往往被切在了关键字中间（如「地:5803…」「成:中医定向…」），
 * 于是被当成新的课程名 → 一门课被拆成十几条假记录（实测高毅多出 40 条）。
 *
 * 这里用一组「详情碎片」特征把它们全部挡掉。
 * 注意这只是**候选**判断，调用方还会再要求「紧随其后的行含节次标记」才确认。
 */
function isCourseNameLine(text) {
  if (!text) return false;
  if (SECTION_RE.test(text)) return false;
  if (/^\s*[/:：]/.test(text)) return false;
  if (COURSE_NAME_BAD_RE.test(text)) return false;
  // 整行只有星号/空白
  if (/^[★☆◇\s]+$/.test(text)) return false;

  // ---- 以下为详情碎片特征，命中任一即判定「不是课程名」----
  // 1) 含冒号，且冒号前是很短的残词（被切碎的「场地:」「教师:」「学分:」等）
  if (/^[^：:]{0,6}[：:]/.test(text)) return false;
  // 2) 含学时/学分/考核/教学班 等详情关键字
  if (/学时|学分|考核|备注|周学时|选课/.test(text)) return false;
  // 3) 以斜杠开头或含有「/xx:」这种字段分隔
  if (/\/[^/]{0,4}[：:]/.test(text)) return false;
  // 4) 整段是「括号包裹的节次+周次」样式（如 (7-8节)3周）
  if (/^\(\d+\s*-\s*\d+\s*节\)/.test(text)) return false;
  // 5) 纯数字或纯符号
  if (/^[\d\s.,%\-–—]+$/.test(text)) return false;
  // 6) 以开括号（残句）开头，或含「;」分隔的班级串
  if (/^[（(]/.test(text) && /[)）]?\s*[\/:：]/.test(text)) return false;
  if (/教学班组成|定向\d{4}|护理\d{4}|中西医\d{4}/.test(text)) return false;
  // 7) 看起来像「xx-数字」的课程号残片
  if (/^\d{4}-\d{4}-\d\)/.test(text)) return false;
  // 8) 单字符或过短（真实课程名一般 ≥ 2 字且不会是单个标点）
  if (text.length < 2) return false;

  return true;
}

function parseCell(blob) {
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
   * 周次提取。
   *
   * 旧实现在整个 blob 上跑 `\)\s*([\d\-,周]+?)\s*\/`，而 blob 开头是课程名 + 课程号
   * （如 `中医基础理论★2027-1)-130008-01/教学班组(1-2节)3-5周,...`），
   * 课程号里的 `)` 会先被命中，于是 weeks 变成 `-130008-01`（实测已确认）。
   *
   * 现在从 `(N-M节)` 之后开始找 —— 那里才是 `周次/校区:场地:...` 详情区。
   * 并且不再要求前导 `)`（detail 以 `3-5周` 直接开头），
   * 改为「数字+周」的宽松形态，由 `/` 或文本结束收尾。
   */
  const detail = m ? blob.slice(m.index + m[0].length) : blob;
  const weeksExec = WEEKS_RE.exec(detail) || WEEKS_RE.exec(blob);
  const weeks = weeksExec ? weeksExec[1] : "";

  /*
   * 单双周标记。优先取 WEEKS_RE 的第 2 组（`11-13周(单)` 这种紧邻形态）；
   * 若没贴着周次串，再在 detail 区单独找一次 `(单)`/`(双)`。
   * 返回 `parity` = "单" | "双" | ""（空表示每周都上）。
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
    /** 单双周：`"单"` / `"双"` / `""`（空 = 每周） */
    parity: parity || "",
    room: room || "",
    teacher: teacher || "",
    /** 节次是否来自课程详情里的 `(N-M节)`；false 时由节次栏 y 锚点兜底 */
    sectionFromDetail,
  };
}

/**

/**
 * 兜底路径：模板既不画 `re`、也没有可用表头行时，按旧的「节次锚」分块。
 *
 * ⚠️ 这条路在「课名与详情 x 交叉」时会出错（缺几何信息，无法避免），
 *    但比完全解析不出来好。实测三份目标 PDF **都走不到这里**。
 *
 * v5 里本函数的输入已经是**设备空间**坐标，所以分块改用 `splitBlocksInRow`。
 */
function parseByAnchors(body, cols, colWidth) {
  const out = [];
  const blocks = splitBlocksInRow(body);
  const weekday = cols && cols.length ? cols[0].weekday : 1;
  blocks.forEach((group) => {
    if (!group.length) return;
    const parsed = parseCell(group.map((t) => t.text).join(""));
    if (!parsed || !parsed.courseName) return;
    parsed.courseName = cleanCourseName(parsed.courseName);
    if (!parsed.courseName || parsed.courseName.length < 2) return;
    const hasCJK = /[\u4e00-\u9fa5]/.test(parsed.courseName);
    if (!hasCJK && !parsed.teacher && !parsed.room && !parsed.weeks) return;
    parsed.weekday = weekday;
    delete parsed.sectionFromDetail;
    out.push(parsed);
  });
  return out;
}

/**
 * 入口：把 PDF 数据解析成课程数组。
 * @param {ArrayBuffer|Uint8Array} buffer PDF 文件内容
 * @returns {{courses: Array, title: string, semesterLabel: string}}
 */

/**
 * 入口：把 PDF 数据解析成课程数组。
 * @param {ArrayBuffer|Uint8Array} buffer PDF 文件内容
 * @returns {{courses: Array, title: string, semesterLabel: string}}
 *
 * ============================================================================
 * 分块策略（v5：内容流 cm 变换 + 星期行模型）
 * ============================================================================
 *
 * 走过的弯路，记下来免得回退：
 *
 * ① v1「按 y 线性切块（课名 → 下一个课名）」—— 同列叠放多门课时串块。
 *
 * ② 曾以为节次数字的 x 分两簇（75.4 / 78.1）代表「晚上区段」，
 *    据此写了 detectSections / buildSectionBands 按区段纵向切带。
 *    **实测证伪**：三份 PDF 严格满足
 *      x < 77  ⇒ 节次 ∈ {10,11,12}
 *      x >= 77 ⇒ 节次 ∈ 1..9
 *    这只是「两位数编号要画得更靠左」的对齐差异，**不是区段标记**。
 *
 * ③ v3「详情锚 + 一对一向上配课名」—— 在「课名与详情 y 不交叉」时正确，
 *    但实测两门课的文字会真正交错（高毅周5 的 `王文艺` 被截成 `王`）。
 *
 * ④ v4「`re` 矩形当单元格 + 最小包含矩形归属文字」—— **概念性错误，已废弃**。
 *    三份 PDF 的**第一条内容流指令**都是 `0 1 -1 0 595 0 cm`（90° 旋转 + 平移），
 *    此后所有 `re` 与 `Tm` 都在旋转后的空间里。所以：
 *      · 原空间里 `re` 画的是「横跨 ≥7 天的整行条」，不是单元格；
 *      · 矩形 y 与格内文字 y 完全对不上（实测差异上百 pt），
 *        表现为大量「第 1-1 节 + 详情全空」幽灵记录。
 *
 * ⑤ v5（当前，已实测自洽）：**先应用 cm 变换到设备空间，再按星期行分桶。**
 *    · `x' = 595 - y, y' = x`（见 readContentMatrix）
 *    · 变换后：**x' = 节次方向**、**y' = 星期方向**
 *    · 星期 = 文字 y' 落在哪条行带（表头「星期一..日」y' 定行，三份 PDF 行边界一致）
 *    · 节次 = 直接读详情的 `(N-M节)` —— 不再猜、不再做 y 锚点兜底
 *    · 行内分块 = 按 x' 升序，每个「带 ★ 的课名行」当块起点（见 splitBlocksInRow）
 *
 *    为什么最后一条可靠：实测三份 PDF 里 `★` 结尾的行数
 *    （郭亦菲 19 / 高毅 23 / 陈亚楠 25）与 `(N-M节)` 出现次数**完全相等**，
 *    天然一一对应。这比 v3/v4 的任何启发式都硬。
 */
function parseSchedulePdf(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!bytes.length) throw new Error("PDF 内容为空");
  // 校验文件头
  const head = bytesToLatin1(bytes.subarray(0, 5));
  if (head.indexOf("%PDF") !== 0) throw new Error("这不是一个 PDF 文件");

  const content = extractContentStream(bytes);
  const matrix = readContentMatrix(content);

  /*
   * 文字先按 Tm 原样取出（**不做 rotatePoint**），再由 matrix 统一变换。
   * rotatePoint 那条路依赖页面 `/Rotate`，而实测的旋转信息在内容流的 `cm` 里，
   * 页面字典的 /Rotate 反而是 0 —— 用错了地方会得到错误坐标。
   */
  const rawTexts = extractTexts(content, 0, 0, 0);
  if (!rawTexts.length) throw new Error("这个 PDF 里没有可解析的文字层（可能是扫描件/图片版）");

  // 设备空间坐标（**这是 v5 之后所有几何判定的唯一坐标系**）
  const texts = rawTexts.map((t, i) => {
    const p = applyMatrix(t.x, t.y, matrix);
    // drawOrder = 内容流里的原始绘制顺序 —— splitBlocksInRow 唯一可靠的分块依据
    return { x: p.x, y: p.y, text: t.text, drawOrder: i };
  });

  /*
   * 星期行。优先用表头 y 推导；推不出来时退回矩形边界聚类
   * （变换后的 `re` 边界正好落在行边界上，见 probe 实测：
   *  16 / 62.7 / 99.1 / 202.9 / 306.8 / 410.6 / 514.5 / 618.3 / 722.1）。
   */
  let rows = buildWeekdayRows(texts, CM_IDENTITY);
  if (!rows.length) {
    const rectsDev = extractRects(content).map((r) => applyMatrixToRect(r, matrix));
    rows = buildWeekdayRowsFromRects(rectsDev);
  }
  if (!rows.length) throw new Error("没识别到星期表头，可能不是标准教务课表");

  const { buckets, unassigned } = bucketByWeekday(texts, rows, CM_IDENTITY);

  // 学期名：取所有行带之外的标题文字
  const titleTexts = unassigned
    .filter((t) => !isTitleText(t.text))
    .sort((a, b) => b.y - a.y);
  const semesterLabel = pickSemesterLabel(titleTexts.concat(texts.filter((t) => /课表|学年|学期/.test(t.text))));

  const courses = [];
  /*
   * 质量问题收集（给导入前的确认框用）。
   *
   * 设计原则：**解析成功 ≠ 结果可信**。教务课表模板千差万别，解析器只能保证
   * 「按规则抽出来的东西是干净的」，没法保证「一条都没漏」。所以把可疑之处
   * 收集起来交给用户确认，比默默导进去让他事后发现少了一门课要好得多。
   */
  const warnings = [];
  const droppedBlocks = [];

  Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((weekday) => {
      const items = buckets[weekday].filter((t) => !isTitleText(t.text));
      const blocks = splitBlocksInRow(items);

      blocks.forEach((group) => {
        if (!group.length) return;
        /*
         * 按 drawOrder 拼接 = 还原原文阅读顺序。
         * splitBlocksInRow 返回的块已经是绘制顺序（课名行打头、详情依次跟随），
         * 直接用数组顺序 join 即可 —— **不要再按 x 排序**，几何重合的碎片
         * 会被排乱（实测高毅周1 两门课的碎片坐标完全相同）。
         */
        const blob = group.map((t) => t.text).join("");

        const parsed = parseCell(blob);
        if (!parsed) {
          droppedBlocks.push({ weekday, reason: "详情不完整", blob });
          return;
        }

        parsed.courseName = cleanCourseName(parsed.courseName);
        if (!parsed.courseName) {
          droppedBlocks.push({ weekday, reason: "课名为空", blob });
          return;
        }
        /*
         * 挡掉「假课程名」：
         *  - 纯数字（如 `2607`，是班级号/课程号碎片被当成课名）
         *  - 纯符号
         *  - 只有 1 个字符
         */
        if (/^[\d\s.\-]+$/.test(parsed.courseName)) {
          droppedBlocks.push({ weekday, reason: "课名是纯数字", blob });
          return;
        }
        if (/^[^\u4e00-\u9fa5a-zA-Z]+$/.test(parsed.courseName)) {
          droppedBlocks.push({ weekday, reason: "课名是纯符号", blob });
          return;
        }
        if (parsed.courseName.length < 2) {
          droppedBlocks.push({ weekday, reason: "课名过短", blob });
          return;
        }
        /*
         * 幽灵记录判定：课程名**不含任何中文**（纯数字/字母/符号碎片，
         * 如班级号 `2607`、课程号 `100319-05`），且四个详情字段全空。
         * 真实课程名必含中文，所以这条不会误删真课程。
         */
        const hasCJK = /[\u4e00-\u9fa5]/.test(parsed.courseName);
        if (!hasCJK && !parsed.teacher && !parsed.room && !parsed.weeks) {
          droppedBlocks.push({ weekday, reason: "幽灵记录（无中文课名且详情全空）", blob });
          return;
        }

        parsed.weekday = weekday;
        delete parsed.sectionFromDetail;
        courses.push(parsed);
      });
    });

  /*
   * 去重（同一天同一时段同一门课只保留信息最全的一条）。
   *
   * ⚠️ 判重键**必须包含周次与教师**（旧实现只有「星期+节次+课程名」，
   *    已证实会合并掉真实存在的不同课次）。实测陈亚楠 周2 有三条
   *    `中医护理学导论`，教师分别是 林洁 / 王萍丽 / 李翠娟，
   *    周次分别是 12-13周 / 3-4周 / 5周,9周 —— 它们是**三次不同的课**，
   *    旧键把三条压成一条，直接丢了两门课的数据。
   *
   * 所以只有「周次 + 节次 + 课名 + 教师 + 教室」全都一样才算重复。
   */
  const merged = [];
  const indexOfKey = {};
  courses.forEach((c) => {
    const key = [
      c.weekday, c.startSection, c.endSection, c.courseName,
      c.weeks, c.parity, c.teacher, c.room,
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
  courses.length = 0;
  merged.forEach((c) => courses.push(c));

  if (!courses.length) throw new Error("PDF 里没有识别到课程，可能不是标准教务课表格式");

  /*
   * ==========================================================================
   * 质量报告 —— 让用户在导入前就知道「这次解析有没有可疑的地方」
   * ==========================================================================
   * 三类可疑点各自会让用户做出不同决定：
   *   ① 缺周次 → 界面不知道该在哪几周显示，且**不能当成"每周都上"**（Task #7）。
   *      单独列为高优先级问题，因为它会直接产生误导性的课表。
   *   ② 缺教师/教室 → 不影响能不能去上课，提示一下即可。
   *   ③ 被丢弃的块 → 可能是新模板没适配，说明「有东西我没读懂」。
   */
  const noWeeks = courses.filter((c) => !c.weeks);
  const noTeacher = courses.filter((c) => !c.teacher);
  const noRoom = courses.filter((c) => !c.room);

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
   * ---------------------------------------------------------------------------
   * 表格之外的文字：区分「正常表头」与「真的漏读了」
   * ---------------------------------------------------------------------------
   * 行带之外本来就会有大量文字，它们**完全正常**：
   *   `时间段` `节次`（表头）、`1`…`12`（节次轴编号）、
   *   `上午` `中午` `下午` `晚上`（时段标签）、图例、标题。
   * 旧实现只要「非标题且超过 12 条」就报警，于是每份课表都报一次
   * 「19 段文字落在课程表格之外（可能课表列宽与模板不符）」——
   * 假警报比不报警更糟：用户会开始忽略警告。
   *
   * 现在只有**长得像课程内容**（含 节/周/场地/教师 等）的才计入。
   */
  const AXIS_LABEL_RE = /^(时间段|节次|上午|中午|下午|晚上|\d{1,2})$/;
  const looksLikeCourseText = (s) => /[节周]|场地|教室|教师|校区|教学班|学分|学时/.test(s);
  const suspicious = unassigned.filter((t) => {
    const s = String((t && t.text) || "").trim();
    if (isTitleText(s)) return false;
    if (AXIS_LABEL_RE.test(s)) return false;
    // 「其他课程」脚注由下面单独处理，不再重复当成"漏读的文字"
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

  /*
   * ---------------------------------------------------------------------------
   * 「其他课程」脚注 —— 表格外的一类真实课程，绝不能静默丢掉
   * ---------------------------------------------------------------------------
   * 教务课表会单独列出**不占固定星期/节次**的课程（军事理论走线上、思想
   * 政治实践课按周次安排），它们画不进格子里。解析器没办法把它们放到课表上，
   * 但丢掉就等于告诉学生「你没这门课」。
   *
   * 原文形如：
   *   其他课程：军事理论教育□外校线上教师(共18周)/1-18周/无;   思想政治实践课（一）◇朱蕾(共4周)/2-5周/无;
   * 结构：课名 + 装饰符 + 教师 + (共N周) + /实际周次/ + /教室(常为「无」)/
   */
  const otherFootnote = unassigned.map((t) => String((t && t.text) || "")).find((s) => /其他课程/.test(s));
  const parseOtherCourses = (text) => {
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
      .filter(Boolean);
  };
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

  return {
    courses,
    semesterLabel: semesterLabel || "我的课程表",
    title: semesterLabel,
    sourceLabel: `来自 PDF${semesterLabel ? `（${semesterLabel}）` : ""}`,
    warnings,
    quality: {
      total: courses.length,
      missingWeeks: noWeeks.length,
      missingTeacher: noTeacher.length,
      missingRoom: noRoom.length,
      droppedBlocks: droppedBlocks.length,
      // 表格外的「其他课程」（军事理论/思政实践课等），有固定周次但没有星期节次
      otherCourses: otherCourses.length,
    },
  };
}

module.exports = {
  parseSchedulePdf,
  // 供测试使用
  _internal: {
    extractContentStream,
    extractTexts,
    decodePdfString,
    buildColumns,
    locateColumn,
    cleanCourseName,
    pickSemesterLabel,
    rotatePoint,
    readPageRotation,
    readMediaBox,
    parseCell,
    isCourseNameLine,
    splitFields,
    cleanFieldValue,
    isTitleText,
    extractRects,
    // v5 新增：cm 变换 + 星期行模型
    readContentMatrix,
    applyMatrix,
    applyMatrixToRect,
    buildWeekdayRows,
    buildWeekdayRowsFromRects,
    bucketByWeekday,
    splitBlocksInRow,
    parseByAnchors,
  },
};

