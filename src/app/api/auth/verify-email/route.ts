import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshSessionFromDb } from "@/lib/auth";
import { consumeAuthToken } from "@/lib/password";
import { matchInstitutionByEmail } from "@/lib/institutions";
import { matchPendingEnrollments } from "@/lib/roster";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (err) {
    return toResponse(err);
  }
}

async function handlePost(req: Request): Promise<NextResponse> {
  const { token } = (await req.json()) as { token?: string };
  if (!token) {
    throw new ValidationError("Token required");
  }

  const userId = await consumeAuthToken(token, "EMAIL_VERIFY");
  if (!userId) {
    throw new ValidationError("Invalid or expired token");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });

  // Domain-based institution verification happens at the moment the email
  // itself is confirmed, not at signup — this is the evidence.
  const domainMatch = await matchInstitutionByEmail(user.email);
  let institutionId = user.institutionId;
  if (domainMatch) {
    institutionId = domainMatch.institutionId;
    await prisma.user.update({
      where: { id: userId },
      data: {
        institutionId: domainMatch.institutionId,
        institutionVerifiedAt: new Date(),
        institutionVerifiedBy: null,
      },
    });
  }

  // Phase 6 — a verified email is now authoritative, so link any classroom
  // roster invites that were waiting on it (or on institutionId+studentId).
  await matchPendingEnrollments({
    id: user.id,
    email: user.email,
    institutionId,
    studentId: user.studentId,
  });

  await refreshSessionFromDb(userId);

  return NextResponse.json({ ok: true, message: "Email verified" });
}
