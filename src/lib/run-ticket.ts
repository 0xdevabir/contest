import { createHmac, timingSafeEqual } from "crypto";

/**
 * The runner secret is shared between this app and the execution service and
 * must never reach the browser. Clients instead get a short-lived signed ticket
 * that the runner verifies, so a leaked ticket is useless within minutes.
 */

const TICKET_TTL_MS = 2 * 60 * 1000;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function runnerSecret(): string | null {
  return process.env.RUNNER_TOKEN?.trim() || null;
}

export function issueRunTicket(subject: string): string | null {
  const secret = runnerSecret();
  if (!secret) return null;

  const payload = b64url(
    Buffer.from(JSON.stringify({ sub: subject, exp: Date.now() + TICKET_TTL_MS }), "utf8")
  );
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyRunTicket(ticket: string): { sub: string } | null {
  const secret = runnerSecret();
  if (!secret) return null;

  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return null;

  const expected = b64url(createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub: string;
      exp: number;
    };
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return { sub: data.sub };
  } catch {
    return null;
  }
}
