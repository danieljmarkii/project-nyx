// The trial's own screen, as a model (TS-4 · CUL-1300; `docs/nyx-trial-screen-requirements.md`
// §2, §3, §4). Pure: the screen (`components/trialScreen/TrialScreen.tsx`) draws this and
// decides nothing.
//
// A LAYOUT, NEVER A MEANING (S2). Every owner-facing string about the record arrives from
// the module that already writes it: the card's lines, actions, kicker and day line from
// `resolveTrialCard`; the title and the vomiting sentence from `resolveTrialStrip`; the
// ledger from `buildTrialLedger`. What this file owns is WHERE each of those goes, and
// what the screen WITHHOLDS on top of them. It lives in `lib/` rather than in the
// namespace because the flag-off guard wraps every namespace export into a component.
//
// THE WITHHOLDING, IN ONE PLACE (S3, S4, S7; v1.1 §12 findings 2, 3, 6, 7):
//   • a safety face (`intake_decline`, `trial_refusal`) draws the card's flag lines first,
//     then the doors, then the card's own actions for that state, and no ledger at all;
//   • the coverage sentence and the ledger are withheld whenever `isAnimalNotEating(input)`,
//     which reads the RAW refusal facts, so a refusal the card's register has stood down
//     still withholds them (the card keeps printing its ratio by a standing ruling; the
//     screen may add withholding, and does);
//   • the milestone draws no ledger and no coverage beside its stop decision;
//   • the vomiting line is the strip's own field, verbatim, null exactly when the strip's
//     is, and it sits inside the facts with no heading;
//   • nothing that counts renders until the facts have answered FOR THE ROUTE'S PET
//     (Home's stale-facts null keys on the active pet and does not transfer).
// Each has a literal-string test in `trialScreenModel.test.ts`.

import type { DietTrialStatus } from '../hooks/useDietTrial';
import type { TrialFactsState } from '../hooks/useTrialFacts';
import { allowedFoodsOn } from './dietTrial';
import {
  BLIND_SPOT_QUALIFIER,
  formatTrialDate,
  isAnimalNotEating,
  resolveTrialCard,
  resolveTrialStrip,
  trialEndDayIndex,
  type TrialCardAction,
  type TrialCardInput,
  type TrialCardLine,
  type TrialCardModel,
  type TrialCardState,
} from './dietTrialCard';
import { buildForTheCall, type ForTheCall } from './trialForTheCall';
import { buildTrialLedger, type TrialLedger } from './trialLedger';
import { oralRouteRows } from './trialExposuresScreen';
import type { TrialAllowedSet } from './trialAllowedSet';
import { localDayIndex, localDayIndexOf, toLocalDayKey } from './utils';
import { getDietTrialProgress } from './analytics';

// ── The screen's own copy (spec §3, §4). Not one of these states a record fact. ─────────

/** The header label, every state (§3.1). */
export const TRIAL_SCREEN_HEADER = 'Diet trial';
/** §3.9 — the running trial's bottom action. Opens the two-row door (change the window ·
 *  replace the trial) the card's header "Manage" opens. */
export const MANAGE_THE_TRIAL = 'Manage the trial';
/** §3.8. */
export const VET_REPORT_DOOR = 'Vet report';
export const GET_READY_DOOR = 'Get ready for the recheck';
/** §3.6 — the exposures door, the label the card's own `view_exposures` action carries. */
export const EXPOSURES_DOOR = 'Outside the trial diet';
/** §4 — the three answers that are not a trial. */
export const TRY_AGAIN = 'Try again';
export const UNKNOWN_PET_LINE = 'This pet isn’t in your account any more.';
export const TO_THE_PET_TAB = 'Go to the Pet tab';
export const TO_HOME = 'Go Home';

export function unreadableLine(petName: string): string {
  return `I couldn’t pull ${petName}’s trial just now.`;
}

/** §3.5 / S9 (CUL-1336) — the ledger's read failed while the trial's did not. Said where the
 *  ledger would be, beside *Try again*, so the facts below it are not mistaken for all there is. */
export function ledgerUnreadableLine(petName: string): string {
  return `I couldn’t pull ${petName}’s week-by-week record just now.`;
}

export function noTrialLine(petName: string): string {
  return `${sentenceStart(petName)} isn’t on a diet trial right now.`;
}

/** §3.4 — the allowed-list door's sub-line, worded under CUL-1005's noun once it is ruled. */
export function allowedFoodsSubline(extras: number): string {
  if (extras <= 0) return 'The trial diet only';
  return `The trial diet and ${extras} more allowed ${extras === 1 ? 'food' : 'foods'}`;
}

