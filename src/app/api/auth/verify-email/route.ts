import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refreshSessionFromDb } from "@/lib/auth";
import { consumeAuthToken } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as { token?: string };
    if (!token) {
      return NextResponse.json({ ok: false, message: "Token required" }, { status: 400 });
    }

    const userId = await consumeAuthToken(token, "EMAIL_VERIFY");
    if (!userId) {
      return NextResponse.json({ ok: false, message: "Invalid or expired token" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });
    await refreshSessionFromDb(userId);

    return NextResponse.json({ ok: true, message: "Email verified" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, message: "Verification failed" }, { status: 500 });
  }
}
