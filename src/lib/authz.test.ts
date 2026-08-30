import { describe, it, expect } from "vitest";
import { can, assertCan, type Actor } from "./authz";
import { AuthError, ForbiddenError } from "./errors";

const admin: Actor = { id: "admin-1", email: "a@x.com", name: "Admin", role: "ADMIN", university: "DIU", emailVerified: true, theme: "system" };
const user: Actor = { id: "user-1", email: "u@x.com", name: "User", role: "USER", university: "DIU", emailVerified: true, theme: "system" };
const other: Actor = { id: "user-2", email: "o@x.com", name: "Other", role: "USER", university: "DIU", emailVerified: true, theme: "system" };

describe("can", () => {
  it("denies everything for a signed-out actor", () => {
    expect(can(null, "profile:edit")).toBe(false);
    expect(can(null, "contest:register")).toBe(false);
    expect(can(null, "system:admin")).toBe(false);
  });

  it("allows an ADMIN to do everything, including admin-only actions", () => {
    expect(can(admin, "system:admin")).toBe(true);
    expect(can(admin, "contest:delete")).toBe(true);
    expect(can(admin, "user:manage")).toBe(true);
  });

  it("denies admin-only actions to a plain USER", () => {
    expect(can(user, "contest:create")).toBe(false);
    expect(can(user, "problem:viewHiddenTests")).toBe(false);
    expect(can(user, "submission:rejudge")).toBe(false);
    expect(can(user, "user:manage")).toBe(false);
    expect(can(user, "system:admin")).toBe(false);
  });

  it("allows any authenticated actor to register for a contest", () => {
    expect(can(user, "contest:register")).toBe(true);
  });

  it("allows self-service actions on your own resource, denies on someone else's", () => {
    expect(can(user, "profile:edit", { ownerId: user!.id })).toBe(true);
    expect(can(user, "profile:edit", { ownerId: other!.id })).toBe(false);
    expect(can(user, "submission:viewOwn", { ownerId: user!.id })).toBe(true);
    expect(can(user, "submission:viewOwn", { ownerId: other!.id })).toBe(false);
  });

  it("allows a self-service action with no resource ownerId (general case)", () => {
    expect(can(user, "profile:edit")).toBe(true);
  });
});

describe("assertCan", () => {
  it("throws AuthError for a signed-out actor", () => {
    expect(() => assertCan(null, "profile:edit")).toThrow(AuthError);
  });

  it("throws ForbiddenError when denied", () => {
    expect(() => assertCan(user, "contest:delete")).toThrow(ForbiddenError);
  });

  it("does not throw when allowed", () => {
    expect(() => assertCan(admin, "contest:delete")).not.toThrow();
    expect(() => assertCan(user, "profile:edit", { ownerId: user!.id })).not.toThrow();
  });
});
