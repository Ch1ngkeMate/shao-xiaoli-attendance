"use client";

import { ConfigProvider, theme } from "antd";
import { useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

function readThemeMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem("sxl-theme-mode");
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function isSystemDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setMode(readThemeMode());
    setSystemDark(isSystemDark());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const onChange = () => setSystemDark(mql.matches);
    onChange();
    try {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } catch {
      // Safari 旧版本不支持 addEventListener
      (mql as unknown as { addListener?: (cb: () => void) => void }).addListener?.(onChange);
      return () => (mql as unknown as { removeListener?: (cb: () => void) => void }).removeListener?.(onChange);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSet = (e: Event) => {
      const d = (e as CustomEvent<{ mode?: ThemeMode }>).detail;
      if (!d?.mode) return;
      setMode(d.mode);
      try {
        window.localStorage.setItem("sxl-theme-mode", d.mode);
      } catch {}
    };
    window.addEventListener("sxl-theme-set", onSet as EventListener);
    return () => window.removeEventListener("sxl-theme-set", onSet as EventListener);
  }, []);

  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    // 给全局 CSS / 自定义组件用
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const antdTheme = useMemo(
    () => ({
      algorithm: resolved === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    }),
    [resolved],
  );

  return <ConfigProvider theme={antdTheme}>{children}</ConfigProvider>;
}

