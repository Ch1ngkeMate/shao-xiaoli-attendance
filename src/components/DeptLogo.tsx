"use client";

import { HeartFilled } from "@ant-design/icons";
import { useCallback, useState } from "react";

type Props = {
  /** 显示边长（像素） */
  size?: number;
  className?: string;
};

/** 0: 尝试 public/dept-logo.png → 1: dept-logo.svg → 2: 内置图标（避免裂图） */
type LogoStep = 0 | 1 | 2;

/**
 * 部门 Logo：优先使用 `public/dept-logo.png`（路径为 `/dept-logo.png`），不存在再试 svg，仍失败则用渐变+心形。
 * Next 的 public 文件即根路径引用；若 Nginx 未把静态交给 Next，会自动落到内置样式。
 */
export function DeptLogo({ size = 40, className }: Props) {
  const [step, setStep] = useState<LogoStep>(0);
  const r = Math.max(8, size * 0.2);

  const onImgError = useCallback(() => {
    setStep((x) => (x < 2 ? ((x + 1) as LogoStep) : 2));
  }, []);

  if (step === 2) {
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

  const src = step === 0 ? "/dept-logo.png" : "/dept-logo.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- public 静态资源，需 onError 回退
    <img
      src={src}
      alt="部门 Logo"
      width={size}
      height={size}
      className={className}
      decoding="async"
      onError={onImgError}
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
      }}
    />
  );
}
