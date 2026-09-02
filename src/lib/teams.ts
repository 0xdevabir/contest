import { prisma } from "./db";
import { parseRules } from "./contests";
import { generateJoinCode } from "./contest-access";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

/**
 * D3 (docs/phases/PHASE-07-live-contest.md) — a team is a participation
 * wrapper: `ContestParticipation.teamId` is what the scoreboard actually
 * groups on. Creating a team here does not itself register the captain for
 * the contest; the caller still upserts `ContestParticipation`/
 * `ContestRegistration` the same way solo registration does.
 */
export async function createTeam(contestId: string, captainId: string, name: string) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) throw new NotFoundError("Contest not found");
  const rules = parseRules(contest.rules);
  if (rules.teamSize <= 1) throw new ValidationError("This contest is not a team contest");

  const existing = await prisma.teamMember.findFirst({
    where: { userId: captainId, team: { contestId } },
  });
  if (existing) throw new ConflictError("You are already on a team for this contest");

  let joinCode = generateJoinCode();
  // Vanishingly unlikely, but the column is unique — retry once on a clash.
  for (let attempt = 0; attempt < 3; attempt++) {
    const clash = await prisma.team.findUnique({ where: { joinCode } });
    if (!clash) break;
    joinCode = generateJoinCode();
  }

  return prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: { contestId, name, joinCode, captainId },
    });
    await tx.teamMember.create({ data: { teamId: team.id, userId: captainId, role: "CAPTAIN" } });
    await tx.contestParticipation.upsert({
      where: { contestId_userId_mode: { contestId, userId: captainId, mode: "LIVE" } },
      update: { teamId: team.id },
      create: { contestId, userId: captainId, teamId: team.id, mode: "LIVE", official: true },
    });
    return team;
  });
}

export async function joinTeam(contestId: string, userId: string, joinCode: string) {
  const team = await prisma.team.findUnique({ where: { joinCode: joinCode.toUpperCase() } });
  if (!team || team.contestId !== contestId) throw new NotFoundError("Invalid team code");

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) throw new NotFoundError("Contest not found");
  const rules = parseRules(contest.rules);

  const existing = await prisma.teamMember.findFirst({
    where: { userId, team: { contestId } },
  });
  if (existing) {
    if (existing.teamId === team.id) return team;
    throw new ConflictError("You are already on a different team for this contest");
  }

  const memberCount = await prisma.teamMember.count({ where: { teamId: team.id } });
  if (memberCount >= rules.teamSize) throw new ConflictError("This team is full");

  await prisma.$transaction([
    prisma.teamMember.create({ data: { teamId: team.id, userId, role: "MEMBER" } }),
    prisma.contestParticipation.upsert({
      where: { contestId_userId_mode: { contestId, userId, mode: "LIVE" } },
      update: { teamId: team.id },
      create: { contestId, userId, teamId: team.id, mode: "LIVE", official: true },
    }),
  ]);

  return team;
}

export async function getMyTeam(contestId: string, userId: string) {
  const membership = await prisma.teamMember.findFirst({
    where: { userId, team: { contestId } },
    include: { team: { include: { members: { include: { user: { select: { id: true, name: true } } } } } } },
  });
  return membership?.team ?? null;
}
