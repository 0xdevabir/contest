import { prisma } from "@/lib/db";
import { requireApiKey, v1Data, v1Error, encodeCursor, parsePageParams } from "@/lib/v1/http";
import { contestListWhere } from "@/lib/contest-access";

export const runtime = "nodejs";

/** GET /api/v1/contests — visibility-filtered by the key owner's access,
 * reusing the same Prisma where-clause the web app's contest list uses. */
export async function GET(req: Request) {
  try {
    const key = await requireApiKey(req, "contests:read");
    const url = new URL(req.url);
    const { limit, cursor } = parsePageParams(url);

    const rows = await prisma.contest.findMany({
      where: contestListWhere(key.owner),
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
      orderBy: { id: "asc" },
      select: { id: true, slug: true, title: true, status: true, startsAt: true, endsAt: true, visibility: true },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return v1Data(
      page.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        status: c.status,
        starts_at: c.startsAt?.toISOString() ?? null,
        ends_at: c.endsAt?.toISOString() ?? null,
        visibility: c.visibility,
      })),
      { nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null, hasMore }
    );
  } catch (err) {
    return v1Error(err);
  }
}
