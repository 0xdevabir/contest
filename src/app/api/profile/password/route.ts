import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { toResponse, ValidationError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (err) {
    return toResponse(err);
  }
}

async function handlePost(req: Request): Promise<NextResponse> {
  const session = await getSession();
  assertCan(session, "profile:edit", { ownerId: session?.id });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("New password must be at least 8 characters.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { passwordHash: true },
  });
  if (!user) throw new NotFoundError("User not found.");

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    throw new ValidationError("Current password is wrong.");
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: session.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
