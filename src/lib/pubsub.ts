import Redis from "ioredis";
import { getRedis } from "./redis";

/**
 * SSE transport for submission events (D4): a channel for live subscribers
 * plus a capped stream per submission so a client reconnecting with
 * `Last-Event-ID` can replay what it missed. Both are keyed off the
 * submission id and expire on their own — nothing here is authoritative,
 * Postgres (`Submission.state`/`report`) always is.
 */
const STREAM_MAXLEN = 50;
const STREAM_TTL_SEC = 3600;

export type SubmissionEvent =
  | { event: "state"; data: { state: string; attempt: number } }
  | { event: "progress"; data: { group: number; test: number; of: number; verdict: string; cpuMs?: number } }
  | { event: "result"; data: Record<string, unknown> };

function channelFor(submissionId: string): string {
  return `sub:${submissionId}`;
}

function streamKeyFor(submissionId: string): string {
  return `sub:${submissionId}:events`;
}

/** Publishes an event to live subscribers and appends it to the replay stream. */
export async function publishSubmissionEvent(submissionId: string, evt: SubmissionEvent): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const payload = JSON.stringify(evt);
  await Promise.all([
    redis.publish(channelFor(submissionId), payload),
    redis
      .multi()
      .xadd(streamKeyFor(submissionId), "MAXLEN", "~", STREAM_MAXLEN, "*", "payload", payload)
      .expire(streamKeyFor(submissionId), STREAM_TTL_SEC)
      .exec(),
  ]);
}

/** Replays events strictly after `lastEventId` ("$" for "from the start"). */
export async function replaySubmissionEvents(
  submissionId: string,
  afterId = "0"
): Promise<Array<{ id: string; event: SubmissionEvent }>> {
  const redis = getRedis();
  if (!redis) return [];
  const entries = await redis.xrange(streamKeyFor(submissionId), afterId === "0" ? "-" : `(${afterId}`, "+");
  return entries.map(([id, fields]) => {
    const idx = fields.indexOf("payload");
    const payload = idx >= 0 ? fields[idx + 1] : "{}";
    return { id, event: JSON.parse(payload) as SubmissionEvent };
  });
}

/**
 * Subscribes to live events for a submission on a dedicated connection
 * (pub/sub connections can't run other commands). Returns an unsubscribe fn.
 */
export function subscribeSubmission(
  submissionId: string,
  onEvent: (evt: SubmissionEvent) => void
): (() => void) | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const sub = new Redis(url, { maxRetriesPerRequest: null });
  const channel = channelFor(submissionId);
  void sub.subscribe(channel);
  sub.on("message", (ch, message) => {
    if (ch !== channel) return;
    try {
      onEvent(JSON.parse(message) as SubmissionEvent);
    } catch {
      // malformed payload — drop it, the poll fallback will catch up
    }
  });
  return () => {
    sub.disconnect();
  };
}

/**
 * Generic single-channel subscription on a dedicated connection, for SSE
 * routes that don't have a per-entity channel helper of their own (Phase 7's
 * multiplexed contest events channel). `onMessage` receives the raw string
 * payload — callers own their own JSON shape/parsing.
 */
export function subscribeChannel(channel: string, onMessage: (raw: string) => void): (() => void) | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const sub = new Redis(url, { maxRetriesPerRequest: null });
  void sub.subscribe(channel);
  sub.on("message", (ch, message) => {
    if (ch !== channel) return;
    onMessage(message);
  });
  return () => {
    sub.disconnect();
  };
}
