import type { NextConfig } from "next";

/** 小内存 VPS 上 next build 常在 Running TypeScript 被 OOM Kill；设 1 则跳过构建期类型检查（上线前尽量在本机或 CI 跑 tsc） */
const lowMemBuild =
  process.env.NEXT_BUILD_LOW_MEM === "1" || process.env.NEXT_BUILD_LOW_MEM === "true";

const nextConfig: NextConfig = {
  // 内网穿透（ngrok 等）时，开发服需允许外网 Host，否则白屏/资源 403
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
  /*
   * pdfjs-dist 必须外部化（不打包进 bundle）：
   *   1) 它是 ESM-only（legacy/build/pdf.mjs），webpack 打包后动态 import 会失效；
   *   2) 它运行时要去 node_modules/pdfjs-dist/{cmaps,standard_fonts}/ 读资源，
   *      打包会打乱这些目录的相对位置。
   * 外部化后由 Node 运行时直接从 node_modules 加载，路径解析保持正常。
   * 代码侧见 src/lib/schedule-pdf/extract.ts 的 findPdfjsRoot()。
   */
  serverExternalPackages: ["pdfjs-dist"],
  ...(lowMemBuild
    ? {
        typescript: { ignoreBuildErrors: true },
        eslint: { ignoreDuringBuilds: true },
      }
    : {}),
};

export default nextConfig;
