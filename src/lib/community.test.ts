import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./db", () => ({
  prisma: {
    solvedProblem: { findUnique: vi.fn() },
    problem: { findUnique: vi.fn() },
    contestStaff: { findFirst: vi.fn() },
  },
}));
vi.mock("./problems", () => ({ getProblemRef: vi.fn() }));
vi.mock("./live-contest-problems", () => ({ isProblemInLiveContest: vi.fn() }));

import { prisma } from "./db";
import { getProblemRef } from "./problems";
import { isProblemInLiveContest } from "./live-contest-problems";
import { canViewEditorial, canViewSharedSolutions, hasSolved, isCommunityStaff } from "./community";

const STUDENT = { id: "u1", role: "STUDENT", teacherApprovedAt: null } as never;
const TEACHER = { id: "t1", role: "TEACHER", teacherApprovedAt: new Date() } as never;
const ADMIN = { id: "a1", role: "ADMIN" } as never;

describe("community gating (D1)", () => {
  beforeEach(() => vi.resetAllMocks());

  describe("canViewEditorial", () => {
    it("is visible to a solver, outside a live contest", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(false);
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue({ id: "s1" } as never);

      const gate = await canViewEditorial(STUDENT, "p1", false);
      expect(gate.visible).toBe(true);
    });

    it("is hidden from an unsolved, non-revealing viewer", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(false);
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue(null);

      const gate = await canViewEditorial(STUDENT, "p1", false);
      expect(gate.visible).toBe(false);
    });

    it("is visible after an explicit reveal even when unsolved", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(false);
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue(null);

      const gate = await canViewEditorial(STUDENT, "p1", true);
      expect(gate.visible).toBe(true);
    });

    it("is hidden from everyone but staff during a live contest, even a solver", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(true);
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue({ id: "s1" } as never);

      const gate = await canViewEditorial(STUDENT, "p1", true);
      expect(gate.visible).toBe(false);
    });

    it("is visible to an admin during a live contest", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(true);

      const gate = await canViewEditorial(ADMIN, "p1", false);
      expect(gate.visible).toBe(true);
    });

    it("is visible to anonymous viewers only after an explicit reveal", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(false);

      expect((await canViewEditorial(null, "p1", false)).visible).toBe(false);
      expect((await canViewEditorial(null, "p1", true)).visible).toBe(true);
    });
  });

  describe("canViewSharedSolutions", () => {
    it("requires solving outside a live contest — staff gets no bypass", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(false);
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue(null);

      const gate = await canViewSharedSolutions(TEACHER, "p1");
      expect(gate.visible).toBe(false);
    });

    it("is visible once solved, outside a live contest", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(false);
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue({ id: "s1" } as never);

      const gate = await canViewSharedSolutions(STUDENT, "p1");
      expect(gate.visible).toBe(true);
    });

    it("tightens to staff-only during a live contest, overriding a solver's access", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(true);
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue({ id: "s1" } as never);

      const gate = await canViewSharedSolutions(STUDENT, "p1");
      expect(gate.visible).toBe(false);
    });

    it("is visible to admin staff during a live contest", async () => {
      vi.mocked(isProblemInLiveContest).mockResolvedValue(true);

      const gate = await canViewSharedSolutions(ADMIN, "p1");
      expect(gate.visible).toBe(true);
    });
  });

  describe("hasSolved", () => {
    it("reflects a SolvedProblem row", async () => {
      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue({ id: "s1" } as never);
      expect(await hasSolved("u1", "p1")).toBe(true);

      vi.mocked(prisma.solvedProblem.findUnique).mockResolvedValue(null);
      expect(await hasSolved("u1", "p1")).toBe(false);
    });
  });

  describe("isCommunityStaff", () => {
    it("is always true for an admin", async () => {
      expect(await isCommunityStaff(ADMIN, "p1")).toBe(true);
    });

    it("is false for an unapproved teacher", async () => {
      expect(await isCommunityStaff({ id: "t2", role: "TEACHER", teacherApprovedAt: null } as never, "p1")).toBe(false);
    });

    it("is true for a teacher who authored the problem", async () => {
      vi.mocked(getProblemRef).mockResolvedValue({ problemId: "dbid1", versionId: null } as never);
      vi.mocked(prisma.problem.findUnique).mockResolvedValue({ authorId: "t1" } as never);

      expect(await isCommunityStaff(TEACHER, "p1")).toBe(true);
    });

    it("is true for a teacher staffing a live contest containing the problem", async () => {
      vi.mocked(getProblemRef).mockResolvedValue({ problemId: "dbid1", versionId: null } as never);
      vi.mocked(prisma.problem.findUnique).mockResolvedValue({ authorId: "someone-else" } as never);
      vi.mocked(prisma.contestStaff.findFirst).mockResolvedValue({ id: "staff1" } as never);

      expect(await isCommunityStaff(TEACHER, "p1")).toBe(true);
    });

    it("is false for a teacher with no relation to the problem", async () => {
      vi.mocked(getProblemRef).mockResolvedValue({ problemId: "dbid1", versionId: null } as never);
      vi.mocked(prisma.problem.findUnique).mockResolvedValue({ authorId: "someone-else" } as never);
      vi.mocked(prisma.contestStaff.findFirst).mockResolvedValue(null);

      expect(await isCommunityStaff(TEACHER, "p1")).toBe(false);
    });
  });
});
