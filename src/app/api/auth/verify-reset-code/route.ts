import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPasswordResetCode } from "@/lib/password";
import { verifyResetCodeSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = verifyResetCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: "Enter the 8-digit code from your email" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user || !(await verifyPasswordResetCode(user.id, parsed.data.code))) {
      return NextResponse.json(
        { ok: false, message: "Invalid or expired code" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, message: "Code verified" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, message: "Verification failed" }, { status: 500 });
  }
}
