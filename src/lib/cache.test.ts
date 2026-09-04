import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./log", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const getRedisMock = vi.fn();
vi.mock("./redis", () => ({
  getRedis: () => getRedisMock(),
}));

describe("getOrSet", () => {
  beforeEach(async () => {
    vi.resetModules();
    getRedisMock.mockReset();
    const { _clearMemCacheForTests } = await import("./cache");
    _clearMemCacheForTests();
  });

  it("resolves via fn() when Redis is unconfigured (the working miss path)", async () => {
    getRedisMock.mockReturnValue(null);
    const { getOrSet } = await import("./cache");

    const fn = vi.fn(async () => ({ value: 42 }));
    const result = await getOrSet("k1", 60, fn);

    expect(result).toEqual({ value: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("serves subsequent reads from the in-process fallback without calling fn() again", async () => {
    getRedisMock.mockReturnValue(null);
    const { getOrSet } = await import("./cache");

    const fn = vi.fn(async () => ({ value: 1 }));
    await getOrSet("k2", 60, fn);
    const second = await getOrSet("k2", 60, fn);

    expect(second).toEqual({ value: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("falls back to fn() when Redis GET throws", async () => {
    getRedisMock.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error("redis down")),
      setex: vi.fn().mockRejectedValue(new Error("redis down")),
    });
    const { getOrSet } = await import("./cache");

    const fn = vi.fn(async () => "fresh");
    const result = await getOrSet("k3", 60, fn);

    expect(result).toBe("fresh");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the cached value from Redis without calling fn()", async () => {
    getRedisMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(JSON.stringify({ cached: true })),
      setex: vi.fn(),
    });
    const { getOrSet } = await import("./cache");

    const fn = vi.fn(async () => ({ cached: false }));
    const result = await getOrSet("k4", 60, fn);

    expect(result).toEqual({ cached: true });
    expect(fn).not.toHaveBeenCalled();
  });

  it("swallows a Redis SETEX write failure and still returns the computed value", async () => {
    getRedisMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockRejectedValue(new Error("write failed")),
    });
    const { getOrSet } = await import("./cache");

    const fn = vi.fn(async () => "value");
    const result = await getOrSet("k5", 60, fn);

    expect(result).toBe("value");
  });
});
