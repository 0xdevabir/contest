import { DollarSign, Gauge, Layers, Users } from "lucide-react";
import { estimateCurrentScale, type ScaleTier } from "@/lib/cost";
import { getAiUsageSummary } from "@/lib/ai/usage";

const TIER_LABEL: Record<ScaleTier, string> = {
  "500": "500 users",
  "5000": "5,000 users",
  "25000": "25,000 users",
};

export default async function AdminCostsPage() {
  const [scale, aiUsage] = await Promise.all([estimateCurrentScale(), getAiUsageSummary()]);

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Cost model, not live billing
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Costs</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Estimated monthly spend from the Appendix I cost model
          (docs/ULTIMATE_PLAN.md), mapped onto the platform&apos;s current scale.
          No billing API credentials are configured for any provider — these
          figures are a model, not a reconciled invoice.
        </p>
      </header>

      <section className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Users"
          value={scale.userCount.toLocaleString()}
        />
        <StatCard
          icon={Gauge}
          label="Submissions"
          value={scale.submissionCount.toLocaleString()}
        />
        <StatCard
          icon={Layers}
          label="Scale tier"
          value={TIER_LABEL[scale.tier]}
          sub="Nearest Appendix I tier at or above current user count"
        />
        <StatCard
          icon={DollarSign}
          label="Estimated monthly cost"
          value={`$${scale.totalMonthlyCostUsd.toLocaleString()}`}
          sub={`~$${scale.costPerThousandSubmissionsUsd != null ? scale.costPerThousandSubmissionsUsd.toFixed(2) : "—"} / 1,000 submissions`}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-display text-lg font-bold">Month-to-date by component</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Appendix I model figures at the {TIER_LABEL[scale.tier]} tier — the current tier&apos;s
            column is highlighted; the other two are shown for context as the platform grows.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Component</th>
                <th
                  className={`px-5 py-3 font-medium ${scale.tier === "500" ? "text-[var(--accent)]" : ""}`}
                >
                  500 users
                </th>
                <th
                  className={`px-5 py-3 font-medium ${scale.tier === "5000" ? "text-[var(--accent)]" : ""}`}
                >
                  5,000 users
                </th>
                <th
                  className={`px-5 py-3 font-medium ${scale.tier === "25000" ? "text-[var(--accent)]" : ""}`}
                >
                  25,000 users
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {scale.components.map((component) => (
                <tr key={component.key}>
                  <td className="px-5 py-3">
                    <p>{component.label}</p>
                    {component.note && (
                      <p className="mt-0.5 max-w-md text-[10px] text-[var(--muted)]">{component.note}</p>
                    )}
                  </td>
                  <td
                    className={`px-5 py-3 font-mono ${scale.tier === "500" ? "font-semibold text-[var(--text)]" : "text-[var(--muted)]"}`}
                  >
                    ${component.costByTier["500"]}
                  </td>
                  <td
                    className={`px-5 py-3 font-mono ${scale.tier === "5000" ? "font-semibold text-[var(--text)]" : "text-[var(--muted)]"}`}
                  >
                    ${component.costByTier["5000"]}
                  </td>
                  <td
                    className={`px-5 py-3 font-mono ${scale.tier === "25000" ? "font-semibold text-[var(--text)]" : "text-[var(--muted)]"}`}
                  >
                    ${component.costByTier["25000"]}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--line)] font-semibold">
                <td className="px-5 py-3">Total</td>
                <td className={`px-5 py-3 font-mono ${scale.tier === "500" ? "text-[var(--accent)]" : ""}`}>
                  ${scale.components.reduce((s, c) => s + c.costByTier["500"], 0)}
                </td>
                <td className={`px-5 py-3 font-mono ${scale.tier === "5000" ? "text-[var(--accent)]" : ""}`}>
                  ${scale.components.reduce((s, c) => s + c.costByTier["5000"], 0)}
                </td>
                <td className={`px-5 py-3 font-mono ${scale.tier === "25000" ? "text-[var(--accent)]" : ""}`}>
                  ${scale.components.reduce((s, c) => s + c.costByTier["25000"], 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-display text-lg font-bold">AI spend (Phase 15)</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Live, not modeled — the real cost estimate from every AiJob&apos;s Anthropic usage. See{" "}
            <code>src/lib/ai/client.ts</code> for the per-token rate assumptions and{" "}
            <code>src/lib/ai/budget.ts</code> for the per-institution cap this enforces before every call.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard icon={DollarSign} label="Total AI spend" value={`$${(aiUsage.totalCostCents / 100).toFixed(2)}`} />
          <StatCard
            icon={Gauge}
            label="Draft acceptance rate"
            value={aiUsage.acceptanceRate != null ? `${(aiUsage.acceptanceRate * 100).toFixed(0)}%` : "—"}
            sub="Of AiJob rows a human has reviewed"
          />
          <StatCard
            icon={Layers}
            label="Institutions with a budget"
            value={aiUsage.budgets.length.toLocaleString()}
          />
        </div>
        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="border-b border-[var(--line)] text-[10px] uppercase text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Feature</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Jobs</th>
                <th className="px-5 py-3 font-medium">Cost</th>
                <th className="px-5 py-3 font-medium">Cached tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {aiUsage.byKindStatus.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-[var(--muted)]">
                    No AI jobs yet.
                  </td>
                </tr>
              )}
              {aiUsage.byKindStatus.map((row) => (
                <tr key={`${row.kind}:${row.status}`}>
                  <td className="px-5 py-3">{row.kind}</td>
                  <td className="px-5 py-3">{row.status}</td>
                  <td className="px-5 py-3 font-mono">{row.count}</td>
                  <td className="px-5 py-3 font-mono">${(row.costCents / 100).toFixed(2)}</td>
                  <td className="px-5 py-3 font-mono">{row.cachedTokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-5 text-[11px] text-[var(--muted)]">
        Figures in the component table above are the static Appendix I model, not live billing data — no billing
        API is wired up for any infrastructure provider. The AI spend section is different: it is a real
        estimate computed from Anthropic usage on every AiJob row (see the per-token rates in
        `src/lib/ai/client.ts`), not a reconciled invoice either, but at least backed by actual calls made. The
        dominant infrastructure scaling cost is judge CPU, which is lumpy (a midterm needs capacity for ten
        minutes a week); see docs/RUNBOOK.md for manual pre-scaling and `src/lib/autoscale.ts` for queue-depth
        autoscaling.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
        <Icon size={12} aria-hidden />
        {label}
      </div>
      <p className="mt-1.5 font-mono text-xl font-bold text-[var(--text)]">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--muted)]">{sub}</p>}
    </article>
  );
}
