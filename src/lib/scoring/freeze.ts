/**
 * docs/phases/PHASE-05-contest-engine.md D3 "Shared: freeze.ts". Staff see
 * through the freeze; a participant always sees their own submissions
 * unfrozen (otherwise they can't tell whether their last run was accepted,
 * which is user-hostile and not what the freeze protects); everyone else
 * sees the pre-freeze state.
 *
 * Used by the new engines (ioi/cf/assignment), which have no legacy contract
 * to preserve. `icpc.ts` keeps its own inline freeze-cutoff check instead —
 * it differs subtly (a viewer's own late submission is still hidden from the
 * *shared board*, only ever unfrozen in their personal "mine" view) and must
 * stay byte-identical to the pre-refactor behaviour per the golden-fixture
 * gate, not be silently "fixed" to this module's semantics.
 */
export function applyFreeze<T extends { createdAt: Date }>(
  submissions: T[],
  freezeAt: Date | null,
  viewer: { isStaff: boolean; ownId?: string; ownerOf?: (s: T) => boolean }
): { visible: T[]; hiddenCount: number } {
  if (!freezeAt) return { visible: submissions, hiddenCount: 0 };
  const cutoff = freezeAt.getTime();
  let hiddenCount = 0;
  const visible = submissions.filter((s) => {
    if (s.createdAt.getTime() <= cutoff) return true;
    if (viewer.isStaff) return true;
    if (viewer.ownerOf?.(s)) return true;
    hiddenCount++;
    return false;
  });
  return { visible, hiddenCount };
}
