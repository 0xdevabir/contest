import { describe, it, expect, beforeEach } from "vitest";
import { acquireUserSlot, releaseUserSlot, _maxInFlightPerUser } from "./fairness";
import { _resetRedisClientForTests } from "../redis";

/**
 * Runs against a real Redis when REDIS_URL is set (matches the integration
 * tier's conditional-skip pattern in tests/setup.ts); without it,
 * `acquireUserSlot` fails open (see fairness.ts) so there's nothing to
 * assert against a fake cap.
 */
const hasRedis = Boolean(process.env.REDIS_URL);

describe.skipIf(!hasRedis)("per-user fairness cap", () => {
  const userId = `fairness-test-${Date.now()}`;

  beforeEach(() => {
    _resetRedisClientForTests();
  });

  it(`blocks a ${_maxInFlightPerUser() + 1}th concurrent job for the same user`, async () => {
    const max = _maxInFlightPerUser();
    const acquired: boolean[] = [];
    for (let i = 0; i < max + 1; i++) {
      acquired.push(await acquireUserSlot(userId));
    }
    expect(acquired.slice(0, max).every(Boolean)).toBe(true);
    expect(acquired[max]).toBe(false);

    await releaseUserSlot(userId);
    expect(await acquireUserSlot(userId)).toBe(true);

    for (let i = 0; i < max; i++) await releaseUserSlot(userId);
  });
});

describe.skipIf(hasRedis)("per-user fairness cap (no Redis)", () => {
  it("fails open when Redis is not configured", async () => {
    expect(await acquireUserSlot("anyone")).toBe(true);
  });
});
