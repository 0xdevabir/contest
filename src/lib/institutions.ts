import type { Role } from "@prisma/client";
import { prisma } from "./db";

export type InstitutionOption = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  district: string | null;
  verified: boolean;
};

const OPTION_SELECT = {
  id: true,
  slug: true,
  name: true,
  shortName: true,
  district: true,
  verified: true,
} as const;

/** Searchable list for the registration/profile combobox and admin CRUD. */
export async function listInstitutions(opts?: {
  q?: string;
  verifiedOnly?: boolean;
  limit?: number;
}): Promise<InstitutionOption[]> {
  const q = opts?.q?.trim();
  return prisma.institution.findMany({
    where: {
      ...(opts?.verifiedOnly ? { verified: true } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { shortName: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ verified: "desc" }, { memberCount: "desc" }, { name: "asc" }],
    take: opts?.limit ?? 100,
    select: OPTION_SELECT,
  });
}

function normalizeEmailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

/**
 * Returns the institution whose verified domain matches this email, if any.
 * Matches the *longest* registered domain suffix, so a student-only
 * subdomain (e.g. `s.diu.edu.bd`) wins over its parent domain
 * (`diu.edu.bd`) when both are registered.
 */
export async function matchInstitutionByEmail(
  email: string
): Promise<{ institutionId: string; roleHint: Role | null } | null> {
  const domain = normalizeEmailDomain(email);
  if (!domain) return null;

  const labels = domain.split(".");
  // Build every domain suffix, e.g. "s.diu.edu.bd" -> ["s.diu.edu.bd", "diu.edu.bd", "edu.bd", "bd"].
  const suffixes: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) {
    suffixes.push(labels.slice(i).join("."));
  }
  if (!suffixes.length) return null;

  const rows = await prisma.institutionDomain.findMany({
    where: { domain: { in: suffixes } },
    select: { domain: true, institutionId: true, roleHint: true },
  });
  if (!rows.length) return null;

  // suffixes[] is already ordered longest-to-shortest.
  for (const suffix of suffixes) {
    const hit = rows.find((r) => r.domain === suffix);
    if (hit) return { institutionId: hit.institutionId, roleHint: hit.roleHint };
  }
  return null;
}

/** Marks a user's institution membership as verified, by domain match or manual approval. */
export async function verifyMembership(
  userId: string,
  by: { kind: "domain" } | { kind: "manual"; approverId: string }
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      institutionVerifiedAt: new Date(),
      institutionVerifiedBy: by.kind === "manual" ? by.approverId : null,
    },
  });
}

export function institutionLabel(
  institution: { name: string; shortName: string } | null | undefined
): string {
  return institution?.name ?? "Unaffiliated";
}
