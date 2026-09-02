import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { subscribeSubmission, replaySubmissionEvents, type SubmissionEvent } from "@/lib/pubsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF_ROLES = new Set(["ADMIN", "TEACHER", "TA"]);

/**
 * SSE verdict stream (D4). Replays from `Last-Event-ID` so a client that
 * reconnects (e.g. after Vercel's streaming duration cap) doesn't miss
 * events, then forwards live pub/sub messages. The client-side hook
 * (src/components/SubmissionStatus.tsx) falls back to polling
 * GET /api/submissions/[id] after two failed connection attempts.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const submission = await prisma.submission.findUnique({
    where: { id },
    select: { userId: true, state: true, verdict: true, score: true, maxScore: true },
  });
  if (!submission) return new Response("Not found", { status: 404 });
  const isOwner = submission.userId === session.id;
  if (!isOwner && !STAFF_ROLES.has(session.role)) return new Response("Forbidden", { status: 403 });

  const lastEventId = req.headers.get("last-event-id") ?? "0";
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (id: string | null, evt: SubmissionEvent) => {
        const lines: string[] = [];
        if (id) lines.push(`id: ${id}`);
        lines.push(`event: ${evt.event}`);
        lines.push(`data: ${JSON.stringify(evt.data)}`);
        controller.enqueue(encoder.encode(lines.join("\n") + "\n\n"));
      };

      // If the row is already terminal (finished before the client connected,
      // or the worker beat the subscription), send it once and close.
      if (submission.state === "DONE" || submission.state === "FAILED") {
        send(null, {
          event: "result",
          data: { verdict: submission.verdict, score: submission.score, maxScore: submission.maxScore },
        });
        controller.close();
        return;
      }

      for (const { id: eventId, event } of await replaySubmissionEvents(id, lastEventId)) {
        send(eventId, event);
      }

      unsubscribe = subscribeSubmission(id, (evt) => send(null, evt));
      if (!unsubscribe) {
        // Redis unavailable — tell the client to fall back to polling immediately.
        controller.close();
      }
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
