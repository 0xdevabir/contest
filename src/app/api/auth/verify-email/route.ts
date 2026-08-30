import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshSessionFromDb } from "@/lib/auth";
import { consumeAuthToken } from "@/lib/password";
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

  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });
  await refreshSessionFromDb(userId);

  return NextResponse.json({ ok: true, message: "Email verified" });
}
