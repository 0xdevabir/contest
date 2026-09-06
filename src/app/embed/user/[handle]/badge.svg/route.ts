import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ handle: string }> };

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

function badgeSvg(opts: { name: string; solved: number; rating: number | null; theme: "light" | "dark" }): string {
  const dark = opts.theme === "dark";
  const bg = dark ? "#1e293b" : "#f1f5f9";
  const fg = dark ? "#e2e8f0" : "#0f172a";
  const accent = "#6366f1";
  const width = 240;
  const height = 60;
  const name = escapeXml(opts.name.slice(0, 24));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="CodeHub badge for ${name}">
<rect width="${width}" height="${height}" rx="8" fill="${bg}"/>
<text x="14" y="24" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${fg}">${name}</text>
<text x="14" y="44" font-family="system-ui,sans-serif" font-size="12" fill="${accent}">${opts.solved} solved${opts.rating != null ? ` · rating ${opts.rating}` : ""}</text>
</svg>`;
}

/**
 * D-Embeds — "no JavaScript ... permissive CORS is the format that works in
 * a GitHub README." `{handle}` is the user id, same convention as the v1
 * users route. Cached 1h via Cache-Control; a private profile renders a
 * generic placeholder rather than 404ing (so a stale README badge doesn't
 * suddenly break, it just goes blank).
 */
export async function GET(req: Request, { params }: Params) {
  const { handle } = await params;
  const url = new URL(req.url);
  const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";

  const user = await prisma.user.findUnique({
    where: { id: handle },
    include: { rating: true, solvedProblems: { select: { id: true } } },
  });

  const svg =
    user && user.profilePublic
      ? badgeSvg({ name: user.name, solved: user.solvedProblems.length, rating: user.rating?.displayed ?? null, theme })
      : badgeSvg({ name: "CodeHub", solved: 0, rating: null, theme });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
