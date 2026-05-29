"use client";

import { HeartFilled } from "@ant-design/icons";
import { useState } from "react";

type Props = {
  size?: number;
  className?: string;
};

type LogoStep = 0 | 1 | 2;

export function DeptLogo({ size = 40, className }: Props) {
  const [step, setStep] = useState<LogoStep>(1);
  const r = Math.max(8, size * 0.2);

  if (step === 2) {
    return (
      <div
        className={className}
        role="img"
        aria-label="邵小利志愿服务队"
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

  const src = "/dept-logo.svg";

  return (
    <img
      src={src}
      alt="邵小利志愿服务队"
      width={size}
      height={size}
      className={className}
      decoding="async"
      onError={() => setStep(2)}
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
