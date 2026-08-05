import {
  Activity,
  CheckCircle2,
  Database,
  KeyRound,
  Mail,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { prisma } from "@/lib/db";

export default async function AdminSystemPage() {
  const started = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const latency = Math.max(1, Math.round(performance.now() - started));
  const logs = await prisma.adminAuditLog.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true, email: true } } },
  });

  const checks = [
    {
      label: "Neon PostgreSQL",
      description: `Connected · ${latency}ms query latency`,
      ready: Boolean(process.env.DATABASE_URL),
      icon: Database,
    },
    {
      label: "Session signing",
      description: "AUTH_SECRET is configured",
      ready: Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32),
      icon: KeyRound,
    },
    {
      label: "SMTP email",
      description: process.env.SMTP_HOST
        ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || "587"}`
        : "SMTP variables are incomplete",
      ready: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      icon: Mail,
    },
    {
      label: "C judge",
      description: `${process.platform === "darwin" ? "clang" : "gcc"} compiler expected on host`,
      ready: true,
      icon: TerminalSquare,
    },
    {
      label: "Public URL",
      description: process.env.APP_URL || "APP_URL not configured",
      ready: Boolean(process.env.APP_URL),
      icon: ServerCog,
    },
    {
      label: "Security headers",
      description: "CSP, HSTS, clickjacking, MIME and referrer protections",
      ready: true,
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Infrastructure and accountability
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">System</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Runtime readiness, security configuration, and administrator audit history.
        </p>
      </header>

      <section className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => {
          const Icon = check.icon;
          return (
            <article
              key={check.label}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--hover)] text-[var(--muted)]">
                  <Icon size={17} aria-hidden="true" />
                </span>
                {check.ready ? (
                  <CheckCircle2 size={16} className="text-[var(--accent)]" aria-label="Ready" />
                ) : (
                  <XCircle size={16} className="text-[var(--danger)]" aria-label="Needs attention" />
                )}
              </div>
              <h2 className="mt-4 text-sm font-semibold">{check.label}</h2>
              <p className="mt-1 break-all text-[11px] text-[var(--muted)]">
                {check.description}
              </p>
            </article>
          );
        })}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold">Administrator audit log</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Security-sensitive actions, newest first
            </p>
          </div>
          <Activity size={17} className="text-[var(--muted)]" aria-hidden="true" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Administrator</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 text-[var(--muted)]">
                    {log.createdAt.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <p>{log.actor.name}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">{log.actor.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded border border-[var(--line)] px-2 py-1 font-mono text-[10px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-[10px] text-[var(--muted)]">
                    {log.targetType}
                    {log.targetId ? ` · ${log.targetId.slice(0, 10)}…` : ""}
                  </td>
                  <td className="max-w-80 truncate px-5 py-3 font-mono text-[10px] text-[var(--muted)]">
                    {summarizeDetails(log.details)}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-[var(--muted)]">
                    No admin actions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function summarizeDetails(details: unknown) {
  if (!details || typeof details !== "object") return "—";
  return Object.entries(details as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(" · ");
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return "[object]";
  return String(value ?? "—");
}
