import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { saveOutcomeUpload } from "@/lib/save-image-upload";

type Params = { id: string };

const MAX_BYTES = 50 * 1024 * 1024;

const allowed: Record<string, { kind: "IMAGE" | "VIDEO" | "DOCUMENT"; ext: string }> = {
  "image/jpeg": { kind: "IMAGE", ext: ".jpg" },
  "image/png": { kind: "IMAGE", ext: ".png" },
  "image/webp": { kind: "IMAGE", ext: ".webp" },
  "image/gif": { kind: "IMAGE", ext: ".gif" },
  "video/mp4": { kind: "VIDEO", ext: ".mp4" },
  "video/webm": { kind: "VIDEO", ext: ".webm" },
  "video/quicktime": { kind: "VIDEO", ext: ".mov" },
  "application/pdf": { kind: "DOCUMENT", ext: ".pdf" },
};

/** 网盘等外链材料：名称 + http(s) 地址 */
const LinkSchema = z.object({
  label: z.string().trim().min(1, "请填写链接名称").max(120, "链接名称过长"),
  url: z
    .string()
    .trim()
    .url("链接地址格式不正确")
    .max(1000, "链接地址过长")
    .regex(/^https?:\/\//, "仅支持 http/https 链接"),
});

export const runtime = "nodejs";

type Session = { sub: string; displayName: string };

async function createAsset(
  taskId: string,
  taskTitle: string,
  session: Session,
  data: { kind: "IMAGE" | "VIDEO" | "DOCUMENT" | "LINK"; url: string; filename: string; mimeType: string; sizeBytes: number | null },
) {
  const outcome = await prisma.taskOutcome.upsert({
    where: { taskId },
    create: { taskId, title: `${session.displayName}+${taskTitle}+其他`, updatedById: session.sub },
    update: { updatedById: session.sub },
  });
  const count = await prisma.taskOutcomeAsset.count({ where: { outcomeId: outcome.id } });
  const asset = await prisma.taskOutcomeAsset.create({
    data: {
      outcomeId: outcome.id,
      kind: data.kind,
      url: data.url,
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      sort: count,
      uploadedById: session.sub,
    },
    include: { uploadedBy: { select: { id: true, displayName: true } } },
  });
  return NextResponse.json({ asset: { ...asset, createdAt: asset.createdAt.toISOString() } });
}

/**
 * 归档成果材料：
 * - multipart/form-data 上传文件（图片/视频/PDF，单文件 ≤50MB）；
 * - application/json 登记网盘链接材料（大文件不入库的推荐方式）。
 * 任务参与者或 ADMIN/MINISTER 可用。
 */
export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id: taskId } = await ctx.params;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      claims: { where: { userId: session.sub, status: "CLAIMED" }, select: { id: true } },
    },
  });
  if (!task) return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  const canManage = session.role === "ADMIN" || session.role === "MINISTER";
  if (!canManage && task.claims.length === 0) {
    return NextResponse.json({ message: "仅任务参与者或管理人员可补充成果材料" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed = LinkSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
    }
    return createAsset(taskId, task.title, session, {
      kind: "LINK",
      url: parsed.data.url,
      filename: parsed.data.label,
      mimeType: "text/uri-list",
      sizeBytes: null,
    });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "缺少文件" }, { status: 400 });
  const type = allowed[file.type];
  if (!type) return NextResponse.json({ message: "仅支持 JPG、PNG、WebP、GIF、MP4、WebM、MOV 和 PDF" }, { status: 400 });
  if (!file.size) return NextResponse.json({ message: "文件内容为空" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: "单个材料不能超过 50 MB" }, { status: 400 });
  const url = await saveOutcomeUpload(type.kind, Buffer.from(await file.arrayBuffer()), type.ext);
  return createAsset(taskId, task.title, session, {
    kind: type.kind,
    url,
    filename: file.name.slice(0, 191),
    mimeType: file.type,
    sizeBytes: file.size,
  });
}
