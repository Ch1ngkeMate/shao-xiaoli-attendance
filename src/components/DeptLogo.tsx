"use client";

type Props = {
  /** 显示边长（像素） */
  size?: number;
  className?: string;
};

/** 与原先 public 内图形一致；用 data URL 避免依赖静态路径，且比内联 svg 在部分 WebView 里更稳 */
const LOGO_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1677ff"/><stop offset="100%" stop-color="#0958d9"/></linearGradient></defs><rect width="80" height="80" rx="18" fill="url(#g)"/><path fill="#fff" fill-opacity="0.95" d="M40 18c-6 8-16 14-16 24 0 9 7 16 16 16s16-7 16-16c0-10-10-16-16-24zm0 34c-5.5 0-10-4.5-10-10 0-6 5.5-11 10-15 4.5 4 10 9 10 15 0 5.5-4.5 10-10 10z"/><circle cx="40" cy="40" r="4" fill="#fff"/></svg>`;

const LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG_MARKUP)}`;

/**
 * 部门 Logo（不请求 /dept-logo.svg，避免 Nginx 未反代静态时裂图）。
 * 使用 data URL + 固定宽高，兼容部分移动端 WebView 对内联 svg 尺寸异常的问题。
 */
export function DeptLogo({ size = 40, className }: Props) {
  const r = Math.max(8, size * 0.2);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_DATA_URL}
      alt="部门 Logo"
      width={size}
      height={size}
      className={className}
      decoding="async"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: r,
        display: "block",
        objectFit: "contain",
        flexShrink: 0,
        background: "#fff",
        verticalAlign: "middle",
      }}
    />
  );
}
