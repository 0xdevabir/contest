import { computeSloRows, type SloRow } from "@/lib/slo";
import { sendMail } from "@/lib/mail";
import { log } from "@/lib/log";

/**
 * docs/phases/PHASE-13-scale-ops.md Part 5 — cron checker for SLO breaches.
 * Every 5 minutes: compute the SLO table, and for anything in `breach`, send
 * an email (reusing `src/lib/mail.ts`'s `sendMail`) and post to a Telegram
 * webhook. Both channels no-op with a logged warning when their env vars are
 * unset — this environment has neither SMTP nor Telegram credentials for
 * this alerting path provisioned, so it must never throw on a missing config.
 */
const TICK_INTERVAL_MS = 5 * 60_000;

async function sendBreachEmail(breaches: SloRow[]): Promise<void> {
  const to = process.env.SLO_ALERT_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) {
    log.warn("SLO breach email skipped — no SLO_ALERT_EMAIL/ADMIN_EMAIL configured", {
      breachCount: breaches.length,
    });
    return;
  }
  const list = breaches.map((b) => `${b.slo}: ${b.value ?? "?"}${b.unit ?? ""} (target ${b.target})`).join("\n");
  try {
    await sendMail({
      to,
      subject: `[SLO breach] ${breaches.length} SLO(s) breaching target`,
      text: `The following SLOs are currently in breach:\n\n${list}\n\nSee /admin/system for the full table and docs/RUNBOOK.md for remediation.`,
      html: `<p>The following SLOs are currently in breach:</p><ul>${breaches
        .map((b) => `<li>${b.slo}: ${b.value ?? "?"}${b.unit ?? ""} (target ${b.target})</li>`)
        .join("")}</ul><p>See <code>/admin/system</code> for the full table and <code>docs/RUNBOOK.md</code> for remediation.</p>`,
    });
  } catch (err) {
    // SMTP not configured, or rejected — this is best-effort alerting, not
    // the thing being alerted on, so a failure here must not crash the tick.
    log.error("SLO breach email failed to send", { breachCount: breaches.length }, err);
  }
}

async function sendBreachTelegram(breaches: SloRow[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    log.warn("SLO breach Telegram alert skipped — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID unset", {
      breachCount: breaches.length,
    });
    return;
  }
  const text = [
    `SLO breach (${breaches.length}):`,
    ...breaches.map((b) => `• ${b.slo}: ${b.value ?? "?"}${b.unit ?? ""} (target ${b.target})`),
  ].join("\n");
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      log.error("SLO breach Telegram alert failed", { status: res.status, body: await res.text().catch(() => "") });
    }
  } catch (err) {
    log.error("SLO breach Telegram alert failed", { breachCount: breaches.length }, err);
  }
}

async function tick(): Promise<void> {
  try {
    const rows = await computeSloRows();
    const breaches = rows.filter((r) => r.status === "breach");
    if (breaches.length === 0) return;

    log.warn("SLO breach detected", { breaches: breaches.map((b) => b.key) });
    await Promise.all([sendBreachEmail(breaches), sendBreachTelegram(breaches)]);
  } catch (err) {
    log.error("SLO alert tick failed", {}, err);
  }
}

async function main(): Promise<void> {
  log.info("SLO alert scheduler started", { intervalMs: TICK_INTERVAL_MS });
  await tick();
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);

  const shutdown = () => {
    log.info("SLO alert scheduler shutting down", {});
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("SLO alert scheduler crashed on startup", {}, err);
  process.exit(1);
});
