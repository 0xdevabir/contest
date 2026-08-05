"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  isThemeMode,
  normalizeThemeMode,
  resolveTheme,
  type Theme,
  type ThemeId,
  type ThemeMode,
} from "@/lib/theme";

type ThemeCtx = {
  /** What the user picked — may be `system`. */
  mode: ThemeMode;
  /** The theme actually painted. */
  themeId: ThemeId;
  theme: Theme;
  /** Convenience for anything that only cares about dark vs light. */
  scheme: "dark" | "light";
  setTheme: (mode: ThemeMode) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function prefersLight(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function persist(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    document.cookie = `${THEME_COOKIE}=${mode};path=/;max-age=31536000;samesite=lax`;
  } catch {
    /* private mode — the cookie set by the server still covers SSR */
  }
}

/** Keeps the browser chrome (mobile address bar) in step with the theme. */
function syncMetaThemeColor(color: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

export function ThemeProvider({
  initial,
  signedIn = false,
  children,
}: {
  initial?: ThemeMode;
  /** Only signed-in users get their choice written back to the database. */
  signedIn?: boolean;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => normalizeThemeMode(initial));
  const [systemLight, setSystemLight] = useState(false);

  // localStorage wins over the cookie on first paint: it is the most recent
  // choice on this device even if the session cookie is stale.
  useEffect(() => {
    let start = normalizeThemeMode(initial);
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeMode(stored)) start = stored;
    } catch {
      /* ignore */
    }
    setSystemLight(prefersLight());
    setMode(start);
    persist(start);
  }, [initial]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemLight(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const themeId = resolveTheme(mode, systemLight);
  const theme = THEMES[themeId] ?? THEMES[DEFAULT_THEME];

  useEffect(() => {
    syncMetaThemeColor(theme.palette.bg);
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setMode(next);
      persist(next);
      if (!signedIn) return;
      // Fire and forget: the cookie already made the choice durable, this just
      // carries it to the user's other devices.
      void fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      }).catch(() => {});
    },
    [signedIn]
  );

  const value = useMemo<ThemeCtx>(
    () => ({ mode, themeId, theme, scheme: theme.scheme, setTheme }),
    [mode, themeId, theme, setTheme]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
