import { registerAdapter, type JudgeAdapter, type RemoteProblemMeta, type RemoteStandingRow } from "./adapter";
import { ServiceUnavailableError, NotFoundError } from "../errors";

const API_BASE = "https://codeforces.com/api";

type CfProblem = { contestId: number; index: string; name: string; rating?: number; tags: string[] };
type CfProblemsetResponse = { status: "OK" | "FAILED"; result?: { problems: CfProblem[] } };
type CfRow = { party: { members: { handle: string }[] }; rank: number; points: number; penalty: number };
type CfStandingsResponse = { status: "OK" | "FAILED"; result?: { rows: CfRow[] } };

function toMeta(p: CfProblem): RemoteProblemMeta {
  return {
    provider: "codeforces",
    externalId: `${p.contestId}${p.index}`,
    title: p.name,
    url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    difficulty: p.rating ?? null,
    tags: p.tags,
  };
}

/**
 * D4 — official public API only, no scraped sessions, no submission. A
 * coach mirroring a Div. 3 round's standings, or pulling problem metadata
 * for a RemoteProblem reference, never needs anything more than this.
 */
export const codeforcesAdapter: JudgeAdapter = {
  provider: "codeforces",

  async fetchProblem(externalId: string): Promise<RemoteProblemMeta> {
    const all = await this.fetchProblemset();
    const found = all.find((p) => p.externalId === externalId);
    if (!found) throw new NotFoundError(`Codeforces problem ${externalId} not found`);
    return found;
  },

  async fetchProblemset(): Promise<RemoteProblemMeta[]> {
    const res = await fetch(`${API_BASE}/problemset.problems`, { next: { revalidate: 3600 } });
    if (!res.ok) throw new ServiceUnavailableError("Codeforces API is unavailable.");
    const data = (await res.json()) as CfProblemsetResponse;
    if (data.status !== "OK" || !data.result) throw new ServiceUnavailableError("Codeforces API returned an error.");
    return data.result.problems.map(toMeta);
  },

  async fetchStandings(remoteContestId: string): Promise<RemoteStandingRow[]> {
    const res = await fetch(`${API_BASE}/contest.standings?contestId=${encodeURIComponent(remoteContestId)}&from=1&count=200`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new ServiceUnavailableError("Codeforces API is unavailable.");
    const data = (await res.json()) as CfStandingsResponse;
    if (data.status !== "OK" || !data.result) throw new ServiceUnavailableError("Codeforces API returned an error.");
    return data.result.rows.map((r) => ({
      rank: r.rank,
      handle: r.party.members.map((m) => m.handle).join(" & "),
      points: r.points,
      penalty: r.penalty,
    }));
  },
};

registerAdapter(codeforcesAdapter);
