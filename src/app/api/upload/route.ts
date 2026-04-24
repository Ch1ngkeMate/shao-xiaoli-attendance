import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";
import { getImageExtFromFileName, saveImageUpload } from "@/lib/save-image-upload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "MINISTER") {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ message: "表单解析失败" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "缺少文件" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ message: "只支持图片上传" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = getImageExtFromFileName(file.name);
  const url = await saveImageUpload("task", buffer, ext);

  return NextResponse.json({ url });
}