/** A pet name at the start of a sentence. The anonymous fallback ("your pet") is lower
 *  case because it usually sits mid-sentence. */
function sentenceStart(name: string): string {
  return name.length > 0 ? name[0].toUpperCase() + name.slice(1) : name;
}

// ── The model ────────────────────────────────────────────────────────────────────────

export interface TrialScreenDoor {
  label: string;
  sub: string | null;
}

export interface TrialScreenTrial {
  kind: 'trial';
  state: TrialCardState;
  petName: string;
  /** §3.1 — the strip's header verbatim while a trial is active; the card's kicker on a
   *  terminal trial, where the strip does not exist. */
  title: string;
  subline: string | null;
  /** §3.2 — the card's register lines, in the card's order. First line is the fact. */
  safety: string[] | null;
  /** §3.3 (TS-7) — the facts for the call, under the register's lines. Trial refusal only. */
  forTheCall: ForTheCall | null;
  /** The milestone's headline (the card's day line in its headline role). */
  headline: string | null;
  /** The decision block drawn inline above the record (milestone: its note and three
   *  choices; overrun: its note and "Tell Culprit what's next"). */
  decision: { notes: string[]; actions: TrialCardAction[] } | null;
  /** §3.4 — the strongest row on the screen, only when the allowed set is hydrated. */
  allowedFoods: TrialScreenDoor | null;
  /** §3.5 — null on every state that withholds it. */
  ledger: TrialLedger | null;
  /** §3.5, S9 (CUL-1336) — `ledgerUnreadableLine`, where the ledger would be, when its read
   *  FAILED on a state that would draw one. Null on every state that withholds the ledger
   *  anyway: a failed read is never a reason to say more than the answered one would. */
  ledgerUnreadable: string | null;
  /** §3.6 — the card's record region, in its order, with the qualifier lifted to `qualifier`. */
  facts: TrialCardLine[];
  /** §3.7 — `resolveTrialStrip(input).trialResponseLine`, verbatim. */
  vomiting: string | null;
  /** `isAnimalNotEating(input)`: the register Home feeds `visibleFindings`, handed to the
   *  Signal door (TS-9) so the door and Home's card can never disagree about a falling pair. */
  notEating: boolean;
  /** The LOCKED blind-spot qualifier, once, at the foot of the card the ledger and the
   *  facts share (§3.5, §5.2: the qualifier sits on the claim). */
  qualifier: string | null;
  standingMeta: string | null;
  standingNote: { title: string; body: string } | null;
  /** §3.6 — the door to `/trial-exposures`. */
  exposures: TrialScreenDoor | null;
  /** §3.8. */
  getReady: (TrialScreenDoor & { appointmentId: string }) | null;
  report: TrialScreenDoor | null;
  /** §3.9 — the state's own actions: after the doors on a safety face, at the bottom
   *  otherwise. Never the decision block's (those are in `decision`). */
  actions: TrialCardAction[];
  /** §3.9 — "Manage the trial" at the bottom of a running, non-safety trial, and after
   *  the doors on the intake-decline face (CUL-1339 #2). */
  manage: string | null;
}

export type TrialScreenModel =
  | { kind: 'loading' }
  | { kind: 'unreadable'; petName: string }
  | { kind: 'no_trial'; petName: string }
  | { kind: 'unknown_pet' }
  | TrialScreenTrial;

export interface TrialScreenModelArgs {
  /** The route's pet. */
  petId: string;
  /** The route's pet as the account holds it, or null (not held, or not loaded yet). */
  pet: { id: string; name: string } | null;
  /** Whether the account's pet list has loaded at all (a cold start from a link). */
  petsLoaded: boolean;
  /** The record's pet name for copy (`resolveRecordPetName`, C-9). */
  petName: string;
  trial: { status: DietTrialStatus; input: TrialCardInput | null; inputIsForPet: boolean };
  facts: TrialFactsState;
  allowedSet: TrialAllowedSet;
  /** The pet's next booking, if any (`readVetVisitsHome(petId).next`). */
  appointment: { id: string; when: string } | null;
  /** Tests only; production reads the device's zone (B-421). */
  timeZone?: string;
}

const SAFETY_STATES: ReadonlySet<TrialCardState> = new Set(['intake_decline', 'trial_refusal']);
/** The states whose note and actions draw as an inline decision block (§3.9). */
const DECISION_STATES: ReadonlySet<TrialCardState> = new Set(['milestone', 'overrun']);
/** §3.9: the states with "Manage the trial" at the bottom. Not the milestone: its three
 *  choices are the whole decision, and a fourth control beside them is the pressure the
 *  inline row exists to avoid (round 2 draws none). Overrun keeps it: the trial may run
 *  on for weeks on the vet's say-so, and the window must stay changeable. */
