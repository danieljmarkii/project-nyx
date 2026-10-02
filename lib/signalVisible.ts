import { isStoodDown, isTrialResponse, stoodDownExpired } from './signalCopy';
import type { CachedFinding, SignalFinding } from './signal';
import { isOtherTrialReassurance, type SignalTrialAnchor } from './signalTrialAnchor';

/**
 * A finding whose whole claim is a FALLING VOMIT PAIR — fewer vomits now than before (CUL-1216,
 * BRK-6). Fewer vomits from an animal that is not eating is not good news: an empty stomach has
 * less to bring up, so beside a not-eating record (`isAnimalNotEating`, B-789) this pair is the
 * reassuring composition §5.2 forbids.
 *
 * Two types carry such a pair as their claim: the trial card's `fewer_during_trial` direction
 * (B-789's original case) and a falling VOMIT reflection ("down from N the week before"). A RISE
 * is never withheld (escalation is the safe direction), a flat reflection says no fall, and a
 * reflection over another symptom is out of this gate's scope (it is the vomit lane the refusal
 * silences). A chronicity card is SAFETY and never dropped: its falling compare is withheld row by
 * row instead (`chronicityCompareWithheld`).
 */
export function isFallingVomitPair(finding: SignalFinding): boolean {
  if (isTrialResponse(finding)) return finding.comparisonDirection === 'fewer_during_trial';
  if (finding.type === 'reflection') return finding.symptomType === 'vomit' && finding.direction === 'improving';
  return false;
}

/**
 * The Signal's OWN not-eating fact: the set carries an `intake_decline` finding. The trial
 * register (`isAnimalNotEating`) exists only for a pet on a trial — its loader reads the intake
 * lane after the trial row — so a pet with no trial whose engine has already said it is eating
 * less would otherwise have its falling vomit pair drawn right under that safety card. The two
 * facts are OR'd: either one withholds (CUL-1216).
 */
export function signalSaysNotEating(findings: readonly CachedFinding[]): boolean {
  return findings.some((f) => f.finding.type === 'intake_decline');
}

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
 * rule. A falling vomit pair (`isFallingVomitPair` — the `trial_response` card reading
 * "0 vomiting · was 20", and since CUL-1216 a falling vomit reflection) is withheld on
 * Home whenever the pet's record carries a not-eating concern or its facts have not
 * answered yet (the caller fails closed), because a cat
 * refusing the prescribed diet from day 1 has uniform-low intake and the relative
 * decline detector never fires. If Get ready re-derived "the leading findings"
 * one import away, that same reassuring sentence would come back as a thing to
 * raise with the vet, printed over a starving cat, from a surface whose whole job
 * is deciding what to say in the room.
 *
 * `nowMs` is the one clock read, and it can only ever REMOVE a line — never
 * re-open a card (the fold spec's DF-5 forbids that direction).
 *
 * `trialAnchor` (CUL-1360): when the cache counted, and which trial runs on this device. A
 * falling trial pair the engine counted over ANOTHER trial's days (a trial replaced or
 * restarted since the cache was written) is dropped, since every titling surface would name
 * it with the new trial. A rising one stays, titled by its own day (`signalTrialWindowFor`).
 * The rule is `lib/signalTrialAnchor.ts`; null (a caller with no trial read) drops nothing.
 */
export function visibleFindings(
  findings: CachedFinding[],
  withholdFallingVomit: boolean,
  nowMs: number = Date.now(),
  trialAnchor: SignalTrialAnchor | null = null,
): CachedFinding[] {
  const withhold = withholdFallingVomit || signalSaysNotEating(findings);
  return [...findings]
    .filter((f) => !(withhold && isFallingVomitPair(f.finding)))
    .filter((f) => !(trialAnchor != null && isOtherTrialReassurance(f.finding, trialAnchor)))
    // CUL-786: a stood-down line expires seven days after it was minted, even if the cache never
    // regenerates (spec §8: "until … seven days pass"). The engine drops it on its own regen; this
    // is the offline bound.
    .filter((f) => !(isStoodDown(f.finding) && stoodDownExpired(f.finding, nowMs)))
    .sort((a, b) => a.rank - b.rank);
}
