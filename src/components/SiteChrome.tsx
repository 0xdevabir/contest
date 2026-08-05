"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { NavAuth } from "@/components/NavAuth";
import { BrandMark, Wordmark } from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";

const FOOTER_LINKS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Practice",
    links: [
      { href: "/problems", label: "All 700 problems" },
      { href: "/sets", label: "All 20 sets" },
      { href: "/sets/1", label: "Start with Set 01" },
    ],
  },
  {
    heading: "Compete",
    links: [
      { href: "/contests", label: "Contests" },
      { href: "/leaderboard", label: "Leaderboards" },
      { href: "/register", label: "Create an account" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/login", label: "Log in" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

/**
 * Public marketing chrome. Admin routes render children alone so the
 * Command Center can own the full viewport with its own sidebar.
 */
export function SiteChrome({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <BrandMark size={28} />
            <Wordmark className="text-[15px] sm:text-[17px]" />
          </Link>

          <nav className="flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2 text-sm sm:gap-x-5">
            <Link href="/problems" className="link-quiet">
              Problems
            </Link>
            <Link href="/sets" className="link-quiet hidden sm:inline">
              Sets
            </Link>
            <NavAuth user={user} />
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-[var(--line)] bg-black/25">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark size={28} />
                <Wordmark className="text-base" />
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
                Exam-style C training and inter-university contests, judged instantly against
                hidden tests.
              </p>
            </div>
            {FOOTER_LINKS.map((group) => (
              <div key={group.heading}>
                <h3 className="eyebrow">{group.heading}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {group.links.map((l) => (
                    <li key={l.href + l.label}>
                      <Link href={l.href} className="link-quiet">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <hr className="rule my-8" />
          <div className="flex flex-col justify-between gap-3 font-mono text-[11px] text-[var(--muted-dim)] sm:flex-row">
            <span>
              © {new Date().getFullYear()} {BRAND.name} · {BRAND.university}
            </span>
            <span>DIU · NSU · AIUB · BRAC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
