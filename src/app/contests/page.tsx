export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import {
  Archive,
  ArrowRight,
  CalendarClock,
  CircleDot,
  ListChecks,
  Radio,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  contestPhase,
  effectiveContestStatus,
  isContestPublic,
} from "@/lib/contests";
import { closeExpiredContests } from "@/lib/contest-lifecycle";
import { ContestRegisterButton } from "@/components/ContestRegisterButton";
import { PageHeader } from "@/components/PageHeader";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "C Programming Contests — Live Events & Published Archives",
  description:
    "Join live inter-university C programming contests and browse published past contests with final standings across DIU, NSU, AIUB, and BRAC University.",
  path: "/contests",
  keywords: [
    "live programming contest",
    "inter-university programming contest",
    "ICPC style contest",
    "coding contest scoreboard",
    "DIU NSU AIUB BRAC contest",
    "university programming contest Bangladesh",
  ],
});

export default async function ContestsPage() {
  let contests: Awaited<ReturnType<typeof loadContests>> = [];
  let dbError = false;
  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  const myRegs = new Set<string>();
  if (session) {
    try {
      const regs = await prisma.contestRegistration.findMany({
        where: { userId: session.id },
        select: { contestId: true },
      });
      regs.forEach((r) => myRegs.add(r.contestId));
    } catch {
      /* ignore */
    }
  }

  try {
    contests = await loadContests(myRegs);
  } catch {
    dbError = true;
  }

  const grouped = groupContests(contests);
  const sections = [
    {
      id: "live",
      eyebrow: "Happening now",
      title: "Live contests",
      description: "The exam clock is running. Join and start solving now.",
      empty: "No contest is running right now.",
      contests: grouped.live,
      icon: Radio,
      tone: "live" as const,
    },
    {
      id: "upcoming",
      eyebrow: "Next up",
      title: "Upcoming contests",
      description: "Register early, review the schedule, and be ready before the start.",
      empty: "No upcoming contest has been published yet.",
      contests: grouped.upcoming,
      icon: CalendarClock,
      tone: "upcoming" as const,
    },
    {
      id: "past",
      eyebrow: "Archive",
      title: "Past contests",
      description: "Review published contests, final standings, and practice-enabled problems.",
      empty: "No past contest has been published yet.",
      contests: grouped.past,
      icon: Archive,
      tone: "past" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contests", path: "/contests" },
        ])}
      />
      <PageHeader
        eyebrow="Compete"
        title="C programming contests"
        lead="See what is running, register for what comes next, and revisit every published contest from one timeline."
      />

      {dbError && (
        <p className="mt-6 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn-surface)] p-3 text-sm text-[var(--warn)]">
          Database not connected. Configure Neon <code>DATABASE_URL</code> first.
        </p>
      )}

      {!dbError && (
        <>
          <nav
            aria-label="Contest timeline"
            className="panel mt-8 grid overflow-hidden sm:grid-cols-3"
          >
            {sections.map((section, index) => {
              const Icon = section.icon;
              return (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--hover)] ${
                    index > 0
                      ? "border-t border-[var(--line)] sm:border-t-0 sm:border-l"
                      : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      size={15}
                      className={
                        section.tone === "live"
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted)]"
                      }
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-medium">{section.title}</span>
                  </span>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {section.contests.length}
                  </span>
                </Link>
              );
            })}
          </nav>

          {contests.length === 0 && (
            <div className="panel mt-8 px-5 py-10 text-center">
              <h2 className="font-display text-lg font-semibold">No published contests</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Check back when an admin publishes a contest.
              </p>
            </div>
          )}

          {contests.length > 0 && (
            <div className="mt-12 space-y-14">
              {sections.map((section) => (
                <ContestSection
                  key={section.id}
                  {...section}
                  myRegs={myRegs}
                  loggedIn={!!session}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type ContestItem = Awaited<ReturnType<typeof loadContests>>[number];
type ContestTone = "live" | "upcoming" | "past";

function groupContests(contests: ContestItem[]) {
  const groups: Record<ContestTone, ContestItem[]> = {
    live: [],
    upcoming: [],
    past: [],
  };

  for (const contest of contests) {
    const status = effectiveContestStatus(contest.status, contest.endsAt);
    const phase =
      status === "ENDED"
        ? "ENDED"
        : contestPhase(contest.startsAt, contest.endsAt);

    if (phase === "ENDED") groups.past.push(contest);
    else if (phase === "BEFORE") groups.upcoming.push(contest);
    else groups.live.push(contest);
  }

  groups.live.sort(
    (a, b) => (a.endsAt?.getTime() ?? Infinity) - (b.endsAt?.getTime() ?? Infinity)
  );
  groups.upcoming.sort(
    (a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity)
  );
  groups.past.sort(
    (a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0)
  );

  return groups;
}

function ContestSection({
  id,
  eyebrow,
  title,
  description,
  empty,
  contests,
  icon: Icon,
  tone,
  myRegs,
  loggedIn,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  empty: string;
  contests: ContestItem[];
  icon: typeof Radio;
  tone: ContestTone;
  myRegs: Set<string>;
  loggedIn: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`}>
      <div className="flex items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            {eyebrow}
          </p>
          <h2 id={`${id}-title`} className="mt-1 font-display text-2xl font-semibold">
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted)]">{description}</p>
        </div>
        <span className="hidden items-center gap-2 font-mono text-xs text-[var(--muted)] sm:flex">
          <Icon
            size={14}
            className={tone === "live" ? "text-[var(--accent)]" : ""}
            aria-hidden="true"
          />
          {contests.length}
        </span>
      </div>

      {contests.length === 0 ? (
        <div className="panel-quiet mt-4 flex items-center gap-3 px-4 py-5 text-sm text-[var(--muted)]">
          <CircleDot size={15} aria-hidden="true" />
          {empty}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {contests.map((contest) => (
            <ContestCard
              key={contest.id}
              contest={contest}
              tone={tone}
              registered={myRegs.has(contest.id)}
              loggedIn={loggedIn}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ContestCard({
  contest,
  tone,
  registered,
  loggedIn,
}: {
  contest: ContestItem;
  tone: ContestTone;
  registered: boolean;
  loggedIn: boolean;
}) {
  const schedule =
    tone === "upcoming"
      ? `Starts ${formatContestDate(contest.startsAt)}`
      : tone === "live"
        ? `Ends ${formatContestDate(contest.endsAt)}`
        : `Ended ${formatContestDate(contest.endsAt)}`;

  return (
    <article className="panel panel-hover flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`flex items-center gap-2 font-mono text-[11px] ${
              tone === "live" ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            {tone === "live" && (
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              </span>
            )}
            {tone === "live" ? "Live now" : tone === "upcoming" ? "Upcoming" : "Finished"}
            {registered && " · You joined"}
          </p>
          <h3 className="mt-1.5 font-display text-xl font-semibold leading-snug">
            <Link href={`/contests/${contest.slug}`} className="hover:text-[var(--accent)]">
              {contest.title}
            </Link>
          </h3>
        </div>
        <span className="shrink-0 rounded-md border border-[var(--line)] bg-[var(--sunken)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">
          {contest.durationMinutes} min
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
        {contest.description || "No description provided."}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2 border-y border-[var(--line)] py-3 font-mono text-[11px] text-[var(--muted)]">
        <div className="flex items-center gap-1.5">
          <ListChecks size={12} aria-hidden="true" />
          <dt className="sr-only">Problems</dt>
          <dd>{contest._count.problems} problems</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Users size={12} aria-hidden="true" />
          <dt className="sr-only">Registrations</dt>
          <dd>{contest._count.registrations} registered</dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <p className="font-mono text-[11px] text-[var(--muted)]">{schedule}</p>
        <div className="flex items-center gap-2">
          {tone !== "past" && (
            <ContestRegisterButton
              contestId={contest.id}
              registered={registered}
              loggedIn={loggedIn}
            />
          )}
          <Link
            href={`/contests/${contest.slug}`}
            className="btn btn-ghost !gap-1.5 !py-2 !text-xs"
          >
            {tone === "past" ? "Final standings" : "Open"}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function formatContestDate(value: Date | null) {
  if (!value) return "time not set";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(value);
}

async function loadContests(myRegs: Set<string>) {
  await closeExpiredContests();
  const contests = await prisma.contest.findMany({
    where: {
      status: { in: ["LIVE", "ENDED"] },
    },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    include: {
      _count: { select: { problems: true, registrations: true } },
    },
  });
  // People who joined a contest keep access to it even when the admin has not
  // published the archive, so their results never vanish on them.
  return contests.filter(
    (contest) =>
      myRegs.has(contest.id) ||
      isContestPublic(contest.status, contest.startsAt, contest.endsAt, contest.rules)
  );
}



