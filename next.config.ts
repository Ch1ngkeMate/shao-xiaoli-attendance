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
  ...(lowMemBuild
    ? {
        typescript: { ignoreBuildErrors: true },
        eslint: { ignoreDuringBuilds: true },
      }
    : {}),
};

export default nextConfig;
