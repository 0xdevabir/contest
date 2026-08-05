import type { Metadata } from "next";
import Link from "next/link";
import { Syne, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { getSession } from "@/lib/auth";
import { NavAuth } from "@/components/NavAuth";
import { BrandMark, Wordmark } from "@/components/BrandMark";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["500", "600", "700", "800"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    siteName: BRAND.name,
    type: "website",
  },
};

const FOOTER_LINKS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Practice",
    links: [
      { href: "/problems", label: "All 140 problems" },
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let user = null;
  try {
    user = await getSession();
  } catch {
    user = null;
  }

  return (
    <html lang="en">
      <body
        className={`${syne.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}
        style={
          {
            ["--font-display" as string]: "var(--font-syne), system-ui, sans-serif",
            ["--font-body" as string]: "var(--font-plex-sans), system-ui, sans-serif",
            ["--font-mono" as string]: "var(--font-plex-mono), ui-monospace, monospace",
          } as React.CSSProperties
        }
      >
        <div className="flex min-h-screen flex-col">
          <div className="hidden border-b border-[var(--line-soft)] bg-black/25 lg:block">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-1.5">
              <span className="eyebrow">{BRAND.university}</span>
              <span className="eyebrow flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-blip" />
                Judge online · C (gcc / clang)
              </span>
            </div>
          </div>

          <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <Link href="/" className="flex shrink-0 items-center gap-2.5">
                <BrandMark size={30} />
                <span className="flex flex-col leading-none">
                  <Wordmark className="text-[13.5px] sm:text-lg" />
                  <span className="mt-1 hidden font-mono text-[10px] tracking-[0.16em] text-[var(--muted-dim)] uppercase sm:inline">
                    C practice · live contests
                  </span>
                </span>
              </Link>

              <nav className="flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2 text-sm sm:gap-x-5">
                <Link href="/problems" className="link-quiet">
                  Problems
                </Link>
                <NavAuth user={user} />
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-24 border-t border-[var(--line)] bg-black/25">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
              <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
                <div>
                  <div className="flex items-center gap-2.5">
                    <BrandMark size={28} />
                    <Wordmark className="text-base" />
                  </div>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
                    Exam-style C training and inter-university contests, judged instantly
                    against hidden tests.
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
      </body>
    </html>
  );
}
