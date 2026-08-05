"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Braces,
  LayoutDashboard,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

const navigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/contests", label: "Contests", icon: Trophy },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/submissions", label: "Submissions", icon: Braces },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/system", label: "System", icon: Activity },
];

export function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname();

  return (
    <aside className="border-b border-[var(--line)] bg-[#0d131c] lg:min-h-[calc(100vh-57px)] lg:w-64 lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5 lg:py-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg border border-[var(--accent-dim)] bg-[rgba(62,207,142,0.1)] text-[var(--accent)]">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-bold">Command Center</p>
            <p className="max-w-36 truncate text-xs text-[var(--muted)]">{adminName}</p>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)] lg:mt-5"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Back to site
        </Link>
      </div>

      <nav
        aria-label="Admin navigation"
        className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible lg:px-3"
      >
        {navigation.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-[rgba(62,207,142,0.11)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
