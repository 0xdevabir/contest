import { getSession } from "@/lib/auth";
import { subscribeChannel } from "@/lib/pubsub";
import { notifChannel, type InAppEvent } from "@/lib/notify/channels/inapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live push for the notification bell (D3/D4). One connection per signed-in
 * user, mirroring src/app/api/contests/[id]/stream/route.ts's SSE shape. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      unsubscribe = subscribeChannel(notifChannel(session.id), (raw) => {
        if (closed) return;
        let evt: InAppEvent;
        try {
          evt = JSON.parse(raw) as InAppEvent;
        } catch {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`event: notification\ndata: ${JSON.stringify(evt)}\n\n`));
        } catch {
          closed = true;
        }
      });

      if (!unsubscribe) {
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
