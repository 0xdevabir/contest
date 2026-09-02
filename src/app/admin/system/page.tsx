import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  KeyRound,
  Mail,
  ServerCog,
  ShieldCheck,
  TerminalSquare,
  Timer,
  XCircle,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { isEnabled } from "@/lib/flags";
import { getQueueStats } from "@/lib/queue-stats";

export default async function AdminSystemPage() {
  const started = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const latency = Math.max(1, Math.round(performance.now() - started));
  const logs = await prisma.adminAuditLog.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true, email: true } } },
  });

  const judgeQueueOn = await isEnabled("judgeQueue");
  const queueStats = judgeQueueOn ? await getQueueStats() : null;

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

      {queueStats && (
        <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-bold">Judge queue</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Phase 4 async judging — docs/RUNBOOK.md § Judge queue for alert diagnosis
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                queueStats.redisUp
                  ? "border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent)]"
                  : "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"
              }`}
            >
              {queueStats.redisUp ? <CheckCircle2 size={13} aria-hidden /> : <XCircle size={13} aria-hidden />}
              Redis {queueStats.redisUp ? "up" : "down"}
            </span>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
            <QueueStat
              icon={Gauge}
              label="Queue depth"
              value={String(queueStats.depthByPriority.reduce((s, d) => s + d.count, 0))}
              sub={queueStats.depthByPriority.map((d) => `p${d.priority}: ${d.count}`).join(" · ") || "empty"}
            />
            <QueueStat
              icon={Timer}
              label="Oldest queued job"
              value={queueStats.oldestQueuedAgeSec != null ? `${queueStats.oldestQueuedAgeSec}s` : "—"}
              warn={queueStats.oldestQueuedAgeSec != null && queueStats.oldestQueuedAgeSec > 60}
            />
            <QueueStat
              icon={Activity}
              label="Judged / min"
              value={String(queueStats.throughput.perMin1)}
              sub={`${queueStats.throughput.perMin5}/5m · ${queueStats.throughput.perMin15}/15m`}
            />
            <QueueStat
              icon={AlertTriangle}
              label="IE rate (5m)"
              value={`${queueStats.ieRatePercent}%`}
              warn={queueStats.ieRatePercent > 1}
            />
          </div>

          <div className="border-t border-[var(--line)] px-5 py-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
              <Cpu size={13} aria-hidden />
              Worker roster
            </p>
            {queueStats.workers.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No workers have registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-xs">
                  <thead className="text-[10px] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="py-1.5 pr-4 font-medium">Worker</th>
                      <th className="py-1.5 pr-4 font-medium">Concurrency</th>
                      <th className="py-1.5 pr-4 font-medium">Judged</th>
                      <th className="py-1.5 pr-4 font-medium">Failed</th>
                      <th className="py-1.5 font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {queueStats.workers.map((w) => (
                      <tr key={w.id}>
                        <td className="py-1.5 pr-4 font-mono">{w.hostname}</td>
                        <td className="py-1.5 pr-4">{w.concurrency}</td>
                        <td className="py-1.5 pr-4">{w.judgedCount}</td>
                        <td className="py-1.5 pr-4">{w.failedCount}</td>
                        <td className={`py-1.5 ${w.stale ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
                          {w.stale ? "Stale — " : ""}
                          {w.lastSeenAt.toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {queueStats.stalledOrRequeuedCount > 0 && (
              <p className="mt-3 text-xs text-[var(--warn)]">
                {queueStats.stalledOrRequeuedCount} submission(s) currently queued after a requeue.
              </p>
            )}
          </div>
        </section>
      )}

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

function QueueStat({
  icon: Icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        <Icon size={12} aria-hidden />
        {label}
      </div>
      <p className={`mt-1.5 font-mono text-xl font-bold ${warn ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--muted)]">{sub}</p>}
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
