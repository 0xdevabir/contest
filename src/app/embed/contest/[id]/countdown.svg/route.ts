import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return "started";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function countdownSvg(opts: { title: string; label: string; theme: "light" | "dark" }): string {
  const dark = opts.theme === "dark";
  const bg = dark ? "#1e293b" : "#f1f5f9";
  const fg = dark ? "#e2e8f0" : "#0f172a";
  const accent = "#22c55e";
  const width = 280;
  const height = 60;
  const title = escapeXml(opts.title.slice(0, 30));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Contest countdown for ${title}">
<rect width="${width}" height="${height}" rx="8" fill="${bg}"/>
<text x="14" y="24" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${fg}">${title}</text>
<text x="14" y="44" font-family="system-ui,sans-serif" font-size="12" fill="${accent}">${escapeXml(opts.label)}</text>
</svg>`;
}

/** GET /embed/contest/{id}/countdown.svg — cached 1h; static per fetch (no
 * live tick — a README embed re-fetches on view anyway). */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";

  const contest = await prisma.contest.findUnique({ where: { id }, select: { title: true, startsAt: true, endsAt: true, status: true } });

  let label = "unknown";
  let title = "ContestHub";
  if (contest) {
    title = contest.title;
    const now = Date.now();
    if (contest.status === "ENDED") label = "ended";
    else if (contest.startsAt && contest.startsAt.getTime() > now) label = `starts in ${fmtRemaining(contest.startsAt.getTime() - now)}`;
    else if (contest.endsAt && contest.endsAt.getTime() > now) label = `ends in ${fmtRemaining(contest.endsAt.getTime() - now)}`;
    else label = "live";
  }

  const svg = countdownSvg({ title, label, theme });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
