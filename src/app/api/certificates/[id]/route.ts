import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCertificate } from "@/lib/certificates";
import { toResponse, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** D6 — public verification payload. Intentionally has no auth check: the
 * whole point of a certificate is that anyone with the link (or a QR code)
 * can confirm it's real. */
export async function GET(_req: Request, { params }: Props) {
  try {
    const { id } = await params;
    const result = await verifyCertificate(id);
    if (!result.valid) {
      if (result.reason === "not_found") throw new NotFoundError("Certificate not found");
      return NextResponse.json({ ok: true, valid: false, reason: result.reason });
    }

    const user = await prisma.user.findUnique({ where: { id: result.certificate.userId }, select: { name: true } });

    return NextResponse.json({
      ok: true,
      valid: true,
      certificate: {
        id: result.certificate.id,
        type: result.certificate.type,
        userName: user?.name ?? "Unknown",
        payload: result.certificate.payload,
        issuedAt: result.certificate.issuedAt,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
