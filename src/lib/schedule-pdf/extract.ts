/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 服务端 PDF 文字抽取层
 * ============================================================================
 * 用 pdfjs-dist（Firefox 内置的 PDF 引擎，Mozilla 维护）替代原先在小程序端
 * 手写的 PDF 解码器。手写那套需要自己处理：字体 CMap、FlateDecode、多 stream
 * 拼接、页面旋转、对象流……每一项都是一个独立的坑，且每次遇到新模板就复发。
 *
 * 交给成熟引擎后，本层只负责「拿到文字 + 坐标」，不碰任何 PDF 内部结构。
 *
 * ---------------------------------------------------------------------------
 * 坐标语义（重要，务必先读）
 * ---------------------------------------------------------------------------
 * pdf.js 返回的 `item.transform` 是 `[a, b, c, d, e, f]`，**已经包含了页面
 * 内容流里的 `cm` 变换**。实测四份教务 PDF，内容流开头都是
 * `0 1 -1 0 595 0 cm`（90° 旋转 + 平移），于是：
 *
 *     x = e = 595 - y_raw     ← 节次方向（1-2节 ≈ 89.5，3-4节 ≈ 201）
 *     y = f = x_raw           ← 星期方向（周一 133 / 周二 236.85 / … 步长 103.85）
 *
 * 也就是说 **x 判节次、y 判星期**，不需要再做任何矩阵换算。
 * 这与上一版手写解析器「先取 Tm 再用 cm 还原」得到的设备坐标完全一致
 * （已逐点核对：李奕然 `中医基础理论★` 的 y=207.92 落在周二行带
 *  [202.9, 306.8]，而该课表里中医基础理论正是周二 1-2 节）。
 *
 * ---------------------------------------------------------------------------
 * Node 环境的一个坑
 * ---------------------------------------------------------------------------
 * pdf.js v6 在 Node 下用全局 `fetch` 去取 cmaps / 标准字体，而 **Node 的 fetch
 * 不支持 `file://` 协议** → 报 `Unable to load CMap data`。若不处理，
 * UniGB-UCS2-H 这类中文会全部解不出来（观察到 item 数直接变 0）。
 * 对策：注入自定义的 CMapReaderFactory / StandardFontDataFactory，改用 fs 读盘。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** 一条文字碎片。坐标是「设备坐标」（见文件头说明）。 */
export type PdfTextItem = {
  /** 文字内容（已由 pdf.js 完成字符集解码） */
  str: string;
  /** 节次方向坐标 */
  x: number;
  /** 星期方向坐标 */
  y: number;
  /** 文字宽度（pt）—— 手写解析器拿不到这个，可用于区分换行/相邻块 */
  w: number;
  /** 文字高度（pt）—— 实测课名 9、详情 8、节次编号 12 */
  h: number;
  /** 所属页码（从 1 开始） */
  page: number;
  /** 全局绘制顺序（跨页连续递增），分块的唯一可靠依据 */
  order: number;
};

export type ExtractResult = {
  items: PdfTextItem[];
  pageCount: number;
  /** 非空字符总数，用于判断有无文字层 */
  charCount: number;
  /** false 时说明是扫描件/纯图片 PDF，需要 OCR */
  hasTextLayer: boolean;
  /** 引擎版本，写进响应里便于排查 */
  engine: string;
  /** 遇到但被跳过的解析告警（非致命） */
  notes: string[];
};

/** 判定「有文字层」的最少字符数。低于此值基本可断定是扫描件。 */
const MIN_TEXT_CHARS = 30;

const require_ = createRequire(
  typeof __filename !== "undefined" ? __filename : path.join(process.cwd(), "index.js"),
);

/**
 * 定位 pdfjs-dist 包根目录。
 *
 * 部署形态可能不同（PM2 直跑 / standalone 产物），所以多路探测：
 *   1) 环境变量 PDFJS_ROOT（运维可覆盖）
 *   2) require.resolve（正常 node_modules 布局）
 *   3) process.cwd()/node_modules（PM2 在项目根启动）
 */
function findPdfjsRoot(): string {
  const candidates: string[] = [];
  if (process.env.PDFJS_ROOT) candidates.push(process.env.PDFJS_ROOT);
  try {
    candidates.push(path.dirname(require_.resolve("pdfjs-dist/package.json")));
  } catch {
    /* 打包外部化失败时往下走 */
  }
  candidates.push(path.join(process.cwd(), "node_modules", "pdfjs-dist"));

  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "legacy", "build", "pdf.mjs"))) return dir;
  }
  throw new Error(
    "服务端缺少 pdfjs-dist（或 PDFJS_ROOT 指向错误）。请在项目根执行 npm install pdfjs-dist。",
  );
}

