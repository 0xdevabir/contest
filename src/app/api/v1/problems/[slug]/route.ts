import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error } from "@/lib/v1/http";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/v1/problems/{slug} — statement, samples, limits, tags. */
export async function GET(req: Request, { params }: Params) {
  try {
    const key = await requireApiKey(req, "problems:read");
    const { slug } = await params;

    const problem = await prisma.problem.findUnique({
      where: { slug },
      include: {
        currentVersion: {
          include: { groups: { where: { isSample: true }, include: { cases: true }, orderBy: { order: "asc" } } },
        },
        tags: { include: { tag: true } },
      },
    });
    if (!problem || !problem.currentVersion) throw new NotFoundError("Problem not found");

    const canSee =
      problem.visibility === "PUBLIC" ||
      (problem.visibility === "INSTITUTION" && problem.institutionId && problem.institutionId === key.owner.institutionId) ||
      (problem.visibility === "PRIVATE" && problem.authorId === key.owner.id) ||
      key.owner.role === "ADMIN";
    if (!canSee) throw new ForbiddenError();

    const version = problem.currentVersion;
    const samples = version.groups.flatMap((g) =>
      g.cases.map((c) => ({
        input: c.inputInline ?? "(stored externally)",
        output: c.expectedInline ?? "(stored externally)",
      }))
    );

    return v1Data({
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      difficulty: problem.difficulty,
      visibility: problem.visibility,
      statement_md: version.statementMd,
      input_spec: version.inputSpec,
      output_spec: version.outputSpec,
      constraints: version.constraints,
      time_limit_ms: version.timeLimitMs,
      memory_limit_mb: version.memoryLimitMb,
      samples,
      tags: problem.tags.map((t) => t.tag.slug),
    });
  } catch (err) {
    return v1Error(err);
  }
}
