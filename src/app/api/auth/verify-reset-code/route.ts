import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPasswordResetCode } from "@/lib/password";
import { verifyResetCodeSchema } from "@/lib/validators";
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
  const body = await req.json();
  const parsed = verifyResetCodeSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Enter the 8-digit code from your email");
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user || !(await verifyPasswordResetCode(user.id, parsed.data.code))) {
    throw new ValidationError("Invalid or expired code");
  }

  return NextResponse.json({ ok: true, message: "Code verified" });
}
