import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import {
  consume,
  retryAfterSeconds,
  tryAcquireAnonRunSlot,
  releaseAnonRunSlot,
  anonRunSlotsInFlight,
  _resetRateLimitsForTests,
} from "./ratelimit";

// This suite exercises the in-memory driver specifically (notably the
// fake-timer refill test below, which depends on vitest's fake clock — a
// real Redis TTL is wall-clock-based server-side and would ignore it). CI
// sets REDIS_URL for the Redis-gated suites (ratelimit-redis.test.ts); unset
// it for just this file's run so `consume()` takes the in-memory branch, and
// restore it afterward so later test files in the same worker still see it.
let savedRedisUrl: string | undefined;
beforeAll(() => {
  savedRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
});
afterAll(() => {
  if (savedRedisUrl !== undefined) process.env.REDIS_URL = savedRedisUrl;
});

describe("consume", () => {
  beforeEach(() => _resetRateLimitsForTests());

  it("allows requests up to the token count, then rejects", async () => {
    const key = { bucket: "test", identity: "id-1" };
    const limit = { tokens: 3, windowSec: 60 };
    expect((await consume(key, limit)).ok).toBe(true);
    expect((await consume(key, limit)).ok).toBe(true);
    const last = await consume(key, limit);
    expect(last.ok).toBe(true);
    expect(last.remaining).toBe(0);
    const rejected = await consume(key, limit);
    expect(rejected.ok).toBe(false);
    expect(rejected.remaining).toBe(0);
  });

  it("keeps buckets independent per identity", async () => {
    const limit = { tokens: 1, windowSec: 60 };
    expect((await consume({ bucket: "b", identity: "a" }, limit)).ok).toBe(true);
    expect((await consume({ bucket: "b", identity: "b" }, limit)).ok).toBe(true);
    expect((await consume({ bucket: "b", identity: "a" }, limit)).ok).toBe(false);
  });

  it("keeps buckets independent per bucket name for the same identity", async () => {
    const identity = "shared-id";
    const limit = { tokens: 1, windowSec: 60 };
    expect((await consume({ bucket: "run:anon", identity }, limit)).ok).toBe(true);
    expect((await consume({ bucket: "submit:user", identity }, limit)).ok).toBe(true);
  });

  it("refills after the window resets", async () => {
    vi.useFakeTimers();
    const key = { bucket: "refill", identity: "id-1" };
    const limit = { tokens: 1, windowSec: 60 };
    expect((await consume(key, limit)).ok).toBe(true);
    expect((await consume(key, limit)).ok).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect((await consume(key, limit)).ok).toBe(true);
    vi.useRealTimers();
  });

  it("supports a custom per-call cost", async () => {
    const key = { bucket: "cost", identity: "id-1" };
    const limit = { tokens: 5, windowSec: 60 };
    const res = await consume(key, { ...limit, cost: 5 });
    expect(res.ok).toBe(true);
    expect(res.remaining).toBe(0);
    expect((await consume(key, limit)).ok).toBe(false);
  });
});

describe("retryAfterSeconds", () => {
  it("is always at least 1 and rounds up", () => {
    expect(retryAfterSeconds(Date.now() + 500)).toBe(1);
    expect(retryAfterSeconds(Date.now() - 1000)).toBe(1);
    expect(retryAfterSeconds(Date.now() + 2500)).toBeGreaterThanOrEqual(3);
  });
});

describe("anonymous run concurrency slot", () => {
  beforeEach(() => _resetRateLimitsForTests());

  it("acquires up to ANON_RUN_CONCURRENCY slots then rejects", () => {
    const cap = Number(process.env.ANON_RUN_CONCURRENCY || 4);
    for (let i = 0; i < cap; i++) {
      expect(tryAcquireAnonRunSlot()).toBe(true);
    }
    expect(anonRunSlotsInFlight()).toBe(cap);
    expect(tryAcquireAnonRunSlot()).toBe(false);
  });

  it("frees a slot on release", () => {
    const cap = Number(process.env.ANON_RUN_CONCURRENCY || 4);
    for (let i = 0; i < cap; i++) tryAcquireAnonRunSlot();
    releaseAnonRunSlot();
    expect(anonRunSlotsInFlight()).toBe(cap - 1);
    expect(tryAcquireAnonRunSlot()).toBe(true);
  });

  it("never goes negative when released more than acquired", () => {
    releaseAnonRunSlot();
    releaseAnonRunSlot();
    expect(anonRunSlotsInFlight()).toBe(0);
  });
});
