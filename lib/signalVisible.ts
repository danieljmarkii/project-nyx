import { isStoodDown, isTrialResponse, stoodDownExpired } from './signalCopy';
import type { CachedFinding } from './signal';

/**
 * The findings that will actually RENDER, in render order — the B-789 safety
 * suppression plus the server's rank.
 *
 * ── WHY IT LIVES HERE (CUL-903 / VV-5) ────────────────────────────────────────
 * It was a private function inside `components/home/SignalZone.tsx`, extracted
 * there (CUL-601) so the Signal's arrival and its card stack could not disagree
 * about what would be drawn. VV-5's "Worth raising" is the third caller and it is
 * not on Home, so the module is lifted rather than the rule restated — the
 * diet-trial §5.3 lesson (ONE predicate, shared by every consumer) and the C-30
 * shape (a second surface that needs an existing rule imports the module).
 *
 * The reason this matters more than tidiness: the suppression below is a SAFETY
 * rule. A `trial_response` card reading "0 vomiting · was 20" is withheld on Home
 * whenever the active pet's record carries a not-eating concern, because a cat
 * refusing the prescribed diet from day 1 has uniform-low intake and the relative
 * decline detector never fires. If Get ready re-derived "the leading findings"
 * one import away, that same reassuring sentence would come back as a thing to
 * raise with the vet, printed over a starving cat, from a surface whose whole job
 * is deciding what to say in the room.
 *
 * `nowMs` is the one clock read, and it can only ever REMOVE a line — never
 * re-open a card (the fold spec's DF-5 forbids that direction).
 */
export function visibleFindings(
  findings: CachedFinding[],
  suppressTrialResponse: boolean,
  nowMs: number = Date.now(),
): CachedFinding[] {
  return [...findings]
    .filter(
      (f) =>
        !(
          suppressTrialResponse &&
          isTrialResponse(f.finding) &&
          f.finding.comparisonDirection === 'fewer_during_trial'
        ),
    )
    // CUL-786: a stood-down line expires seven days after it was minted, even if the cache never
    // regenerates (spec §8: "until … seven days pass"). The engine drops it on its own regen; this
    // is the offline bound.
    .filter((f) => !(isStoodDown(f.finding) && stoodDownExpired(f.finding, nowMs)))
    .sort((a, b) => a.rank - b.rank);
}
