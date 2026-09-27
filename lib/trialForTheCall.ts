// For the call (TS-7 · CUL-1303; `docs/nyx-trial-screen-requirements.md` §3.3, §0.2 T-4, §2 S4).
//
// The block under the refusal register on the trial screen's safety face: the facts an owner
// needs in hand when they ring the clinic about a pet that isn't eating the trial food. Pure;
// `lib/trialScreenModel.ts` places it and `components/trialScreen/TrialScreen.tsx` draws it.
//
// A PROJECTION, NEVER A PREDICATE (S2). Every fact arrives from the module that owns it:
//   • whether the block exists at all, and the population it may speak for, from `liveRefusal`
//     — the SAME refusal the register above it is speaking from, so the two can never disagree
//     about whether the app could name the diet (B-530);
//   • the day from `getDietTrialProgress`, the day math the strip's header uses;
//   • the vomiting count and its last date from `computeTrialResponseCounts` (collapsed
//     episodes, both read off one episode set).
//
// WHAT IT NEVER SAYS (T-4, §12 finding 5):
//   • a restatement of the register — the headline already carries the refusal count and its
//     denominator, so the block carries no count of meals, bowls or days refused;
//   • a vomiting count of ZERO, a baseline, or a direction. Presence may escalate; absence says
//     nothing while a pet may not be eating (n=1 never reassures). No line is the absent form;
//   • a vomiting count without the date of the last one. Three vomits in the last 36 hours are
//     the point, and "3 in 40 days" alone dilutes them into a quiet trial;
//   • volitional wording ("won't eat", "refuses", "refused") about the pet, per
//     `trialViabilityNote`'s rule: the record holds bowls left unfinished, not a motive.
//
// REFUSAL FACE ONLY (PM ruling 2026-09-27, on CUL-1303). The intake-decline face carries no
// block: *Offered* and the swap line are defined against the refusal's population, and a
// `refused_normal_food` decline can name a food that isn't the trial diet.

import { getDietTrialProgress } from './analytics';
import { formatTrialDate, liveRefusal, type TrialCardInput, type TrialCardState } from './dietTrialCard';
import { toLocalDayKey } from './utils';

/** The block's heading, verbatim from §3.3. */
export const FOR_THE_CALL_HEADING = 'For the call';

export interface ForTheCall {
  heading: string;
  /** The record's facts, in §3.3's order: Offered (when nameable), the day, vomiting (when ≥ 1).
   *  Not `lines`: that name is the card model's, and `guards/dietTrialProvenance.test.ts`
   *  counts every reader of it. */
  facts: string[];
  /** The one line of new copy, after the facts. */
  swap: string;
}

/** §3.3's one line of new copy (nyx-voice + Dr. Chen, TS-7). "Isn't eating it", never a motive. */
export function forTheCallSwapLine(petName: string): string {
  return `Veterinary diets are usually guaranteed, so the clinic can swap this one if ${petName} isn’t eating it.`;
}

/**
 * The block for this card, or null. `state` is the card's resolved state
 * (`resolveTrialCard(input).state`): the block exists only while the live refusal register is the
 * one speaking, so a refusal the register has stood down, an intake decline that outranks it, and
 * every non-safety state all return null.
 */
export function buildForTheCall(
  input: TrialCardInput,
  state: TrialCardState,
  foodLabel: string | null,
): ForTheCall | null {
  if (state !== 'trial_refusal') return null;
  const trial = input.trial;
  if (!trial) return null;
  const refusal = liveRefusal(input);
  if (!refusal) return null;

  const facts: string[] = [];

  // B-530: under `meal_record` the app could not match the meals to the trial's foods, so it
  // names no diet. The register's note says so; this line must not contradict it.
  const label = foodLabel?.trim() ?? '';
  if (refusal.population === 'trial_diet' && label.length > 0) {
    facts.push(`Offered: ${label}`);
  }

  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    input.nowMs,
  );
  if (progress) facts.push(`Day ${progress.dayCounter} of the trial`);

  const vomiting = vomitingLine(input);
  if (vomiting) facts.push(vomiting);

  return { heading: FOR_THE_CALL_HEADING, facts, swap: forTheCallSwapLine(input.petName) };
}

/**
 * T-4 — the one presence-only count. Null unless at least one episode was logged in the trial
 * AND its last date is known: a count without its date is the dilution the date exists to stop,
 * so the pair travels together or not at all.
 *
 * The window is the count's own (`trialDayNumber`), not today's day counter: the sentence says
 * what the number was counted over, and a count read a minute before midnight covers one day
 * fewer than the header will say a minute after.
 */
function vomitingLine(input: TrialCardInput): string | null {
  const counts = input.trialResponse;
  if (!counts) return null;
  const k = counts.trialCount;
  const last = counts.trialLastEpisodeDayIndex;
  if (!Number.isFinite(k) || k < 1 || last === null || !Number.isFinite(last)) return null;
  const n = counts.trialDayNumber;
  // The strip's own noun phrase, spelled as `trialResponseStandingLine` spells it, so the two
  // surfaces name one window one way.
  const days = `the trial's ${n} ${n === 1 ? 'day' : 'days'}`;
  const date = formatTrialDate(last, toLocalDayKey(new Date(input.nowMs)));
  // One episode has no "last"; it has a date.
  return k === 1
    ? `Vomiting logged: 1 in ${days}, on ${date}`
    : `Vomiting logged: ${k} in ${days}, the last on ${date}`;
}
