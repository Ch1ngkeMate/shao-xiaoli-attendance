"use client";

import { HeartFilled } from "@ant-design/icons";

type Props = {
  /** 显示边长（像素） */
  size?: number;
  className?: string;
};

/**
 * 部门 Logo：纯节点 + 图标，不请求网络、不用 data URL / 内联 svg。
 * 避免微信等 WebView 拦截 data: 图、或 svg 尺寸异常导致裂图。
 */
export function DeptLogo({ size = 40, className }: Props) {
  const r = Math.max(8, size * 0.2);
  return (
    <div
      className={className}
      role="img"
      aria-label="部门 Logo"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: r,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: "linear-gradient(135deg, #1677ff 0%, #0958d9 100%)",
        color: "#fff",
        fontSize: Math.round(size * 0.44),
        lineHeight: 1,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      <HeartFilled aria-hidden />
    </div>
  );
}
