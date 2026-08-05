"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "system" | "dark" | "light";

type ThemeCtx = {
  theme: ThemeMode;
  resolved: "dark" | "light";
  setTheme: (t: ThemeMode) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function resolve(theme: ThemeMode): "dark" | "light" {
  if (theme === "dark" || theme === "light") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem("diu_theme", theme);
    document.cookie = `diu_theme=${theme};path=/;max-age=31536000;samesite=lax`;
  } catch {
    /* private mode */
  }
}

export function ThemeProvider({
  initial,
  children,
}: {
  initial?: ThemeMode;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(initial ?? "dark");
  const [resolved, setResolved] = useState<"dark" | "light">(() =>
    initial === "light" || initial === "dark" ? initial : "dark"
  );

  useEffect(() => {
    let start: ThemeMode = initial ?? "dark";
    try {
      const stored = localStorage.getItem("diu_theme") as ThemeMode | null;
      if (stored === "system" || stored === "dark" || stored === "light") start = stored;
    } catch {
      /* ignore */
    }
    setThemeState(start);
    apply(start);
    setResolved(resolve(start));
  }, [initial]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setResolved(resolve("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    apply(t);
    setResolved(resolve(t));
  }, []);

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
