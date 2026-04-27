"use client";

import { useId } from "react";

type Props = {
  /** 显示边长（像素） */
  size?: number;
  className?: string;
};

/**
 * 部门 Logo（内联 SVG，不依赖 /dept-logo.svg 静态文件）。
 * 避免宝塔 Nginx 把 .svg 指到空站点根、反代不到 Next 时出现裂图。
 */
export function DeptLogo({ size = 40, className }: Props) {
  const rawId = useId().replace(/:/g, "");
  const gradId = `dept-logo-grad-${rawId}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role="img"
      aria-label="部门 Logo"
      className={className}
      style={{
        borderRadius: Math.max(8, size * 0.2),
        display: "block",
        background: "#fff",
        flexShrink: 0,
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1677ff" stopOpacity={1} />
          <stop offset="100%" stopColor="#0958d9" stopOpacity={1} />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="18" fill={`url(#${gradId})`} />
      <path
        fill="#fff"
        fillOpacity={0.95}
        d="M40 18c-6 8-16 14-16 24 0 9 7 16 16 16s16-7 16-16c0-10-10-16-16-24zm0 34c-5.5 0-10-4.5-10-10 0-6 5.5-11 10-15 4.5 4 10 9 10 15 0 5.5-4.5 10-10 10z"
      />
      <circle cx="40" cy="40" r="4" fill="#fff" />
    </svg>
  );
}
