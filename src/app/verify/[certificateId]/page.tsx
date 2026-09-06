export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { ShieldCheck, ShieldX } from "lucide-react";
import { verifyCertificate } from "@/lib/certificates";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { buildPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ certificateId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { certificateId } = await params;
  return buildPageMetadata({
    title: "Certificate verification",
    path: `/verify/${certificateId}`,
    description: "Verify the authenticity of a CodeHub certificate.",
  });
}

const TYPE_LABELS: Record<string, string> = {
  contest_participation: "Certificate of Participation",
  contest_rank: "Certificate of Achievement",
  course_completion: "Certificate of Completion",
  season_achievement: "Season Achievement",
  problem_milestone: "Problem-Solving Milestone",
};

/**
 * D6 — public verification page. No auth gate: this is the whole point of a
 * verifiable certificate, the same reason it carries a QR code on the PDF.
 */
export default async function VerifyCertificatePage({ params }: Props) {
  const { certificateId } = await params;
  const result = await verifyCertificate(certificateId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <PageHeader eyebrow="CodeHub" title="Certificate verification" />

      {!result.valid ? (
        <div className="panel mt-8 flex flex-col items-center gap-3 p-10 text-center">
          <ShieldX size={36} className="text-[var(--danger)]" aria-hidden />
          <p className="font-display text-lg font-bold">
            {result.reason === "not_found" && "Certificate not found"}
            {result.reason === "revoked" && "This certificate has been revoked"}
            {result.reason === "tampered" && "This certificate failed verification"}
          </p>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            {result.reason === "tampered"
              ? "The stored signature no longer matches this certificate's data — it may have been altered."
              : "This link does not correspond to a valid, active certificate."}
          </p>
        </div>
      ) : (
        <VerifiedCertificate certificate={result.certificate} />
      )}
    </div>
  );
}

async function VerifiedCertificate({ certificate }: { certificate: { id: string; type: string; userId: string; payload: unknown; issuedAt: Date } }) {
  const user = await prisma.user.findUnique({ where: { id: certificate.userId }, select: { name: true } });
  const payload = certificate.payload as Record<string, unknown>;

  return (
    <div className="panel mt-8 flex flex-col items-center gap-4 p-10 text-center">
      <ShieldCheck size={36} className="text-[var(--accent)]" aria-hidden />
      <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-surface)] px-3 py-1 font-mono text-[11px] text-[var(--accent)]">
        Verified
      </p>
      <div>
        <p className="font-display text-xl font-bold">{TYPE_LABELS[certificate.type] ?? "Certificate"}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Issued to {user?.name ?? "Unknown"}</p>
      </div>

      <dl className="mt-2 grid w-full max-w-sm grid-cols-2 gap-x-4 gap-y-2 text-left text-xs">
        {Object.entries(payload).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-[var(--muted)] capitalize">{key.replace(/([A-Z])/g, " $1")}</dt>
            <dd className="tnum text-right font-mono">{String(value)}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 font-mono text-[10px] text-[var(--muted-dim)]">
        Certificate {certificate.id} · Issued {certificate.issuedAt.toLocaleDateString()}
      </p>
    </div>
  );
}
