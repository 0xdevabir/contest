import { describe, expect, it, vi, beforeEach } from "vitest";

const findMany = vi.fn();

vi.mock("./db", () => ({
  prisma: {
    institutionDomain: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}));

import { matchInstitutionByEmail } from "./institutions";

describe("matchInstitutionByEmail", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("returns null for an unknown domain", async () => {
    findMany.mockResolvedValue([]);
    const result = await matchInstitutionByEmail("someone@gmail.com");
    expect(result).toBeNull();
  });

  it("returns null for input with no domain", async () => {
    const result = await matchInstitutionByEmail("not-an-email");
    expect(result).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("the longest registered suffix wins over its parent domain", async () => {
    findMany.mockResolvedValue([
      { domain: "diu.edu.bd", institutionId: "inst-diu", roleHint: null },
      { domain: "s.diu.edu.bd", institutionId: "inst-diu", roleHint: "STUDENT" },
    ]);
    const result = await matchInstitutionByEmail("abir@s.diu.edu.bd");
    expect(result).toEqual({ institutionId: "inst-diu", roleHint: "STUDENT" });
  });

  it("falls back to the parent domain when the subdomain isn't registered", async () => {
    findMany.mockResolvedValue([{ domain: "diu.edu.bd", institutionId: "inst-diu", roleHint: null }]);
    const result = await matchInstitutionByEmail("abir@mail.diu.edu.bd");
    expect(result).toEqual({ institutionId: "inst-diu", roleHint: null });
  });

  it("normalises case and whitespace", async () => {
    findMany.mockResolvedValue([{ domain: "diu.edu.bd", institutionId: "inst-diu", roleHint: null }]);
    const result = await matchInstitutionByEmail("  Abir@DIU.EDU.BD  ");
    expect(result).toEqual({ institutionId: "inst-diu", roleHint: null });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domain: { in: expect.arrayContaining(["diu.edu.bd"]) } },
      })
    );
  });

  it("handles a plus-tagged local part", async () => {
    findMany.mockResolvedValue([{ domain: "diu.edu.bd", institutionId: "inst-diu", roleHint: null }]);
    const result = await matchInstitutionByEmail("abir+codehub@diu.edu.bd");
    expect(result).toEqual({ institutionId: "inst-diu", roleHint: null });
  });
});
