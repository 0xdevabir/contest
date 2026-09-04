"use client";

import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABEL } from "@/i18n";
import { useT } from "@/i18n/LocaleProvider";

/** Compact EN/BN switch for the site header. */
export function LocaleToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useT();

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg border border-[var(--line)] p-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      <Languages size={13} className="ml-1.5 text-[var(--muted)]" aria-hidden />
      {LOCALES.map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(code)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-[var(--accent-surface)] text-[var(--accent)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {LOCALE_LABEL[code]}
          </button>
        );
      })}
    </div>
  );
}