const RUNNING_STATES: ReadonlySet<TrialCardState> = new Set([
  'day_one', 'clean', 'exposures', 'below_floor', 'free_fed', 'overrun',
]);
// CUL-1339 #2 (PM, 2026-09-27, option (a)): the intake-decline face carries it too, after
// the doors. Neither of its two acts (change the window, replace the trial) ends anything
// the call-today depends on (the ask is the intake flag's, not the trial's), and with TS-6's
// Pet tab door this face is the only place left to change the trial from. `trial_refusal`
// keeps its own *Change or end the trial*; the milestone keeps its three choices only.

export function buildTrialScreenModel(args: TrialScreenModelArgs): TrialScreenModel {
  const { trial, facts } = args;

  // §4, S9: loading, unreadable and "no trial" are three different screens, and an
  // unknown pet is a fourth. The pet list comes first: a cold start from a link has no
  // pets yet, which is "loading", never "not in your account".
  if (!args.petsLoaded) return { kind: 'loading' };
  if (!args.pet || trial.status === 'no_pet') return { kind: 'unknown_pet' };
  if (trial.status === 'unreadable') return { kind: 'unreadable', petName: args.petName };
  if (trial.status !== 'loaded' || !trial.inputIsForPet || !trial.input) return { kind: 'loading' };

  const input = trial.input;
  if (!input.trial) return { kind: 'no_trial', petName: args.petName };

  // THE FRESHNESS GATE (S3). The facts read is the ledger's; until it has answered for
  // this pet the screen draws nothing that counts, so a grid can never pop in under a
  // caption from a different read.
  if (facts.status === 'unknown') return { kind: 'loading' };
  // …and for THIS TRIAL (CUL-1336). The facts hook is keyed by pet, so a replaced trial's
  // facts can sit beside the new trial's card until both reads land: not yet, never theirs.
  if (facts.status === 'ready' && facts.trialId !== undefined && facts.trialId !== input.trial.id) {
    return { kind: 'loading' };
  }

  // S7 — WHERE HOME WITHHOLDS ITS RATIO, SO DOES THIS. Over a pet that may not be eating
  // (`isAnimalNotEating`, the raw refusal facts, so a refusal the register has stood down
  // still counts) the card's record region is resolved WITHOUT coverage: every register
  // that states it (the plain sentence, the "so far" paragraph) then speaks its own
  // no-coverage form, with the off-diet floor intact. No string is matched or invented,
  // and neither the state nor the register reads coverage (adversarial pass, TS-4).
  //
  // NOT ON AN ENDED TRIAL: Home has no strip for one, and the ended card's refusal
  // sentence states "meals OFFERED on X of Y days" beside "what your vet needs from it is
  // the refusal" — the same clause the report prints, which a coverage-null read would
  // strip of its feeding count as well.
  //
  // The untracked head is projected away with it: its disclosure ("the first N days aren't
  // counted here") qualifies a coverage RATIO, and with the ratio gone "here" could only
  // mean the feeding count, which does count those days' feedings (the card's own ruling
  // for the `trial_refusal` and `free_fed` registers, which render no ratio either).
  //
  // And where days are logged but no feeding could be classified (meals naming no food,
  // a list with no trial diet), the coverage-null register would read the record as EMPTY
  // ("Nothing is on the record for this trial yet.") over logged, refused meals. There its
  // fact lines are dropped: zero feedings means zero off-diet, so no floor is lost, and
  // saying nothing beats saying "nothing" (adversarial re-run, TS-4).
  //
  // EXCEPT WHERE THE CARD CAN NOW SAY WHY (CUL-1338). When those days hold feedings that
  // name no food, every register that reached "nothing" speaks a count of them instead
  // ("20 logged feedings don't name a food, so they can't be checked against the trial
  // diet."), so the drop would now hide the one true line. Walked for this projection
  // (coverage null, zero feedings, zero off-diet) register by register: the sentence and
  // the "so far" paragraph become that disclosure alone; day 1's "Nothing logged yet
  // today." is withheld by the card itself; the floor sentence needs an off-diet count
  // there is none of; the free-fed count is the Pet tab's own line. No line states or
  // implies that anything matched, so nothing reassuring reaches a pet that may not be
  // eating. The drop stays for the residual (days logged, nothing classified, nothing
  // unnamed), which no register can yet explain.
  const notEating = isAnimalNotEating(input);
  const running = input.trial.status === 'active';
  const projected = notEating && running;
  const card = trialScreenCard(input);
  const unclassifiedRecord =
    projected &&
    (input.coverage?.daysLogged ?? 0) > 0 &&
    (input.exposures?.totalFeedings ?? 0) === 0 &&
    (input.exposures?.unclassifiable ?? 0) === 0;
  const strip = resolveTrialStrip(input);
  const state = card.state;
  const decisionState = DECISION_STATES.has(state);

  const safetyLines: string[] = [];
  const decisionNotes: string[] = [];
  const factLines: TrialCardLine[] = [];
  let qualifier: string | null = null;
  for (const line of card.lines) {
    if (line.role === 'flag') {
      safetyLines.push(line.text);
    } else if (decisionState && line.role === 'note') {
      decisionNotes.push(line.text);
    } else if (line.text.startsWith(BLIND_SPOT_QUALIFIER)) {
      // The LOCKED qualifier is lifted to the card's foot, once. A floor suffix the card
      // welded onto it ("That 1 is what's been logged, not a total.") stays HERE, beside
      // the exposure count it qualifies: at the foot it would sit under the vomiting line
      // and read as a claim about those counts (S2: layout may never change meaning).
      qualifier = BLIND_SPOT_QUALIFIER;
      const suffix = line.text.slice(BLIND_SPOT_QUALIFIER.length).trim();
      if (suffix.length > 0) factLines.push({ role: 'qualifier', text: suffix });
    } else if (unclassifiedRecord && line.role === 'fact') {
      continue;
    } else {
      factLines.push(line);
    }
  }

  // S4 — THE SAFETY FACE IS KEYED ON THE CARD'S REGISTER LINES, NEVER ON THE STATE. An
  // ended trial with a live intake decline carries them too (the terminal `decline`
  // register), and keying on `intake_decline` / `trial_refusal` dropped "needs a call
  // today" from exactly that screen (adversarial pass, TS-4: one tap from a live one,
  // through Stopped early).
  const safety = safetyLines.length > 0;

  const ledger =
    safety || state === 'milestone' || notEating || facts.status !== 'ready'
      ? null
      : buildTrialLedger({ input, facts: facts.facts, timeZone: args.timeZone });
  // S9 (CUL-1336): a failed ledger read is said where the ledger would be, never a silent
  // gap. Only on a state that would draw one: `buildTrialLedger`'s input-side gates.
  const ledgerUnreadable =
    facts.status === 'unreadable' &&
    !safety &&
    state !== 'milestone' &&
    !notEating &&
    !input.freeFed &&
    !input.freeFedOverlap
      ? ledgerUnreadableLine(args.petName)
      : null;

  const hasAction = (id: TrialCardAction['id']) => card.actions.some((a) => a.id === id);
  // §3.4: the head alone until the set has hydrated. The door is Jordan's first moment,
  // so it never waits on the list read; `/trial-foods` answers its own read states.
  const allowedAction = card.actions.find((a) => a.id === 'view_allowed_foods');
  const allowedFoods = allowedAction
    ? {
        label: allowedAction.label,
        sub:
          args.allowedSet.status === 'ready'
            ? allowedFoodsSubline(
                allowedFoodsOn(
                  args.allowedSet.ctx,
                  localDayIndex(input.nowMs, args.timeZone),
                ).filter((f) => f.role !== 'primary_diet').length,
              )
            : null,
      }
    : null;

  const offDiet = input.exposures?.offDiet ?? 0;
  // CUL-1363: a chewable or food-paired dose opens the door too. The list holds them in
  // its "Given by mouth" group, and until this the only way to reach that group was an
  // off-diet FEEDING, so a trial whose only exposure was a chewable had no door to it
  // anywhere. Asked of `oralRouteRows`, the list's own builder, so the door opens exactly
  // when the list would draw a dose row: never onto an empty screen, never over facts the
  // list would refuse to read (no range), and never before the facts read answered.
  const doseRows = facts.status === 'ready' ? oralRouteRows(facts.facts, input.nowMs) : null;
  // §3.6, every state: on an ended trial the list is what the recheck asks about.
  const exposures =
    offDiet > 0 || (doseRows?.length ?? 0) > 0 ? { label: EXPOSURES_DOOR, sub: null } : null;

  // The state's own actions. The doors carry the card's two references (the allowed list
  // and the exposures list), so neither is repeated as an action; the decision block
  // carries the milestone's and the overrun's. Both report doors open the route's pet's
  // report (`/report?pet=`, CUL-1334), so neither depends on which pet is active.
  const actions = decisionState
    ? []
    : card.actions.filter((a) => a.id !== 'view_allowed_foods' && a.id !== 'view_exposures');

  // The vet report door, unless the state's own action already is that door (S8: one door
  // per action).
  const report = !hasAction('open_report') ? { label: VET_REPORT_DOOR, sub: null } : null;

  return {
    kind: 'trial',
    state,
    petName: args.petName,
    title: strip?.header ?? card.kicker,
    subline: sublineFor(input, card.foodLabel, card.dayLine, state),
    safety: safety ? safetyLines : null,
    forTheCall: safety ? buildForTheCall(input, state, card.foodLabel) : null,
    headline: card.dayLineRole === 'headline' ? card.dayLine : null,
    decision: decisionState ? { notes: decisionNotes, actions: card.actions } : null,
    allowedFoods,
    ledger,
    ledgerUnreadable,
    facts: factLines,
    vomiting: strip?.trialResponseLine ?? null,
    notEating,
    qualifier,
    standingMeta: card.standingMeta,
    standingNote: card.standingNote,
    exposures,
    getReady: args.appointment
      ? { label: GET_READY_DOOR, sub: args.appointment.when, appointmentId: args.appointment.id }
      : null,
    report,
    actions,
    manage: RUNNING_STATES.has(state) || state === 'intake_decline' ? MANAGE_THE_TRIAL : null,
  };
}

