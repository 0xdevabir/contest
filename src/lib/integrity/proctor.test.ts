import { describe, it, expect, beforeEach } from "vitest";
import { hasTestDb } from "../../../tests/setup";

/** D4 — event validation rejects malformed batches, and the server-side
 * rate limit (200 events/min/participation) is enforced. Runs against a
 * real Postgres instance — skipped without one, see tests/setup.ts. */
describe.skipIf(!hasTestDb)("proctor", () => {
  let prisma: typeof import("@/lib/db").prisma;

  beforeEach(async () => {
    ({ prisma } = await import("@/lib/db"));
  });

  async function makeParticipation() {
    const user = await prisma.user.create({
      data: { email: `proctor-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x", name: "Proctor Test" },
    });
    const contest = await prisma.contest.create({
      data: {
        slug: `proctor-contest-${Date.now()}-${Math.random()}`,
        title: "Proctor Fixture",
        createdById: user.id,
      },
    });
    const participation = await prisma.contestParticipation.create({
      data: { contestId: contest.id, userId: user.id, mode: "LIVE" },
    });
    return { user, contest, participation };
  }

  it("rejects a malformed event batch", async () => {
    const { recordProctorEvents } = await import("./proctor");
    const { user, contest, participation } = await makeParticipation();

    await expect(
      recordProctorEvents({
        contestId: contest.id,
        participationId: participation.id,
        userId: user.id,
        events: [{ type: "not-a-real-type", at: new Date().toISOString(), meta: {} }],
      })
    ).rejects.toThrow();
  });

  it("rejects an event whose meta carries an unexpected field", async () => {
    const { recordProctorEvents } = await import("./proctor");
    const { user, contest, participation } = await makeParticipation();

    await expect(
      recordProctorEvents({
        contestId: contest.id,
        participationId: participation.id,
        userId: user.id,
        events: [{ type: "blur", at: new Date().toISOString(), meta: { clipboardText: "leaked" } }],
      })
    ).rejects.toThrow();
  });

  it("persists a valid batch", async () => {
    const { recordProctorEvents } = await import("./proctor");
    const { user, contest, participation } = await makeParticipation();

    const count = await recordProctorEvents({
      contestId: contest.id,
      participationId: participation.id,
      userId: user.id,
      events: [
        { type: "blur", at: new Date().toISOString(), meta: {} },
        { type: "focus", at: new Date().toISOString(), meta: { durationMs: 1500 } },
      ],
    });

    expect(count).toBe(2);
    const rows = await prisma.proctorEvent.findMany({ where: { participationId: participation.id } });
    expect(rows).toHaveLength(2);
  });

  it("rejects a batch once the 200/min/participation rate limit is exceeded", async () => {
    const { recordProctorEvents } = await import("./proctor");
    const { user, contest, participation } = await makeParticipation();

    const events = Array.from({ length: 200 }, () => ({
      type: "blur" as const,
      at: new Date().toISOString(),
      meta: {},
    }));

    await recordProctorEvents({ contestId: contest.id, participationId: participation.id, userId: user.id, events });

    await expect(
      recordProctorEvents({
        contestId: contest.id,
        participationId: participation.id,
        userId: user.id,
        events: [{ type: "blur", at: new Date().toISOString(), meta: {} }],
      })
    ).rejects.toThrow();
  });
});
