import { prisma } from "@/lib/db";
import { verifyCertificate } from "@/lib/certificates";
import { toResponse, NotFoundError } from "@/lib/errors";
import { renderCertificatePdf } from "@/lib/certificate-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** D6 — the PDF a student downloads/prints; the QR on it points at
 * /verify/[certificateId], the page this data actually lives at. */
export async function GET(req: Request, { params }: Props) {
  try {
    const { id } = await params;

    const result = await verifyCertificate(id);
    if (!result.valid) throw new NotFoundError("Certificate not found or revoked");

    const user = await prisma.user.findUnique({ where: { id: result.certificate.userId }, select: { name: true } });
    const verifyUrl = new URL(`/verify/${id}`, req.url).toString();

    const pdf = await renderCertificatePdf({
      userName: user?.name ?? "Unknown",
      type: result.certificate.type,
      payload: result.certificate.payload as Record<string, unknown>,
      issuedAt: result.certificate.issuedAt,
      verifyUrl,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificate-${id}.pdf"`,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