/**
 * The card the screen draws from: `resolveTrialCard` over the input, with coverage
 * projected away while a running trial's pet may not be eating (S7; the reasoning is in
 * `buildTrialScreenModel`). Exported so the Pet tab's door (`lib/trialDoorRow.ts`, TS-6)
 * reads the SAME register the screen leads with, and the two cannot disagree about
 * whether something is wrong.
 */
export function trialScreenCard(input: TrialCardInput): TrialCardModel {
  const projected = isAnimalNotEating(input) && input.trial?.status === 'active';
  return resolveTrialCard(
    projected ? { ...input, coverage: null, untrackedDaysBeforeFirstLog: 0 } : input,
  );
}

/** The card's register lines (role `flag`), in the card's order: the screen's safety face
 *  (§3.2), keyed on the lines and never on the state (S4). Empty when nothing is wrong. */
export function trialSafetyLines(card: TrialCardModel): string[] {
  return card.lines.filter((l) => l.role === 'flag').map((l) => l.text);
}

/**
 * §3.1's sub-line: `{food} · since {start} · ends {end}` on a running trial, through the
 * card's own date formatter. The end drops on the two safety faces and at the milestone,
 * where a date the trial is "on track" to reach is not what the screen is saying (round 2's
 * frames); overrun says `window ended`, the strip's words. A terminal trial reads the
 * card's own date range.
 */
