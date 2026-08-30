import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumePasswordResetCode, hashPassword } from "@/lib/password";
import { resetSchema } from "@/lib/validators";
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
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid reset data");
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user || !(await consumePasswordResetCode(user.id, parsed.data.code))) {
    throw new ValidationError("Invalid or expired code");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true, message: "Password updated. You can log in now." });
}
