import { en, type Dict } from "./en";
import { bn } from "./bn";

export type { Dict } from "./en";

export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "diu_locale";
export const LOCALE_STORAGE_KEY = "diu_locale";

const DICTIONARIES: Record<Locale, Dict> = { en, bn };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function normalizeLocale(v: unknown): Locale {
  if (typeof v !== "string") return DEFAULT_LOCALE;
  const lower = v.toLowerCase();
  return isLocale(lower) ? lower : DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Resolution order (D1): the user's saved preference wins, then the locale
 * cookie (set on every change so SSR has something before login), then the
 * browser's `Accept-Language` header, then English.
 */
export function resolveLocale(opts: {
  userLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (opts.userLocale && isLocale(opts.userLocale)) return opts.userLocale;
  if (opts.cookieLocale && isLocale(opts.cookieLocale)) return opts.cookieLocale;
  if (opts.acceptLanguage) {
    const preferred = opts.acceptLanguage
      .split(",")
      .map((part) => part.split(";")[0]?.trim().toLowerCase().slice(0, 2))
      .find((lang) => isLocale(lang));
    if (preferred) return preferred as Locale;
  }
  return DEFAULT_LOCALE;
}

/** Substitutes `{token}` placeholders. Missing params are left as-is (visible bug, not a crash). */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}

/** Locale-aware display label, for things like the toggle button. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  bn: "বাংলা",
};

// Client-only pieces (React context/provider/hooks) live in ./LocaleProvider
// and are imported from there directly — this module must stay importable
// from server-only code (e.g. src/lib/auth.ts) without pulling in a
// "use client" boundary.
