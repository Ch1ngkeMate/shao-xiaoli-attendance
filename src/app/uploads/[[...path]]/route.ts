import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getLocalUploadsRoot } from "@/lib/save-image-upload";

export const runtime = "nodejs";

/** 防止路径穿越；仅允许单层段名 */
function isSafeSegment(s: string): boolean {
  if (!s || s === "." || s === "..") return false;
  if (s.includes("/") || s.includes("\\") || s.includes("..")) return false;
  return true;
}

function isFileUnderRoot(root: string, filePath: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(filePath));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const m: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return m[ext] ?? "application/octet-stream";
}

/**
 * 本地上传文件访问：从 getLocalUploadsRoot() 读盘。
 * 用于配置了 LOCAL_UPLOADS_DIR 但未在 Nginx 配 alias 时仍能打开 /uploads/...；
 * 与 public/uploads 二选一由 getLocalUploadsRoot 决定，路径规则与 saveImageUpload 一致。
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const { path: segments } = await ctx.params;
  const parts = (segments ?? []).filter(Boolean);
  if (parts.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }
  for (const p of parts) {
    if (!isSafeSegment(p)) {
      return new NextResponse("Bad Request", { status: 400 });
    }
  }

  const root = path.resolve(getLocalUploadsRoot());
  const absFile = path.resolve(path.join(root, ...parts));
  if (!isFileUnderRoot(root, absFile)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const st = await stat(absFile);
    if (!st.isFile()) {
      return new NextResponse("Not Found", { status: 404 });
    }
    const buf = await readFile(absFile);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(absFile),
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
