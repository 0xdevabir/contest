"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Braces,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Sparkles,
  Trophy,
} from "lucide-react";

const NAV = [
  { href: "/profile", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/profile/progress", label: "Progress", icon: Trophy },
  { href: "/profile/insights", label: "Insights", icon: Sparkles },
  { href: "/profile/submissions", label: "Submissions", icon: Braces },
  { href: "/profile/settings", label: "Settings", icon: Settings },
];

export function ProfileNav({
  name,
  teaching,
}: {
  name: string;
  teaching?: { visible: boolean; pending: boolean };
}) {
  const pathname = usePathname();

  const nav = teaching?.visible
    ? [...NAV.slice(0, 1), { href: "/profile/teaching", label: "Teaching", icon: GraduationCap }, ...NAV.slice(1)]
    : NAV;

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
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--accent-surface)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={15} aria-hidden />
              {label}
              {href === "/profile/teaching" && teaching?.pending && (
                <span
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-[var(--warn)]"
                  title="Teacher application pending approval"
                />
              )}
            </Link>
          );
        })}
        <Link
          href="/leaderboard"
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          <Activity size={15} aria-hidden />
          Leaderboard
        </Link>
      </nav>
    </aside>
  );
}
