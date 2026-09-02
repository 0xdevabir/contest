import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Flame } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getPublicProfile } from "@/lib/profile";
import { difficultyClass } from "@/lib/difficulty";
import { PageHeader } from "@/components/PageHeader";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";
import { buildPageMetadata } from "@/lib/seo";
import { isEnabled } from "@/lib/flags";
import { prisma } from "@/lib/db";
import { tierFor } from "@/lib/rating/tiers";
import { RatingBadge } from "@/components/RatingBadge";
import { RatingGraph } from "@/components/rating/RatingGraph";
import { BadgeShelf } from "@/components/rating/BadgeShelf";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id, null);
  if (!profile) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }
  const institutionName = profile.institutionName ?? "Unaffiliated";
  return buildPageMetadata({
    title: `${profile.name} — ${institutionName} · C practice profile`,
    description: `${profile.name} has solved ${profile.stats.solved} C problems on DIU ContestHub${
      profile.stats.globalRank ? ` (global rank #${profile.stats.globalRank})` : ""
    }.`,
    path: `/u/${id}`,
    keywords: [
      `${profile.name} programming profile`,
      `${institutionName} coding`,
      "C programming progress",
    ],
  });
}

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params;
  const session = await getSession().catch(() => null);
  const profile = await getPublicProfile(id, session?.id ?? null);
  if (!profile) notFound();

  const isOwner = session?.id === profile.id;
  const { stats } = profile;

  const ratingsOn = await isEnabled("ratings", session ? { userId: session.id, role: session.role } : undefined);
  const [rating, ratingEvents, badgeAwards, streak] = ratingsOn
    ? await Promise.all([
        prisma.userRating.findUnique({ where: { userId: profile.id } }),
        prisma.ratingEvent.findMany({
          where: { userId: profile.id },
          orderBy: { createdAt: "asc" },
          include: { contest: { select: { title: true } } },
        }),
        prisma.userBadge.findMany({
          where: { userId: profile.id, badge: { hidden: false } },
          include: { badge: true },
          orderBy: { earnedAt: "desc" },
        }),
        prisma.userStreak.findUnique({ where: { userId: profile.id } }),
      ])
    : [null, [], [], null];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow={
          profile.institutionName
            ? `${profile.institutionName}${profile.institutionVerified ? " · Verified" : ""}`
            : "Unaffiliated"
        }
        title={
          rating ? (
            <span className="inline-flex flex-wrap items-center gap-2.5">
              {profile.name}
              <RatingBadge rating={rating.displayed} size="md" showLabel />
            </span>
          ) : (
            profile.name
          )
        }
        lead={
          profile.bio?.trim() ||
          `C programming practice on DIU ContestHub · ${stats.solved} solved`
        }
        actions={
          isOwner ? (
            <Link href="/profile" className="btn btn-primary !py-2 !text-xs">
              Edit your space
            </Link>
          ) : null
        }
      />

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-[var(--muted)]">
        {profile.department ? <span>{profile.department}</span> : null}
        {profile.email ? <span>{profile.email}</span> : null}
        <span>
          Joined{" "}
          {profile.createdAt.toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          })}
        </span>
        {stats.globalRank != null ? <span>Global #{stats.globalRank}</span> : null}
        {stats.uniRank != null ? <span>Campus #{stats.uniRank}</span> : null}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="eyebrow">Solved</p>
          <p className="font-display tnum mt-2 text-2xl font-bold">{stats.solved}</p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Acceptance</p>
          <p className="font-display tnum mt-2 text-2xl font-bold">{stats.acceptanceRate}%</p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Contests</p>
          <p className="font-display tnum mt-2 text-2xl font-bold">{stats.contestsJoined}</p>
        </div>
      </div>

      {ratingsOn && rating ? (
        <section className="panel mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="font-display text-lg font-bold">Rating</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {tierFor(rating.displayed).label} · Peak {rating.peak} · {rating.contests} rated contest
                {rating.contests === 1 ? "" : "s"}
              </p>
            </div>
            <Link href={`/u/${profile.id}/rating`} className="font-mono text-[11px] text-[var(--accent)] hover:underline">
              Full history →
            </Link>
          </div>
          <div className="p-5">
            <RatingGraph
              history={ratingEvents.map((e) => ({
                contestTitle: e.contest.title,
                displayedAfter: e.displayedAfter,
                createdAt: e.createdAt,
              }))}
            />
          </div>
        </section>
      ) : null}

      {ratingsOn && (badgeAwards.length > 0 || streak) ? (
        <section className="panel mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-display text-lg font-bold">Badges &amp; streak</h2>
            {streak && streak.current > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--warn)]">
                <Flame size={14} aria-hidden />
                {streak.current}-day streak
              </span>
            ) : null}
          </div>
          <div className="p-5">
            <BadgeShelf
              badges={badgeAwards.map((a) => ({
                code: a.badge.code,
                name: a.badge.name,
                description: a.badge.description,
                icon: a.badge.icon,
                tier: a.badge.tier,
                earnedAt: a.earnedAt,
              }))}
            />
          </div>
        </section>
      ) : null}

      <section className="panel mt-6 p-5">
        <h2 className="font-display text-lg font-bold">Activity</h2>
        <div className="mt-4">
          <ActivityHeatmap days={stats.activity} />
        </div>
      </section>

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-display text-lg font-bold">Difficulty progress</h2>
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {stats.byDifficulty.map((t) => {
            const pct = t.total ? Math.round((t.solved / t.total) * 100) : 0;
            return (
              <li key={t.tier} className="flex items-center gap-4 px-5 py-3">
                <span
                  className={`w-28 shrink-0 font-mono text-[10px] uppercase ${difficultyClass(t.tier)}`}
                >
                  {t.tier}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--line-soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="tnum shrink-0 font-mono text-[11px] text-[var(--muted)]">
                  {t.solved}/{t.total}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-display text-lg font-bold">Recent solves</h2>
        </div>
        {stats.recentSolves.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--muted)]">No public solves yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {stats.recentSolves.map((s) => (
              <li key={s.problemId}>
                <Link
                  href={`/problems/${s.problemId}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--hover)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p
                      className={`mt-0.5 font-mono text-[10px] uppercase ${difficultyClass(s.difficulty)}`}
                    >
                      {s.difficulty}
                    </p>
                  </div>
                  <time className="shrink-0 font-mono text-[11px] text-[var(--muted-dim)]">
                    {s.solvedAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
