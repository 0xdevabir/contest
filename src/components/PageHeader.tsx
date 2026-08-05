import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
};

/**
 * The single page-header pattern. Every top-level page uses this so the type
 * size, baseline rhythm, and the hairline under the title stay identical
 * between /problems, /contests, /leaderboard and /sets.
 */
export function PageHeader({ eyebrow, title, lead, actions }: Props) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--line-soft)] pb-5 sm:gap-x-10 sm:pb-7">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1
          className={`font-display text-[1.65rem] leading-[1.08] font-bold sm:text-[2.3rem] ${
            eyebrow ? "mt-2.5" : ""
          }`}
        >
          {title}
        </h1>
        {lead ? (
          <p className="measure mt-3.5 text-[15px] leading-relaxed text-[var(--muted)]">
            {lead}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

