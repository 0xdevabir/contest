import type { Metadata } from "next";
import Link from "next/link";
import { Syne, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
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
  title: "Contest Hub — C Practice",
  description:
    "No-login C programming practice: 20 exam-style sets, instant sample judging.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <div className="min-h-screen">
          <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/" className="group flex items-baseline gap-2">
                <span className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
                  Contest<span className="text-[var(--accent)]">Hub</span>
                </span>
                <span className="hidden text-xs text-[var(--muted)] sm:inline">
                  C · no login · instant judge
                </span>
              </Link>
              <nav className="flex items-center gap-3 text-sm text-[var(--muted)]">
                <Link href="/sets" className="transition-colors hover:text-[var(--text)]">
                  Sets
                </Link>
                <Link href="/sets/1" className="btn btn-primary !px-3 !py-2 !text-xs">
                  Start Set 1
                </Link>
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
