"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  getDictionary,
  interpolate,
  normalizeLocale,
  type Dict,
  type Locale,
} from "./";

type LocaleCtx = {
  locale: Locale;
  dict: Dict;
  /** `t(dict.judge.testsPassed, { passed, total })` — no key-path strings, so
   * a rename is a TypeScript error at the call site instead of a silent
   * runtime miss. */
  t: (template: string, params?: Record<string, string | number>) => string;
  setLocale: (next: Locale) => void;
};

const Ctx = createContext<LocaleCtx | null>(null);

function persist(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
  } catch {
    /* private mode — the server-set cookie still covers SSR */
  }
}

export function LocaleProvider({
  initial,
  signedIn = false,
  children,
}: {
  initial?: Locale;
  /** Only signed-in users get their choice written back to the database. */
  signedIn?: boolean;
  children: ReactNode;
}) {
  const locale = normalizeLocale(initial);
  const dict = getDictionary(locale);

  const setLocale = useCallback(
    (next: Locale) => {
      persist(next);
      // A full reload is deliberate: locale is resolved server-side (D1) so
      // every RSC-rendered string — not just this client tree — updates in
      // one pass, with no flash of the old language.
      if (signedIn) {
        void fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: next }),
        })
          .catch(() => {})
          .finally(() => window.location.reload());
        return;
      }
      window.location.reload();
    },
    [signedIn]
  );

  const t = useCallback(
    (template: string, params?: Record<string, string | number>) => interpolate(template, params),
    []
  );

  const value = useMemo<LocaleCtx>(() => ({ locale, dict, t, setLocale }), [locale, dict, t, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useCtx(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Server components and any client tree outside the provider (there
    // shouldn't be one) still get a working default rather than a crash.
    const locale = DEFAULT_LOCALE;
    return { locale, dict: getDictionary(locale), t: interpolate, setLocale: () => {} };
  }
  return ctx;
}

export function useLocale(): Locale {
  return useCtx().locale;
}

export function useDictionary(): Dict {
  return useCtx().dict;
}

/** `const t = useT(); t(t_.judge.testsPassed, { passed, total })` */
export function useT() {
  const { t, dict, locale, setLocale } = useCtx();
  return { t, dict, locale, setLocale };
}
