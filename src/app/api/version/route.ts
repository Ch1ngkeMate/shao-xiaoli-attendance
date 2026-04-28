import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** 返回当前构建的 buildId，用于前端确认是否已部署最新 */
export async function GET() {
  try {
    const p = path.join(process.cwd(), ".next", "BUILD_ID");
    const buildId = (await readFile(p, "utf8")).trim();
    return NextResponse.json({ buildId });
  } catch {
    // 不阻塞页面：返回空
    return NextResponse.json({ buildId: "" }, { status: 200 });
  }
}

