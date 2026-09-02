import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { getRedis } from "@/lib/redis";
import { contestEventsChannel } from "@/lib/standings/channel";
import { toResponse, AuthError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; cid: string }> };

/** D1's three canned responses — one click matters more than it sounds when
 * staff are answering under time pressure mid-contest. */
const CANNED = {
  "no-comment": "No comment.",
  "read-problem": "Read the problem statement carefully.",
  "see-announcement": "This has been answered in an announcement.",
} as const;

const bodySchema = z.object({
  answer: z.string().trim().max(2000).optional(),
  canned: z.enum(["no-comment", "read-problem", "see-announcement"]).optional(),
  promote: z.boolean().default(false),
  title: z.string().trim().max(200).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id, cid } = await params;
    const session = await getSession();
    if (!session) throw new AuthError();

    const contest = await prisma.contest.findUnique({ where: { id } });
    if (!contest) throw new NotFoundError("Contest not found");

    const caps = await contestCapabilities(session, contest);
    if (!caps.has("viewAllSubmissions")) throw new ForbiddenError("Staff only");

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new ValidationError("Invalid data", parsed.error.flatten());

    const clarification = await prisma.contestClarification.findUnique({ where: { id: cid } });
    if (!clarification || clarification.contestId !== id) throw new NotFoundError("Clarification not found");

    const answerText = parsed.data.canned ? CANNED[parsed.data.canned] : parsed.data.answer;
    if (!answerText) throw new ValidationError("Provide an answer or a canned response");

    const redis = getRedis();

    const updated = await prisma.$transaction(async (tx) => {
      const status = parsed.data.promote ? "PROMOTED" : "ANSWERED";
      const row = await tx.contestClarification.update({
        where: { id: cid },
        data: { answer: answerText, status, answeredById: session.id, answeredAt: new Date() },
      });

      if (parsed.data.promote) {
        await tx.contestAnnouncement.create({
          data: {
            contestId: id,
            title: parsed.data.title || "Clarification",
            body: answerText,
            problemId: clarification.problemId,
            sourceClarificationId: cid,
            authorId: session.id,
          },
        });
      }

      return row;
    });

    if (redis) {
      await redis.publish(
        contestEventsChannel(id),
        JSON.stringify({
          event: "clarification",
          data: { id: updated.id, status: updated.status, userId: updated.userId, answer: updated.answer },
        })
      );
      if (parsed.data.promote) {
        await redis.publish(
          contestEventsChannel(id),
          JSON.stringify({
            event: "announcement",
            data: {
              id: updated.id, // clarification id doubles as a stable key for the SSE client cache
              title: parsed.data.title || "Clarification",
              body: answerText,
              problemId: updated.problemId,
              createdAt: new Date().toISOString(),
            },
          })
        );
      }
    }

    return NextResponse.json({ ok: true, clarification: updated });
  } catch (err) {
    return toResponse(err);
  }
}
