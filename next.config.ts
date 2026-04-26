import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 内网穿透（ngrok 等）时，开发服需允许外网 Host，否则白屏/资源 403
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
};

export default nextConfig;
