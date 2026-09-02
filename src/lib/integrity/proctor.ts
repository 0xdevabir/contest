import { z } from "zod";
import { prisma } from "../db";
import { consume, retryAfterSeconds } from "../ratelimit";
import { RateLimitError, ValidationError } from "../errors";

/** D4's event taxonomy. Never a free-text field — `meta` is bounded to
 * durations/lengths only, checked below, so a client can't smuggle
 * clipboard/screen content through this endpoint. */
const EVENT_TYPES = [
  "blur",
  "focus",
  "hidden",
  "visible",
  "paste",
  "copy",
  "fullscreen-exit",
  "resize",
  "devtools-open",
] as const;

const metaSchema = z
  .object({
    durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    length: z.number().int().min(0).max(1_000_000).optional(),
    width: z.number().int().min(0).max(20000).optional(),
    height: z.number().int().min(0).max(20000).optional(),
  })
  .strict()
  .default({});

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  at: z.coerce.date(),
  meta: metaSchema,
});

export const proctorBatchSchema = z.object({
  events: z.array(eventSchema).min(1).max(200),
});

export type ProctorEventInput = z.infer<typeof eventSchema>;

const RATE_LIMIT_TOKENS = 200;
const RATE_LIMIT_WINDOW_SEC = 60;

/** D4's server-side rate limit: 200 events/minute/participation. Throws
 * RateLimitError (429) when exceeded. */
export async function enforceProctorRateLimit(participationId: string, cost: number): Promise<void> {
  const result = await consume(
    { bucket: "proctor:event", identity: participationId },
    { tokens: RATE_LIMIT_TOKENS, windowSec: RATE_LIMIT_WINDOW_SEC, cost }
  );
  if (!result.ok) throw new RateLimitError(retryAfterSeconds(result.resetAt));
}

/** Validates and persists a batch of proctor events for one participation. */
export async function recordProctorEvents(opts: {
  contestId: string;
  participationId: string;
  userId: string;
  events: unknown;
}): Promise<number> {
  const parsed = proctorBatchSchema.safeParse({ events: opts.events });
  if (!parsed.success) throw new ValidationError("Invalid proctor event batch.");

  await enforceProctorRateLimit(opts.participationId, parsed.data.events.length);

  await prisma.proctorEvent.createMany({
    data: parsed.data.events.map((e) => ({
      contestId: opts.contestId,
      participationId: opts.participationId,
      userId: opts.userId,
      type: e.type,
      at: e.at,
      meta: e.meta,
    })),
  });
  return parsed.data.events.length;
}

export type TimelineEvent = { type: string; at: Date; meta: unknown };
export type Timeline = {
  events: TimelineEvent[];
  totalAwayMs: number;
  blurCount: number;
  pasteCount: number;
};

/** Assembles the per-participant proctor timeline for the integrity
 * console — D4's "a timeline, not a score". */
export async function buildTimeline(participationId: string): Promise<Timeline> {
  const events = await prisma.proctorEvent.findMany({
    where: { participationId },
    orderBy: { at: "asc" },
    select: { type: true, at: true, meta: true },
  });

  let totalAwayMs = 0;
  let blurCount = 0;
  let pasteCount = 0;
  for (const e of events) {
    if (e.type === "blur" || e.type === "hidden") blurCount++;
    if (e.type === "paste") pasteCount++;
    const meta = e.meta as { durationMs?: number } | null;
    if (meta?.durationMs) totalAwayMs += meta.durationMs;
  }

  return { events, totalAwayMs, blurCount, pasteCount };
}
