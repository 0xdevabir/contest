"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, User, X } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { NavAuth } from "@/components/NavAuth";
import { BrandMark, Wordmark } from "@/components/BrandMark";
import { ThemeMenu } from "@/components/ThemePicker";
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
      { href: "/profile", label: "Your profile" },
      { href: "/login", label: "Log in" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

const MOBILE_LINKS = [
  { href: "/problems", label: "Problems" },
  { href: "/sets", label: "Sets" },
  { href: "/contests", label: "Contests" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
          <Link
            href="/"
            aria-label={`${BRAND.name} home`}
            className="flex min-w-0 shrink items-center gap-2 sm:gap-2.5"
          >
            <BrandMark size={26} />
            <Wordmark className="truncate text-[14px] sm:text-[17px]" />
          </Link>

          <nav
            aria-label="Primary"
            className="hidden items-center justify-end gap-x-5 text-sm md:flex"
          >
            <Link href="/problems" className="link-quiet">
              Problems
            </Link>
            <Link href="/sets" className="link-quiet">
              Sets
            </Link>
            <Link href="/contests" className="link-quiet">
              Contests
            </Link>
            <Link href="/leaderboard" className="link-quiet">
              Leaderboard
            </Link>
            <ThemeMenu />
            <NavAuth user={user} />
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeMenu />
            {!user ? (
              <Link href="/login" className="btn btn-ghost !px-3 !py-2 !text-xs">
                Log in
              </Link>
            ) : (
              <Link
                href="/profile"
                aria-label="Your profile"
                title="Your profile"
                className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
              >
                <User size={16} aria-hidden />
              </Link>
            )}
            <button
              type="button"
              className="btn btn-ghost !px-2.5 !py-2"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 top-[calc(3.25rem+env(safe-area-inset-top))] z-40 bg-[var(--overlay)] md:hidden"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <div
              id="mobile-nav"
              className="absolute inset-x-0 top-full z-50 border-b border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-4 shadow-2xl md:hidden"
            >
              <nav aria-label="Mobile primary" className="flex flex-col gap-1">
                {MOBILE_LINKS.filter((link) => link.href !== "/profile" || user).map((link) => {
                  const active =
                    pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`rounded-lg px-3 py-3 text-sm ${
                        active
                          ? "bg-[var(--accent-surface)] text-[var(--accent)]"
                          : "text-[var(--text)] hover:bg-[var(--hover)]"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
                {user?.role === "ADMIN" && (
                  <Link
                    href="/admin"
                    className="rounded-lg px-3 py-3 text-sm text-[var(--accent)] hover:bg-[var(--hover)]"
                  >
                    Admin
                  </Link>
                )}
              </nav>
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                {!user ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/login" className="btn btn-ghost !py-2.5 !text-sm">
                      Log in
                    </Link>
                    <Link href="/register" className="btn btn-primary !py-2.5 !text-sm">
                      Register
                    </Link>
                  </div>
                ) : (
                  <MobileLogout />
                )}
              </div>
            </div>
          </>
        )}
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer
        aria-labelledby="footer-heading"
        className="mt-12 border-t border-[var(--line)] bg-[var(--sunken)] pb-[env(safe-area-inset-bottom)] sm:mt-16"
      >
        <h2 id="footer-heading" className="sr-only">
          Site footer
        </h2>
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="grid gap-8 sm:gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
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

function MobileLogout() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="btn btn-ghost w-full !py-2.5 !text-sm"
    >
      Log out
    </button>
  );
}



