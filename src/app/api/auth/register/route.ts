import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { matchInstitutionByEmail } from "@/lib/institutions";
import { sendVerifyEmail, sendTeacherSignupNotice } from "@/lib/mail";
import { createAuthToken, hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validators";
import { toResponse, ValidationError, ConflictError, NotFoundError } from "@/lib/errors";
import { clientIp } from "@/lib/request-context";
import { log } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    return toResponse(err);
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message || "Invalid registration data";
    throw new ValidationError(first, parsed.error.flatten());
  }

  const { name, email, password, institutionId, accountType, teacherNote, studentId, department } =
    parsed.data;

  const institution = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!institution) {
    throw new NotFoundError("Choose a valid institution");
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const domainMatch = await matchInstitutionByEmail(email);

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      // Evidence beats a claim: a matching verified domain overrides the picker.
      institutionId: domainMatch?.institutionId ?? institutionId,
      role: accountType === "TEACHER" ? "TEACHER" : "STUDENT",
      teacherRequestNote: accountType === "TEACHER" ? teacherNote || "" : "",
      studentId: studentId || null,
      department: department || null,
    },
  });

  const token = await createAuthToken(user.id, "EMAIL_VERIFY", 1000 * 60 * 60 * 24);
  try {
    await sendVerifyEmail(user.email, user.name, token);
  } catch (err) {
    log.error("verify email send failed", { userId: user.id }, err);
    // still allow account; user can resend
  }

  if (accountType === "TEACHER") {
    try {
      await sendTeacherSignupNotice(user.name, user.email);
    } catch (err) {
      log.error("teacher signup admin notice failed", { userId: user.id }, err);
    }
  }

  await createSession(user.id, {
    userAgent: req.headers.get("user-agent") ?? "",
    ip: clientIp(req),
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    message:
      accountType === "TEACHER"
        ? "Account created. Check your email to verify — teacher access needs admin approval."
        : "Account created. Check your email to verify.",
  });
}
