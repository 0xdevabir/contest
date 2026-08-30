import { describe, it, expect, beforeEach, vi } from "vitest";

const ORIGINAL_ENV = process.env.RUNNER_TOKEN;

describe("run-ticket", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RUNNER_TOKEN = "test-secret";
  });

  it("returns null when RUNNER_TOKEN is not configured", async () => {
    process.env.RUNNER_TOKEN = "";
    const { issueRunTicket } = await import("./run-ticket");
    expect(issueRunTicket("user-1")).toBeNull();
  });

  it("issues a ticket that verifies back to the same subject", async () => {
    const { issueRunTicket, verifyRunTicket } = await import("./run-ticket");
    const ticket = issueRunTicket("user-1")!;
    expect(ticket).toBeTruthy();
    expect(verifyRunTicket(ticket)).toEqual({ sub: "user-1" });
  });

  it("rejects a tampered ticket (flipped signature byte)", async () => {
    const { issueRunTicket, verifyRunTicket } = await import("./run-ticket");
    const ticket = issueRunTicket("user-1")!;
    const [payload, sig] = ticket.split(".");
    const tamperedSig = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(verifyRunTicket(`${payload}.${tamperedSig}`)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { issueRunTicket, verifyRunTicket } = await import("./run-ticket");
    const ticket = issueRunTicket("user-1")!;
    const [, sig] = ticket.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", exp: Date.now() + 60_000 }), "utf8").toString(
      "base64url"
    );
    expect(verifyRunTicket(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects an expired ticket", async () => {
    vi.useFakeTimers();
    const { issueRunTicket, verifyRunTicket } = await import("./run-ticket");
    const ticket = issueRunTicket("user-1")!;
    vi.advanceTimersByTime(3 * 60 * 1000); // TTL is 2 minutes
    expect(verifyRunTicket(ticket)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects malformed tickets", async () => {
    const { verifyRunTicket } = await import("./run-ticket");
    expect(verifyRunTicket("not-a-ticket")).toBeNull();
    expect(verifyRunTicket("")).toBeNull();
  });
});

process.env.RUNNER_TOKEN = ORIGINAL_ENV;
