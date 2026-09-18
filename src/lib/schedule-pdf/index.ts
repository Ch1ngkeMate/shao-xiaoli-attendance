/**
 * 课表解析（服务端）
 * ============================================================================
 * 对外只暴露一个函数，返回统一的 JSON 结构：
 *
 *     {
 *       ok, needsOcr, confidence,
 *       courses: [], warnings: [], unmatchedCells: [],
 *       semesterLabel, sourceLabel, engine, stats, notes
 *     }
 *
 * 分工见各子模块：
 *   · extract.ts —— pdfjs-dist 抽文字（PDF 引擎层）
 *   · cell.ts    —— 单条课程文本 → 字段
 *   · rebuild.ts —— 表格重建 + 质量告警
 */
import { extractPdfText, type ExtractResult } from "./extract";
import { rebuildSchedule, type ScheduleWarning, type UnmatchedCell } from "./rebuild";
import type { ParsedCourse } from "./cell";

export type ParseScheduleResult = {
  /** 是否成功重建出课表结构 */
  ok: boolean;
  /** true = 这份 PDF 没有文字层（扫描件），需要 OCR，本响应不带课程 */
  needsOcr: boolean;
  courses: ParsedCourse[];
  warnings: ScheduleWarning[];
  /** 没能识别成课程的片段（原文），供「识别预览」展示 */
  unmatchedCells: UnmatchedCell[];
  /** 0~1，给导入前确认框做参考 */
  confidence: number;
  semesterLabel: string;
  sourceLabel: string;
  engine: string;
  stats: {
    pageCount: number;
    charCount: number;
    itemCount: number;
    courseCount: number;
  };
  notes: string[];
};

function emptyResult(over: Partial<ParseScheduleResult>): ParseScheduleResult {
  return {
    ok: false,
    needsOcr: false,
    courses: [],
    warnings: [],
    unmatchedCells: [],
    confidence: 0,
    semesterLabel: "我的课程表",
    sourceLabel: "来自 PDF",
    engine: "unknown",
    stats: { pageCount: 0, charCount: 0, itemCount: 0, courseCount: 0 },
    notes: [],
    ...over,
  };
}

/** 解析一份课表 PDF，返回可直接下发给小程序的统一结构 */
export async function parseSchedulePdfServer(bytes: Uint8Array): Promise<ParseScheduleResult> {
  let extracted: ExtractResult;
  try {
    extracted = await extractPdfText(bytes);
  } catch (err) {
    return emptyResult({
      notes: [`PDF 读取失败：${(err as Error)?.message || err}`],
      warnings: [
        {
          level: "warn",
          code: "PDF_READ_FAILED",
          count: 1,
          message: `PDF 读取失败：${(err as Error)?.message || err}`,
        },
      ],
    });
  }

  const base = {
    engine: extracted.engine,
    stats: {
      pageCount: extracted.pageCount,
      charCount: extracted.charCount,
      itemCount: extracted.items.length,
      courseCount: 0,
    },
    notes: extracted.notes,
  };

  // 无文字层 → 交给 OCR（第二阶段能力）。现在明确告知，不猜
  if (!extracted.hasTextLayer) {
    return emptyResult({
      ...base,
      needsOcr: true,
      warnings: [
        {
          level: "warn",
          code: "NO_TEXT_LAYER",
          count: 1,
          message: "这份 PDF 是扫描件/图片版，没有文字层。请改用教务系统导出的原始 PDF（带文字层）。",
        },
      ],
    });
  }

  let rebuilt;
  try {
    rebuilt = rebuildSchedule(extracted.items);
  } catch (err) {
    return emptyResult({
      ...base,
      notes: [...extracted.notes, (err as Error)?.message || String(err)],
      warnings: [
        {
          level: "warn",
          code: "NO_TIMETABLE",
          count: 1,
          message: (err as Error)?.message || "没能识别出课表结构，可能不是标准教务课表",
        },
      ],
    });
  }

  return {
    ok: true,
    needsOcr: false,
    courses: rebuilt.courses,
    warnings: rebuilt.warnings,
    unmatchedCells: rebuilt.unmatchedCells,
    confidence: rebuilt.confidence,
    semesterLabel: rebuilt.semesterLabel,
    sourceLabel: `来自 PDF（${rebuilt.semesterLabel}）`,
    engine: extracted.engine,
    stats: { ...base.stats, courseCount: rebuilt.courses.length },
    notes: extracted.notes,
  };
}

export { extractPdfText } from "./extract";
export type { ExtractResult, PdfTextItem } from "./extract";
export { rebuildSchedule, splitBlocksInRow, buildWeekdayRows, bucketByWeekday } from "./rebuild";
export type { ScheduleWarning, UnmatchedCell, RebuildResult } from "./rebuild";
export {
  parseCell,
  cleanCourseName,
  cleanFieldValue,
  splitFields,
  isTitleText,
  pickSemesterLabel,
  WEEKDAY_NAMES,
} from "./cell";
export type { ParsedCourse } from "./cell";
