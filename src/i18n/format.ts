import type { Locale } from "./";

/** IANA zone for every date/time render — see D3. */
export const APP_TIMEZONE = "Asia/Dhaka";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/**
 * Bangla numerals for *narrative prose only* — never for code, verdicts,
 * timings, ranks or scores (D3). Those call `String(n)` / stay as given.
 */
export function proseNumber(n: number, locale: Locale): string {
  const s = String(Math.trunc(n));
  if (locale !== "bn") return s;
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/**
 * Data-context number: always Latin digits, locale-independent. Exists so
 * call sites read as a deliberate choice rather than an accidental
 * `toLocaleString()` that would silently pick up Bangla numerals.
 */
export function dataNumber(n: number): string {
  return String(n);
}

/** Narrative date, e.g. "৪ সেপ্টেম্বর, ২০২৬" / "September 4, 2026". */
export function formatDate(date: Date | number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    dateStyle: "long",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

/** Narrative date + time. */
export function formatDateTime(date: Date | number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIMEZONE,
  }).format(date);
}

/**
 * Data-context timestamp (submission tables, gradebook, logs): always Latin
 * numerals regardless of locale, per D3's "data stays Latin" rule.
 */
export function formatDateTimeData(date: Date | number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: APP_TIMEZONE,
    numberingSystem: "latn",
  }).format(date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

/** "in 5 minutes" / "৫ মিনিটে" — narrative, so it uses `proseNumber`'s locale rule. */
export function formatRelativeTime(ms: number, locale: Locale): string {
  const seconds = Math.round(ms / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    numeric: "auto",
  });
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= unitSeconds || unit === "second") {
      const value = Math.round(seconds / unitSeconds);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(seconds, "second");
}

/** Countdown string for contest start/end badges, e.g. "2h 14m". Data-context: Latin only. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Chooses between two pre-translated strings by count — no ICU parser needed for 2 locales. */
export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}
