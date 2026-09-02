import { describe, it, expect, beforeEach } from "vitest";
import { consumeRedis } from "./ratelimit-redis";
import { _resetRedisClientForTests } from "./redis";

const hasRedis = Boolean(process.env.REDIS_URL);

describe.skipIf(!hasRedis)("consumeRedis (sliding-window token bucket)", () => {
  beforeEach(() => {
    _resetRedisClientForTests();
  });

  it("allows up to the token count then rejects", async () => {
    const key = { bucket: "test-bucket", identity: `id-${Date.now()}` };
    const limit = { tokens: 3, windowSec: 60 };

    expect((await consumeRedis(key, limit)).ok).toBe(true);
    expect((await consumeRedis(key, limit)).ok).toBe(true);
    const third = await consumeRedis(key, limit);
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = await consumeRedis(key, limit);
    expect(fourth.ok).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("keeps independent buckets per identity", async () => {
    const limit = { tokens: 1, windowSec: 60 };
    const a = { bucket: "test-bucket-2", identity: `a-${Date.now()}` };
    const b = { bucket: "test-bucket-2", identity: `b-${Date.now()}` };

    expect((await consumeRedis(a, limit)).ok).toBe(true);
    expect((await consumeRedis(a, limit)).ok).toBe(false);
    expect((await consumeRedis(b, limit)).ok).toBe(true);
  });
});
