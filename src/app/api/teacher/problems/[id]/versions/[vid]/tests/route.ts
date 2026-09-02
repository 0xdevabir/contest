import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, ValidationError, NotFoundError } from "@/lib/errors";
import { requireOwnedVersion, assertVersionEditable } from "@/lib/problem-authoring";
import { parseTestDataZip, storeCaseBlob, validateCaseCount } from "@/lib/testdata";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

const rowSchema = z.object({
  groupId: z.string(),
  label: z.string().max(80).default(""),
  input: z.string().max(64 * 1024 * 1024),
  expected: z.string().max(64 * 1024 * 1024),
});
const jsonBodySchema = z.object({ groupId: z.string().optional(), rows: z.array(rowSchema).min(1).max(200) });

async function nextOrder(tx: typeof prisma, groupId: string): Promise<number> {
  const last = await tx.testCase.findFirst({ where: { testGroupId: groupId }, orderBy: { order: "desc" } });
  return (last?.order ?? -1) + 1;
}

/**
 * Accepts either a multipart `.zip` upload (field name "file", plus a
 * "groupId" form field naming which group the parsed cases attach to) or a
 * JSON body of `{ rows: [{ groupId, label, input, expected }] }` for small,
 * hand-typed cases. Either path validates case-count caps and streams
 * content through blob.ts's inline/blob-store split.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id, vid } = await params;
    const session = await getSession();
    const { problem } = await requireOwnedVersion(id, vid, session!);
    await assertVersionEditable(vid);

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const groupId = form.get("groupId");
      const confirm = form.get("confirm") === "true";
      if (!(file instanceof File)) throw new ValidationError("Missing zip file (field \"file\")");
      if (typeof groupId !== "string" || !groupId) throw new ValidationError("Missing groupId");

      const group = await prisma.testGroup.findUnique({ where: { id: groupId } });
      if (!group || group.problemVersionId !== vid) throw new NotFoundError("Test group not found");

      const buf = Buffer.from(await file.arrayBuffer());
      const parsed = await parseTestDataZip(buf);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, code: "VALIDATION", message: "Zip validation failed", errors: parsed.errors }, { status: 400 });
      }

      // Per-file errors are reported without importing anything until the
      // teacher explicitly confirms importing the valid remainder (spec
      // acceptance criterion 5) — a first call always previews.
      if (parsed.errors.length > 0 && !confirm) {
        return NextResponse.json({
          ok: true,
          preview: true,
          validCount: parsed.cases.length,
          errors: parsed.errors,
        });
      }

      const existingCount = await prisma.testCase.count({ where: { testGroupId: groupId } });
      validateCaseCount(existingCount + parsed.cases.length);

      let order = await nextOrder(prisma, groupId);
      const created = [];
      for (const c of parsed.cases) {
        const inBlob = await storeCaseBlob(problem.id, vid, order, "in", c.input);
        const outBlob = await storeCaseBlob(problem.id, vid, order, "out", c.expected);
        const row = await prisma.testCase.create({
          data: {
            testGroupId: groupId,
            order,
            label: c.label,
            inputKey: inBlob.key,
            inputInline: inBlob.inline,
            inputHash: inBlob.hash,
            inputBytes: inBlob.bytes,
            expectedKey: outBlob.key,
            expectedInline: outBlob.inline,
            expectedHash: outBlob.hash,
            expectedBytes: outBlob.bytes,
          },
        });
        created.push(row);
        order++;
      }

      return NextResponse.json({ ok: true, created: created.length, skipped: parsed.errors });
    }

    const body = await req.json();
    const parsed = jsonBodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid test row data", parsed.error.flatten());

    const groupIds = [...new Set(parsed.data.rows.map((r) => r.groupId))];
    const groups = await prisma.testGroup.findMany({ where: { id: { in: groupIds }, problemVersionId: vid } });
    if (groups.length !== groupIds.length) throw new NotFoundError("One or more test groups not found");

    const created = [];
    const orderCursor = new Map<string, number>();
    for (const row of parsed.data.rows) {
      if (!orderCursor.has(row.groupId)) {
        orderCursor.set(row.groupId, await nextOrder(prisma, row.groupId));
      }
      const order = orderCursor.get(row.groupId)!;
      orderCursor.set(row.groupId, order + 1);

      const inBlob = await storeCaseBlob(problem.id, vid, order, "in", Buffer.from(row.input, "utf8"));
      const outBlob = await storeCaseBlob(problem.id, vid, order, "out", Buffer.from(row.expected, "utf8"));
      const created_row = await prisma.testCase.create({
        data: {
          testGroupId: row.groupId,
          order,
          label: row.label,
          inputKey: inBlob.key,
          inputInline: inBlob.inline,
          inputHash: inBlob.hash,
          inputBytes: inBlob.bytes,
          expectedKey: outBlob.key,
          expectedInline: outBlob.inline,
          expectedHash: outBlob.hash,
          expectedBytes: outBlob.bytes,
          manualExpected: true,
        },
      });
      created.push(created_row);
    }

    return NextResponse.json({ ok: true, created: created.length });
  } catch (err) {
    return toResponse(err);
  }
}
