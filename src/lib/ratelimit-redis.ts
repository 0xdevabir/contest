import { getRedis } from "./redis";
import type { RateLimitKey, RateLimitLimit, RateLimitResult } from "./ratelimit";

/**
 * Atomic sliding-window token bucket, one round trip via a Lua script.
 * Same bucket semantics as the in-memory driver (src/lib/ratelimit.ts) —
 * fixed-window counter with a TTL — so swapping drivers changes nothing at
 * the call sites, only whether state is shared across instances.
 */
const CONSUME_LUA = `
local key = KEYS[1]
local tokens = tonumber(ARGV[1])
local windowSec = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])

local current = redis.call("GET", key)
local remaining
local ttl

if current == false then
  remaining = tokens
  ttl = windowSec
else
  remaining = tonumber(current)
  ttl = redis.call("TTL", key)
  if ttl < 0 then ttl = windowSec end
end

if remaining < cost then
  return { 0, math.max(0, remaining), ttl }
end

remaining = remaining - cost
if current == false then
  redis.call("SET", key, remaining, "EX", windowSec)
else
  redis.call("SET", key, remaining, "KEEPTTL")
end

return { 1, remaining, ttl }
`;

function keyOf(key: RateLimitKey): string {
  return `ratelimit:${key.bucket}:${key.identity}`;
}

export async function consumeRedis(key: RateLimitKey, limit: RateLimitLimit): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis not configured");

  const cost = limit.cost ?? 1;
  const [ok, remaining, ttl] = (await redis.eval(
    CONSUME_LUA,
    1,
    keyOf(key),
    limit.tokens,
    limit.windowSec,
    cost
  )) as [number, number, number];

  return { ok: ok === 1, remaining, resetAt: Date.now() + ttl * 1000 };
}
