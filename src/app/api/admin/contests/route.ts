import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { defaultContestRules, contestRulesSchema } from "@/lib/validators";
import { slugify } from "@/lib/contests";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(5000).optional(),
  durationMinutes: z.number().int().min(10).max(24 * 60).default(120),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  rules: contestRulesSchema.partial().optional(),
  problemIds: z.array(z.string()).min(1).max(50),
});

export async function GET() {
  try {
    await requireAdmin();
    const contests = await prisma.contest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { registrations: true, problems: true } },
      },
    });
    return NextResponse.json({ ok: true, contests });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, message: "Login required" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ ok: false, message: "Admin only" }, { status: 403 });
    }
    console.error(err);
    return NextResponse.json({ ok: false, message: "Failed to list contests" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: "Invalid contest data", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    let slug = slugify(data.title);
    const exists = await prisma.contest.findUnique({ where: { slug } });
    if (exists) slug = `${slug}-${Date.now().toString(36)}`;

    const rules = { ...defaultContestRules, ...data.rules };
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const contest = await prisma.contest.create({
      data: {
        title: data.title,
        slug,
        description: data.description || "",
        durationMinutes: data.durationMinutes,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        status: data.startsAt ? "SCHEDULED" : "DRAFT",
        rules,
        createdById: admin.id,
        problems: {
          create: data.problemIds.map((problemId, i) => ({
            problemId,
            order: i,
            points: 100,
            label: labels[i] || `P${i + 1}`,
          })),
        },
      },
      include: { problems: true },
    });

    return NextResponse.json({ ok: true, contest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, message: "Login required" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ ok: false, message: "Admin only" }, { status: 403 });
    }
    console.error(err);
    return NextResponse.json({ ok: false, message: "Create failed" }, { status: 500 });
  }
}
