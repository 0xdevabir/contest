import Link from "next/link";
import type { Prisma, Role, University, UserStatus } from "@prisma/client";
import { CheckCircle2, Search, ShieldCheck, UserRoundX, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { UNIVERSITIES, universityLabel } from "@/lib/universities";
import { UserActions } from "@/components/admin/UserActions";

type Props = {
  searchParams: Promise<{
    q?: string;
    university?: string;
    role?: string;
    status?: string;
    verification?: string;
    page?: string;
  }>;
};

const pageSize = 25;

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();
  const page = Math.max(1, Number(params.page) || 1);
  const university = UNIVERSITIES.some((item) => item.code === params.university)
    ? (params.university as University)
    : undefined;
  const role = ["USER", "ADMIN"].includes(params.role || "")
    ? (params.role as Role)
    : undefined;
  const status = ["ACTIVE", "SUSPENDED"].includes(params.status || "")
    ? (params.status as UserStatus)
    : undefined;

  const where: Prisma.UserWhereInput = {
    ...(params.q?.trim()
      ? {
          OR: [
            { name: { contains: params.q.trim(), mode: "insensitive" } },
            { email: { contains: params.q.trim(), mode: "insensitive" } },
            { studentId: { contains: params.q.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
    ...(university ? { university } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(params.verification === "verified"
      ? { emailVerified: { not: null } }
      : params.verification === "pending"
        ? { emailVerified: null }
        : {}),
  };

  const [users, total, totalUsers, verified, admins, suspended] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        university: true,
        studentId: true,
        department: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { solvedProblems: true, submissions: true, contestRegs: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Identity and access
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Review accounts, verification, university data, roles, and access.
        </p>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UserMetric icon={Users} label="All users" value={totalUsers} />
        <UserMetric icon={CheckCircle2} label="Verified" value={verified} />
        <UserMetric icon={ShieldCheck} label="Administrators" value={admins} />
        <UserMetric icon={UserRoundX} label="Suspended" value={suspended} />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <form className="grid gap-2 border-b border-[var(--line)] p-3 md:grid-cols-[minmax(240px,1fr)_repeat(4,auto)_auto]">
          <label className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden="true"
            />
            <span className="sr-only">Search users</span>
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Name, email, or student ID…"
              className="w-full rounded-lg border border-[var(--line)] bg-[#0a0f16] py-2 pl-9 pr-3 text-xs outline-none focus:border-[var(--accent-dim)]"
            />
          </label>
          <Filter name="university" value={params.university} label="University">
            {UNIVERSITIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.shortName}
              </option>
            ))}
          </Filter>
          <Filter name="role" value={params.role} label="Role">
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </Filter>
          <Filter name="status" value={params.status} label="Status">
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </Filter>
          <Filter name="verification" value={params.verification} label="Verification">
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
          </Filter>
          <button type="submit" className="btn btn-ghost !py-2 !text-xs">
            Apply
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">University</th>
                <th className="px-4 py-3 font-medium">Access</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.05] font-semibold">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="max-w-56 truncate font-medium hover:text-[var(--accent)]"
                          >
                            {user.name}
                          </Link>
                          {user.id === session?.id && (
                            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                              YOU
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 max-w-64 truncate text-[10px] text-[var(--muted)]">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{universityLabel(user.university)}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                      {[user.department, user.studentId].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={user.role === "ADMIN" ? "info" : "neutral"}>
                        {user.role}
                      </Badge>
                      <Badge tone={user.status === "ACTIVE" ? "success" : "danger"}>
                        {user.status}
                      </Badge>
                      <Badge tone={user.emailVerified ? "success" : "warning"}>
                        {user.emailVerified ? "VERIFIED" : "PENDING"}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[10px] text-[var(--muted)]">
                    <p>{user._count.solvedProblems} solved</p>
                    <p className="mt-1">
                      {user._count.submissions} runs · {user._count.contestRegs} contests
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-[10px] text-[var(--muted)]">
                    {user.lastLoginAt ? relativeTime(user.lastLoginAt) : "Never"}
                    <p className="mt-1">Joined {formatDate(user.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <UserActions
                      userId={user.id}
                      role={user.role}
                      status={user.status}
                      verified={Boolean(user.emailVerified)}
                      isSelf={user.id === session?.id}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-[var(--muted)]">
                    No users match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          <span>
            {total.toLocaleString()} result{total === 1 ? "" : "s"} · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <PageLink page={page - 1} disabled={page <= 1} params={params}>
              Previous
            </PageLink>
            <PageLink page={page + 1} disabled={page >= pages} params={params}>
              Next
            </PageLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function Filter({
  name,
  value,
  label,
  children,
}: {
  name: string;
  value?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value || ""}
        className="w-full rounded-lg border border-[var(--line)] bg-[#0a0f16] px-3 py-2 text-xs outline-none"
      >
        <option value="">All {label.toLowerCase()}</option>
        {children}
      </select>
    </label>
  );
}

function UserMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <Icon size={16} className="text-[var(--muted)]" aria-hidden="true" />
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value.toLocaleString()}</p>
    </article>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    neutral: "border-[var(--line)] text-[var(--muted)]",
    success: "border-[var(--accent-dim)] text-[var(--accent)]",
    warning: "border-[var(--warn)]/30 text-[var(--warn)]",
    danger: "border-[var(--danger)]/30 text-[var(--danger)]",
    info: "border-[var(--info)]/30 text-[var(--info)]",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${styles[tone]}`}>
      {children}
    </span>
  );
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number;
  disabled: boolean;
  params: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="rounded-lg border border-[var(--line)] px-3 py-1.5 opacity-40">{children}</span>;
  }
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== "page") query.set(key, value);
  });
  query.set("page", String(page));
  return (
    <Link
      href={`/admin/users?${query}`}
      className="rounded-lg border border-[var(--line)] px-3 py-1.5 hover:text-[var(--text)]"
    >
      {children}
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function relativeTime(date: Date) {
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

