import { prisma } from "../../db";
import { generateVariant } from "./generate";

/**
 * The participant-facing entry point: returns this student's variant for a
 * scope, generating it on first call. `generateVariant` itself is already
 * idempotent (a DB lookup before it does any judge work) — this wrapper
 * exists so call sites don't need to know that detail, and so the reveal
 * path can attach the rendered statement in one round trip.
 */
export async function getOrGenerateVariant(opts: {
  problemId: string;
  userId: string;
  scopeType: "assignment" | "contest";
  scopeId: string;
}): Promise<{ statementMd: string; problemVersionId: string } | null> {
  const template = await prisma.problemVariantTemplate.findUnique({ where: { problemId: opts.problemId } });
  if (!template) return null;

  const { problemVersionId } = await generateVariant({
    templateId: template.id,
    userId: opts.userId,
    scopeType: opts.scopeType,
    scopeId: opts.scopeId,
  });

  const version = await prisma.problemVersion.findUnique({ where: { id: problemVersionId }, select: { statementMd: true } });
  return { statementMd: version?.statementMd ?? "", problemVersionId };
}
