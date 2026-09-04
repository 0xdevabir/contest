import { verifyUnsubscribeToken, unsubscribeFromEmail } from "@/lib/notify/unsubscribe";
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/lib/notify/types";

export const runtime = "nodejs";

/** Honoured without login (D4) — a human clicks this straight from their
 * inbox, so it renders a small HTML page rather than a JSON response. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const parsed = verifyUnsubscribeToken(token);

  if (!parsed) {
    return new Response(page("That unsubscribe link is invalid or has expired."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  await unsubscribeFromEmail(parsed.userId, parsed.type);
  const label = NOTIFICATION_TYPE_LABELS[parsed.type as NotificationType] ?? parsed.type;

  return new Response(
    page(`You won't get email for "${label}" anymore. Your other notification preferences are unchanged.`),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function page(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a">
<h1 style="font-size:1.25rem">Notification preference updated</h1>
<p>${message}</p>
</body></html>`;
}
