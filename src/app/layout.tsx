import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";

/** 不使用 next/font/google：构建时会请求 Google Fonts，国内服务器常失败 */

export const metadata: Metadata = {
  title: "干事考勤系统",
  description: "邵小利志愿服务队·宣传部",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