function sublineFor(
  input: TrialCardInput,
  foodLabel: string | null,
  dayLine: string | null,
  state: TrialCardState,
): string | null {
  const trial = input.trial;
  if (!trial) return null;
  const parts: string[] = [];
  if (foodLabel) parts.push(foodLabel);
  if (state === 'completed' || state === 'abandoned') {
    if (dayLine) parts.push(dayLine);
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  const startIndex = localDayIndexOf(trial.startedAt);
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    input.nowMs,
  );
  if (startIndex === null || !progress) return parts.length > 0 ? parts.join(' · ') : null;
  const today = toLocalDayKey(new Date(input.nowMs));
  parts.push(`since ${formatTrialDate(startIndex, today)}`);
  const end = trialEndPart(input, state);
  if (end !== null) parts.push(end);
  return parts.join(' · ');
}

/**
 * The running trial's end clause (`ends Oct 29` / `window ended Oct 29`), or null where the
 * screen drops it: the two safety faces, the milestone, an ended trial, or no day math.
 * Shared with the Pet tab's door (`lib/trialDoorRow.ts`, TS-6) so the two cannot disagree
 * about when a trial ends or when to stop saying so.
 */
export function trialEndPart(input: TrialCardInput, state: TrialCardState): string | null {
  const trial = input.trial;
  if (!trial || state === 'completed' || state === 'abandoned') return null;
  if (SAFETY_STATES.has(state) || state === 'milestone') return null;
  const startIndex = localDayIndexOf(trial.startedAt);
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    input.nowMs,
  );
  if (startIndex === null || !progress) return null;
  const today = toLocalDayKey(new Date(input.nowMs));
  const end = formatTrialDate(trialEndDayIndex(startIndex, trial.targetDurationDays), today);
  return progress.dayCounter > progress.targetDays ? `window ended ${end}` : `ends ${end}`;
}
