import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contestCapabilities } from "@/lib/contest-access";
import { subscribeChannel } from "@/lib/pubsub";
import { getLiveStandings } from "@/lib/standings/live";
import { contestEventsChannel } from "@/lib/standings/channel";
import type { ContestLiveEvent } from "@/lib/standings/channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * D2/D4 (docs/phases/PHASE-07-live-contest.md) — one multiplexed SSE
 * connection per contest carries standings diffs, announcements, and
 * clarification updates. Authorisation is per-event, not per-connection:
 * announcements go to anyone who can `view`; clarification events only to
 * their asker and staff; standings are the shared frozen-for-everyone board
 * (the per-viewer "always see your own results" exemption is served by the
 * page's own SSR reload, same as before this phase — see D2's freeze note).
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSession();

  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) return new Response("Not found", { status: 404 });

  const caps = await contestCapabilities(session, contest);
  if (!caps.has("view")) return new Response("Forbidden", { status: 403 });
  const isStaff = caps.has("viewAllSubmissions");
  const viewerId = session?.id ?? null;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const initial = await getLiveStandings(id, {
          startsAt: contest.startsAt,
          endsAt: contest.endsAt,
          rules: contest.rules,
          createdAt: contest.createdAt,
        });
        send("standings", {
          version: initial.version,
          changed: initial.dashboard.rows.map((r) => ({ rank: r.rank, id: r.userId, solved: r.solved, penalty: r.penalty, points: r.points, cells: r.cells })),
          removed: [],
        });
      } catch {
        // best-effort — the client's periodic SSR refresh still covers this
      }

      unsubscribe = subscribeChannel(contestEventsChannel(id), (raw) => {
        let evt: ContestLiveEvent;
        try {
          evt = JSON.parse(raw) as ContestLiveEvent;
        } catch {
          return;
        }

        if (evt.event === "clarification") {
          const isAsker = viewerId && evt.data.userId === viewerId;
          if (!isStaff && !isAsker) return; // per-event authorisation — never leaks across askers
        }

        send(evt.event, evt.data);
      });

      if (!unsubscribe) {
        // Redis unavailable — nothing more will arrive on this connection.
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
