import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { parseSchedulePdfServer } from "@/lib/schedule-pdf";

/**
 * 课表解析接口
 * ============================================================================
 * 小程序上传 PDF/图片，服务端解析后返回统一的课程 JSON，小程序展示「识别预览」
 * 由用户确认后再写入本地课表。
 *
 * 为什么把解析搬到这里（而不是继续在小程序端做）：
 *   · 小程序端手写 PDF 解码器 = 自己实现 PDF 引擎 + 文字布局引擎 + 表格识别，
 *     每遇到一份新模板就复发（漏课、幽灵记录、字段污染、单双周丢失）。
 *   · 服务端可以用成熟引擎（pdfjs-dist），且**修了解析器不用重新发版小程序**。
 *
 * 关于状态码：**除鉴权/表单错误外一律返回 200**，用 body 里的 `ok` 区分结果。
 * 因为小程序的请求封装在非 2xx 时只透出 message，会丢掉 courses/warnings 结构，
 * 那样「识别预览」就没法展示细节了。
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** 上限 10MB —— 教务课表 PDF 通常几百 KB，超限基本是选错文件了 */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ message: "表单解析失败" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "缺少文件字段 file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { message: `文件太大（${(file.size / 1024 / 1024).toFixed(1)}MB），课表 PDF 通常只有几百 KB` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = String.fromCharCode(...bytes.subarray(0, 5));

  /*
   * 图片走 OCR 通道（第二阶段能力），现在明确告知而不是猜。
   * 注意要同时看 MIME 与文件头：微信上传时 MIME 有时是 application/octet-stream。
   */
  const looksLikePdf = head === "%PDF-";
  const looksLikeImage =
    file.type.startsWith("image/") ||
    bytes[0] === 0xff && bytes[1] === 0xd8 || // JPEG
    bytes[0] === 0x89 && bytes[1] === 0x50; // PNG

  if (!looksLikePdf) {
    if (looksLikeImage) {
      return NextResponse.json({
        ok: false,
        needsOcr: true,
        courses: [],
        warnings: [
          {
            level: "warn",
            code: "IMAGE_INPUT",
            count: 1,
            message: "当前只支持「带文字层」的 PDF。截图/照片需要 OCR，该能力正在建设中。",
          },
        ],
        unmatchedCells: [],
        confidence: 0,
        semesterLabel: "我的课程表",
        sourceLabel: "来自图片",
        engine: "none",
        stats: { pageCount: 0, charCount: 0, itemCount: 0, courseCount: 0 },
        notes: [],
      });
    }
    return NextResponse.json({ message: "这不是一个 PDF 文件" }, { status: 400 });
  }

  const result = await parseSchedulePdfServer(bytes);
  return NextResponse.json(result, { status: 200 });
}
