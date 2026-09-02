import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assertIntegrityScopeStaff } from "@/lib/integrity/access";
import { renderIntegrityReportPdf } from "@/lib/integrity/report-pdf";
import { toResponse, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

async function scopeLabel(scopeType: string, scopeId: string): Promise<string> {
  if (scopeType === "contest") {
    const contest = await prisma.contest.findUnique({ where: { id: scopeId }, select: { title: true } });
    return contest ? `Contest: ${contest.title}` : `Contest ${scopeId}`;
  }
  if (scopeType === "assignment") {
    const assignment = await prisma.assignment.findUnique({ where: { id: scopeId }, select: { title: true } });
    return assignment ? `Assignment: ${assignment.title}` : `Assignment ${scopeId}`;
  }
  const section = await prisma.courseSection.findUnique({ where: { id: scopeId }, select: { name: true } });
  return section ? `Section: ${section.name}` : `Section ${scopeId}`;
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const scopeType = searchParams.get("scopeType") ?? "";
    const scopeId = searchParams.get("scopeId") ?? "";
    if (!scopeType || !scopeId) throw new ValidationError("scopeType and scopeId are required");

    await assertIntegrityScopeStaff(session, scopeType, scopeId);

    const pairs = await prisma.similarityPair.findMany({
      where: { scopeType, scopeId, status: { in: ["CONFIRMED", "ESCALATED"] } },
      orderBy: { zScore: "desc" },
      include: {
        submissionA: { select: { problemRef: { select: { title: true } }, user: { select: { name: true } } } },
        submissionB: { select: { user: { select: { name: true } } } },
      },
    });

    const summary = pairs.map((p) => ({
      problemTitle: p.submissionA.problemRef?.title ?? p.problemId,
      studentAName: p.submissionA.user?.name ?? "Unknown",
      studentBName: p.submissionB.user?.name ?? "Unknown",
      similarity: p.similarity,
      zScore: p.zScore,
      status: p.status,
    }));

    const label = await scopeLabel(scopeType, scopeId);
    const generatedAt = new Date();
    const pdf = await renderIntegrityReportPdf({ scopeLabel: label, generatedAt, pairs: summary });

    await prisma.integrityReport.create({
      data: {
        scopeType,
        scopeId,
        generatedAt,
        summary: summary as never,
        createdById: session!.id,
      },
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="integrity-report-${scopeType}-${scopeId}.pdf"`,
      },
    });
  } catch (err) {
    return toResponse(err);
  }
}
