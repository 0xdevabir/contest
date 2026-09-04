import { DRAFTS_STORE, idbDelete, idbGet, idbPut } from "./db";

type Draft = { key: string; code: string; savedAt: number };

function draftKey(problemId: string, language: string): string {
  return `${problemId}:${language}`;
}

/** Per (problemId, language) — see D4: "the highest-value item in this phase." */
export async function saveDraftOffline(problemId: string, language: string, code: string): Promise<void> {
  await idbPut(DRAFTS_STORE, { key: draftKey(problemId, language), code, savedAt: Date.now() } satisfies Draft);
}

export async function loadDraftOffline(problemId: string, language: string): Promise<string | null> {
  const draft = await idbGet<Draft>(DRAFTS_STORE, draftKey(problemId, language));
  return draft?.code ?? null;
}

export async function clearDraftOffline(problemId: string, language: string): Promise<void> {
  await idbDelete(DRAFTS_STORE, draftKey(problemId, language));
}
