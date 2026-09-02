import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toResponse, ValidationError } from "@/lib/errors";
import { requireOwnedVersion, assertVersionEditable } from "@/lib/problem-authoring";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; vid: string }> };

const groupSchema = z.object({
  order: z.number().int().min(0),
  name: z.string().trim().min(1).max(80),
  points: z.number().int().min(0).max(1000),
  isSample: z.boolean().default(false),
  dependsOn: z.array(z.number().int()).default([]),
  stopOnFail: z.boolean().default(true),
});

const bodySchema = z.object({ groups: z.array(groupSchema).min(1).max(50) });

/**
 * Syncs the version's group list to the given ordered set, matched by
 * `order` — updates metadata (name/points/isSample/dependsOn/stopOnFail) on
 * existing groups, creates new ones, and removes ones no longer present.
 * Never deletes a group that still holds test cases (cascade-deleting a
 * teacher's uploaded tests via a reorder click would be a nasty surprise) —
 * that's a 409 telling them to delete the cases first.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id, vid } = await params;
    const session = await getSession();
    await requireOwnedVersion(id, vid, session!);
    await assertVersionEditable(vid);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid group data", parsed.error.flatten());

    const orders = parsed.data.groups.map((g) => g.order);
    if (new Set(orders).size !== orders.length) {
      throw new ValidationError("Group order values must be unique");
    }

    const existing = await prisma.testGroup.findMany({
      where: { problemVersionId: vid },
      include: { _count: { select: { cases: true } } },
    });
    const existingByOrder = new Map(existing.map((g) => [g.order, g]));
    const nextOrders = new Set(orders);
    const toRemove = existing.filter((g) => !nextOrders.has(g.order));
    const blocked = toRemove.find((g) => g._count.cases > 0);
    if (blocked) {
      throw new ValidationError(
        `Group "${blocked.name}" still has ${blocked._count.cases} test case(s) — delete them before removing the group.`
      );
    }

    const groups = await prisma.$transaction(async (tx) => {
      if (toRemove.length) {
        await tx.testGroup.deleteMany({ where: { id: { in: toRemove.map((g) => g.id) } } });
      }
      for (const g of parsed.data.groups) {
        const current = existingByOrder.get(g.order);
        if (current) {
          await tx.testGroup.update({ where: { id: current.id }, data: g });
        } else {
          await tx.testGroup.create({ data: { ...g, problemVersionId: vid } });
        }
      }
      return tx.testGroup.findMany({ where: { problemVersionId: vid }, orderBy: { order: "asc" } });
    });

    return NextResponse.json({ ok: true, groups });
  } catch (err) {
    return toResponse(err);
  }
}
