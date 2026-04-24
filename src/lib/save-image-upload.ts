import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/** 从原始文件名得到扩展名，仅允许常见图片后缀 */
export function getImageExtFromFileName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return ".png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return ".jpg";
  if (n.endsWith(".webp")) return ".webp";
  if (n.endsWith(".gif")) return ".gif";
  return "";
}

function mimeFromExt(ext: string): string {
  const m: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return m[ext] ?? "application/octet-stream";
}

export type ImageUploadKind = "task" | "evidence";

/**
 * 有 BLOB_READ_WRITE_TOKEN（Vercel 部署时自动注入或本地手动配置）时上传到 Vercel Blob；
 * 否则写入 public/uploads，便于本机开发。
 */
export async function saveImageUpload(
  kind: ImageUploadKind,
  buffer: Buffer,
  ext: string,
): Promise<string> {
  const filename = `${crypto.randomUUID()}${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const folder = kind === "evidence" ? "evidence" : "task";
    const pathname = `shao-xiaoli-attendance/${folder}/${filename}`;
    const { url } = await put(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: mimeFromExt(ext),
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return url;
  }

  if (kind === "evidence") {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "evidence");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);
    return `/uploads/evidence/${filename}`;
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}
