import { describe, it, expect, vi } from "vitest";
import { createHmac } from "crypto";

vi.mock("./db", () => ({ prisma: { webhook: {}, webhookDelivery: {} } }));
vi.mock("./redis", () => ({ getRedis: () => null }));
vi.mock("./log", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe("signPayload", () => {
  it("produces a verifiable HMAC-SHA256 signature over timestamp.body", async () => {
    const { signPayload } = await import("./webhooks");
    const secret = "s3cr3t";
    const body = JSON.stringify({ hello: "world" });
    const timestamp = "1730000000";

    const sig = signPayload(secret, body, timestamp);
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(sig).toBe(expected);
  });

  it("changes when the body changes (tamper-evident)", async () => {
    const { signPayload } = await import("./webhooks");
    const a = signPayload("s3cr3t", JSON.stringify({ x: 1 }), "1730000000");
    const b = signPayload("s3cr3t", JSON.stringify({ x: 2 }), "1730000000");
    expect(a).not.toBe(b);
  });

  it("changes when the secret changes", async () => {
    const { signPayload } = await import("./webhooks");
    const body = JSON.stringify({ x: 1 });
    const a = signPayload("secret-a", body, "1730000000");
    const b = signPayload("secret-b", body, "1730000000");
    expect(a).not.toBe(b);
  });
});

describe("isWebhookEvent", () => {
  it("accepts every documented event", async () => {
    const { isWebhookEvent, WEBHOOK_EVENTS } = await import("./webhooks");
    for (const e of WEBHOOK_EVENTS) expect(isWebhookEvent(e)).toBe(true);
  });

  it("rejects an unknown event", async () => {
    const { isWebhookEvent } = await import("./webhooks");
    expect(isWebhookEvent("not.a.real.event")).toBe(false);
  });
});
