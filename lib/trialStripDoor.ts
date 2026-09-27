// Home's trial strip as the door (TS-5, CUL-1301; `docs/nyx-trial-screen-requirements.md`
// §5.1, R-2, S5): WHETHER this week's lane may draw under the strip.
//
// The lane is the strip's coverage ratio drawn as seven marks, so it inherits every reason
// the strip has for holding that ratio back, and adds the two only Home can see:
//
//   1. `thisWeekLane` refuses on ANY `withholdingReasons(input)` — a day-1 trial refusal,
//      an untracked head, a stood-down range refusal (§12 finding 1). Not restated here.
//   2. The facts are fresh for the strip's pet: the card input (`useDietTrial`) AND the
//      ledger's facts (`useTrialFacts`) were both loaded for the pet the strip shows. A pet
//      switch mid-load draws nothing, never the previous pet's week under the new one.
//   3. No SAFETY-class Signal card is live for that pet on Home. PM ruling 2026-09-27 on
//      CUL-1301: the whole class (`priorityClass === 'safety'`: intake decline, a photo red
//      flag, worsening, chronicity), not the two §5.1 names — a tidy meal lane under
//      "vomiting is getting more frequent" is the same inversion of the Signal/Home S1 the
//      spec closes for intake. The Signal answers asynchronously, so `null` (not yet
//      answered, or answered for another pet) FAILS CLOSED: an absence the Signal has not
//      yet reported is not evidence of no concern.
//
// A gate may be added here, never dropped (S3). The lane itself comes from the one
// `buildTrialLedger` call the trial screen makes, so the two cannot disagree.
import type { TrialFactsState } from '../hooks/useTrialFacts';
import type { TrialCardInput } from './dietTrialCard';
import { buildTrialLedger, thisWeekLane, type TrialLane } from './trialLedger';

/** What the Signal zone reports about the pet it is drawing: `live` is whether any
 *  safety-class card is in its settled set, and `null` until its read has answered. */
export interface TrialStripSafety {
  petId: string | null;
  live: boolean | null;
}

export interface TrialStripLaneArgs {
  /** The pet the strip's card input was loaded for (`useDietTrial().loadedPetId`). */
  stripPetId: string | null;
  input: TrialCardInput | null;
  /** `useDietTrial().inputIsForPet` for the pet Home names. */
  inputFresh: boolean;
  /** `useTrialFacts(stripPetId)`: that hook resolves a mismatched pet to `unknown`. */
  facts: TrialFactsState;
  safety: TrialStripSafety | null;
}

export function trialStripLane(args: TrialStripLaneArgs): TrialLane | null {
  const { stripPetId, input, inputFresh, facts, safety } = args;
  if (stripPetId === null || input === null || !inputFresh) return null;
  if (facts.status !== 'ready') return null;
  if (safety === null || safety.petId !== stripPetId || safety.live !== false) return null;
  return thisWeekLane(buildTrialLedger({ input, facts: facts.facts }), input);
}
