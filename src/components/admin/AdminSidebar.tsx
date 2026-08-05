"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Braces,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { BrandMark, Wordmark } from "@/components/BrandMark";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

const navigation: NavGroup[] = [
  {
    heading: "Operate",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/contests", label: "Contests", icon: Trophy },
      { href: "/admin/problems", label: "Problems", icon: BookOpen },
      { href: "/admin/submissions", label: "Submissions", icon: Braces },
    ],
  },
  {
    heading: "People",
    items: [{ href: "/admin/users", label: "Users", icon: Users }],
  },
  {
    heading: "Insight",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/system", label: "System", icon: Activity },
    ],
  },
];

export function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--line)] bg-[#0d131c] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <BrandMark size={24} />
          <div>
            <p className="font-display text-sm font-bold">Command Center</p>
            <p className="max-w-40 truncate text-[10px] text-[var(--muted)]">{adminName}</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost !px-2.5 !py-2"
          aria-expanded={open}
          aria-controls="admin-sidebar"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--line)] bg-[#0d131c] transition-transform duration-200 lg:static lg:z-auto lg:min-h-screen lg:w-64 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="hidden border-b border-[var(--line)] px-5 py-5 lg:block">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg border border-[var(--accent-dim)] bg-[rgba(62,207,142,0.1)] text-[var(--accent)]">
              <ShieldCheck size={18} aria-hidden />
            </span>
            <div>
              <p className="font-display text-sm font-bold">Command Center</p>
              <p className="max-w-36 truncate text-xs text-[var(--muted)]">{adminName}</p>
            </div>
          </Link>
          <div className="mt-4 flex items-center gap-2">
            <BrandMark size={18} />
            <Wordmark className="text-xs" />
          </div>
        </div>

        <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 py-4">
          {navigation.map((group) => (
            <div key={group.heading} className="mb-5">
              <p className="px-3 pb-2 font-mono text-[10px] tracking-[0.14em] text-[var(--muted-dim)] uppercase">
                {group.heading}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? "bg-[rgba(62,207,142,0.11)] text-[var(--accent)]"
                            : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--text)]"
                        }`}
                      >
                        <Icon size={17} strokeWidth={1.8} aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--line)] p-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text)]"
          >
            <ArrowLeft size={15} aria-hidden />
            Back to site
          </Link>
        </div>
      </aside>
    </>
  );
}
