import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error } from "@/lib/v1/http";
import { assertCan } from "@/lib/authz";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { assertVersionEditable } from "@/lib/problem-authoring";
import { storeCaseBlob } from "@/lib/testdata";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

const bodySchema = z.object({
  cases: z
    .array(z.object({ input: z.string(), output: z.string(), sample: z.boolean().default(false) }))
    .min(1)
    .max(200),
});

/** PUT /api/v1/problems/{slug}/tests — replaces the whole test set on the
 * current draft version. Never touches a frozen (published) version — fork
 * first, same rule the teacher UI follows. */
export async function PUT(req: Request, { params }: Params) {
  try {
    const key = await requireApiKey(req, "problems:write");
    const { slug } = await params;

    const problem = await prisma.problem.findUnique({ where: { slug } });
    if (!problem) throw new NotFoundError("Problem not found");
    assertCan(key.owner, "problem:edit", { ownerId: problem.authorId });

    const latest = await prisma.problemVersion.findFirst({ where: { problemId: problem.id }, orderBy: { version: "desc" } });
    if (!latest) throw new NotFoundError("Problem version not found");
    try {
      await assertVersionEditable(latest.id);
    } catch {
      throw new ConflictError("The current version is frozen. Publish creates a new draft on fork; fork it first.");
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    await prisma.$transaction(async (tx) => {
      await tx.testCase.deleteMany({ where: { group: { problemVersionId: latest.id } } });
      await tx.testGroup.deleteMany({ where: { problemVersionId: latest.id } });
      await tx.testGroup.create({
        data: { problemVersionId: latest.id, order: 0, name: "samples", points: 0, isSample: true },
      });
      await tx.testGroup.create({ data: { problemVersionId: latest.id, order: 1, name: "main", points: 100 } });
    });

    const groups = await prisma.testGroup.findMany({ where: { problemVersionId: latest.id }, orderBy: { order: "asc" } });
    const sampleGroup = groups.find((g) => g.isSample)!;
    const mainGroup = groups.find((g) => !g.isSample)!;

    let sampleIdx = 0;
    let mainIdx = 0;
    for (const c of parsed.data.cases) {
      const group = c.sample ? sampleGroup : mainGroup;
      const order = c.sample ? sampleIdx++ : mainIdx++;
      const input = await storeCaseBlob(problem.id, latest.id, order, "in", Buffer.from(c.input, "utf8"));
      const output = await storeCaseBlob(problem.id, latest.id, order, "out", Buffer.from(c.output, "utf8"));
      await prisma.testCase.create({
        data: {
          testGroupId: group.id,
          order,
          label: String(order + 1),
          inputKey: input.key,
          inputInline: input.inline,
          inputHash: input.hash,
          inputBytes: input.bytes,
          expectedKey: output.key,
          expectedInline: output.inline,
          expectedHash: output.hash,
          expectedBytes: output.bytes,
        },
      });
    }

    return v1Data({ problem_id: problem.id, version_id: latest.id, cases: parsed.data.cases.length });
  } catch (err) {
    return v1Error(err);
  }
}
