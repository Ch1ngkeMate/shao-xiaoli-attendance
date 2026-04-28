import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** 返回当前构建的 buildId，用于前端确认是否已部署最新 */
export async function GET() {
  try {
    // 兼容多种部署形态：有些模式下 process.cwd() 可能不在项目根目录
    const cwd = process.cwd();
    const candidates = [
      path.join(cwd, ".next", "BUILD_ID"),
      path.join(cwd, "BUILD_ID"),
      path.join(cwd, "..", ".next", "BUILD_ID"),
      path.join(cwd, "..", "BUILD_ID"),
      path.join(cwd, "..", "..", ".next", "BUILD_ID"),
      path.join(cwd, "..", "..", "BUILD_ID"),
    ];

    for (const p of candidates) {
      try {
        const buildId = (await readFile(p, "utf8")).trim();
        if (buildId) return NextResponse.json({ buildId, pathUsed: p });
      } catch {
        // 继续尝试下一个路径
      }
    }

    return NextResponse.json({ buildId: "", pathUsed: null, cwd }, { status: 200 });
  } catch {
    // 不阻塞页面：返回空
    return NextResponse.json({ buildId: "", pathUsed: null }, { status: 200 });
  }
}

