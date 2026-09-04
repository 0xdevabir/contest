/**
 * D4 — "A JudgeAdapter interface with a Codeforces implementation using the
 * official public API where it exists ... for metadata and standings
 * mirroring." Deliberately metadata/standings only at this layer; actual
 * remote *submission* is a separate, opt-in-gated concern (see
 * src/lib/federation/remote-submission.ts) and is not part of this
 * interface — an adapter that only ever fetches never needs submit
 * permission plumbing.
 */
export type RemoteProblemMeta = {
  provider: string;
  externalId: string;
  title: string;
  url: string;
  difficulty: number | null;
  tags: string[];
};

export type RemoteStandingRow = {
  rank: number;
  handle: string;
  points: number;
  penalty: number;
};

export interface JudgeAdapter {
  readonly provider: string;
  fetchProblem(externalId: string): Promise<RemoteProblemMeta>;
  fetchProblemset(): Promise<RemoteProblemMeta[]>;
  fetchStandings(remoteContestId: string): Promise<RemoteStandingRow[]>;
}

const registry = new Map<string, JudgeAdapter>();

export function registerAdapter(adapter: JudgeAdapter): void {
  registry.set(adapter.provider, adapter);
}

export function getAdapter(provider: string): JudgeAdapter | null {
  return registry.get(provider) ?? null;
}
