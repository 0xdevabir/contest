"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Braces,
  LayoutDashboard,
  Settings,
  Trophy,
} from "lucide-react";

const NAV = [
  { href: "/profile", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/profile/progress", label: "Progress", icon: Trophy },
  { href: "/profile/submissions", label: "Submissions", icon: Braces },
  { href: "/profile/settings", label: "Settings", icon: Settings },
];

export function ProfileNav({ name }: { name: string }) {
  const pathname = usePathname();

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="mb-4">
        <p className="eyebrow">Your space</p>
        <p className="mt-1 truncate font-display text-lg font-bold">{name}</p>
      </div>
      <nav
        aria-label="Profile"
        className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[rgba(62,207,142,0.12)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-white/[0.03] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={15} aria-hidden />
              {label}
            </Link>
          );
        })}
        <Link
          href="/leaderboard"
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-white/[0.03] hover:text-[var(--text)]"
        >
          <Activity size={15} aria-hidden />
          Leaderboard
        </Link>
      </nav>
    </aside>
  );
}