/** 用 fs 读盘的 CMap 工厂，绕开 Node fetch 不支持 file:// 的问题 */
class NodeCMapReaderFactory {
  baseUrl: string;
  isCompressed: boolean;
  constructor(opts: { baseUrl?: string; isCompressed?: boolean } = {}) {
    this.baseUrl = opts.baseUrl || path.join(findPdfjsRoot(), "cmaps");
    this.isCompressed = !!opts.isCompressed;
  }
  async fetch({ name }: { name: string }) {
    const file = path.join(this.baseUrl, name + (this.isCompressed ? ".bcmap" : ""));
    return { cMapData: new Uint8Array(fs.readFileSync(file)), isCompressed: this.isCompressed };
  }
}

/** 同上，用于标准字体（Type1/TrueType 内嵌不全时的回退） */
class NodeStandardFontDataFactory {
  baseUrl: string;
  constructor(opts: { baseUrl?: string } = {}) {
    this.baseUrl = opts.baseUrl || path.join(findPdfjsRoot(), "standard_fonts");
  }
  async fetch({ filename }: { filename: string }) {
    return new Uint8Array(fs.readFileSync(path.join(this.baseUrl, filename)));
  }
}

let cachedModule: any = null;

/** 加载 pdf.js（ESM-only，必须动态 import；webpack 需跳过打包，运行时从 node_modules 取） */
async function loadPdfjs(): Promise<any> {
  if (cachedModule) return cachedModule;
  const root = findPdfjsRoot();
  const url = pathToFileURL(path.join(root, "legacy", "build", "pdf.mjs")).href;
  cachedModule = await import(/* webpackIgnore: true */ url);
  return cachedModule;
}

/**
 * 抽取 PDF 全部页面的文字碎片。
 *
 * 不做任何「课表」语义判断 —— 那是 rebuild 层的事。本层只保证：
 * 每一条文字都带正确的 `str` / `x` / `y` / `w` / `h` / `page` / `order`。
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult> {
  if (!bytes || !bytes.length) throw new Error("PDF 内容为空");

  const pdfjs = await loadPdfjs();
  const root = findPdfjsRoot();
  const cmapDir = path.join(root, "cmaps").replace(/\\/g, "/") + "/";
  const fontDir = path.join(root, "standard_fonts").replace(/\\/g, "/") + "/";

  const notes: string[] = [];
  const doc = await pdfjs
    .getDocument({
      // pdf.js 会「消费」传入的 buffer，传副本避免调用方数据被改
      data: new Uint8Array(bytes),
      CMapReaderFactory: NodeCMapReaderFactory,
      StandardFontDataFactory: NodeStandardFontDataFactory,
      cMapUrl: cmapDir,
      cMapPacked: true,
      standardFontDataUrl: fontDir,
      useSystemFonts: false,
      isEvalSupported: false,
      // 不打印字体/CMap 告警到 stdout，改由 notes 收集
      verbosity: 0,
    })
    .promise;

  const items: PdfTextItem[] = [];
  let charCount = 0;
  let order = 0;

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    let content: any;
    try {
      content = await page.getTextContent();
    } catch (err) {
      notes.push(`第 ${pageNo} 页文字抽取失败：${(err as Error)?.message || err}`);
      continue;
    }

    for (const raw of content.items || []) {
      if (typeof raw?.str !== "string") continue; // 只取文字项，跳过标记项
      const str = raw.str;
      const t = raw.transform;
      if (!Array.isArray(t) || t.length < 6) continue;

      const e = Number(t[4]);
      const f = Number(t[5]);
      if (!Number.isFinite(e) || !Number.isFinite(f)) continue;

      // 空串也要占一个 order，保证跨页顺序连续可比
      const thisOrder = order;
      order += 1;

      const text = str.replace(/\u0000/g, "");
      if (!text.trim()) continue;

      charCount += text.length;
      items.push({
        str: text,
        x: e,
        y: f,
        w: Number(raw.width) || 0,
        h: Number(raw.height) || Math.abs(Number(t[3])) || 0,
        page: pageNo,
        order: thisOrder,
      });
    }
  }

  const hasTextLayer = charCount >= MIN_TEXT_CHARS;
  if (!hasTextLayer) {
    notes.push(
      `只抽到 ${charCount} 个字符，判定为无文字层（扫描件/图片版），需要 OCR 才能识别`,
    );
  }

  return {
    items,
    pageCount: doc.numPages,
    charCount,
    hasTextLayer,
    engine: `pdfjs-dist@${pdfjs.version || "unknown"}`,
    notes,
  };
}
