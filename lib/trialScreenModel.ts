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
  coverageLine,
  formatTrialDate,
  isAnimalNotEating,
  resolveTrialCard,
  resolveTrialStrip,
  trialEndDayIndex,
  type TrialCardAction,
  type TrialCardInput,
  type TrialCardLine,
  type TrialCardState,
} from './dietTrialCard';
import { buildTrialLedger, type TrialLedger } from './trialLedger';
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
  /** The milestone's headline (the card's day line in its headline role). */
  headline: string | null;
  /** The decision block drawn inline above the record (milestone: its note and three
   *  choices; overrun: its note and "Tell Culprit what's next"). */
  decision: { notes: string[]; actions: TrialCardAction[] } | null;
  /** §3.4 — the strongest row on the screen, only when the allowed set is hydrated. */
  allowedFoods: TrialScreenDoor | null;
  /** §3.5 — null on every state that withholds it. */
  ledger: TrialLedger | null;
  /** §3.6 — the card's record region, in its order, with the qualifier lifted to `qualifier`. */
  facts: TrialCardLine[];
  /** §3.7 — `resolveTrialStrip(input).trialResponseLine`, verbatim. */
  vomiting: string | null;
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
  /** §3.9 — "Manage the trial" at the bottom of a running, non-safety trial. */
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
  /** Whether the route's pet is the active one — `/report` reads the active pet. */
  isActivePet: boolean;
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
const RUNNING_STATES: ReadonlySet<TrialCardState> = new Set([
  'day_one', 'clean', 'exposures', 'below_floor', 'free_fed', 'milestone', 'overrun',
]);

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

  const card = resolveTrialCard(input);
  const strip = resolveTrialStrip(input);
  const state = card.state;
  const safety = SAFETY_STATES.has(state);
  const decisionState = DECISION_STATES.has(state);
  const notEating = isAnimalNotEating(input);
  const withheldCoverage = notEating && input.coverage ? coverageLine(input.coverage) : null;

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
      // Lifted to the card's foot, verbatim (a floor suffix rides with it). Once.
      if (qualifier === null) qualifier = line.text;
    } else if (withheldCoverage !== null && line.role === 'fact' && line.text === withheldCoverage) {
      // S7: the strip withholds its ratio over a pet that may not be eating; so does this.
      continue;
    } else {
      factLines.push(line);
    }
  }

  const ledger =
    safety || state === 'milestone' || notEating || facts.status !== 'ready'
      ? null
      : buildTrialLedger({ input, facts: facts.facts, timeZone: args.timeZone });

  const hasAction = (id: TrialCardAction['id']) => card.actions.some((a) => a.id === id);
  const allowedAction = card.actions.find((a) => a.id === 'view_allowed_foods');
  const allowedFoods =
    allowedAction && args.allowedSet.status === 'ready'
      ? {
          label: allowedAction.label,
          sub: allowedFoodsSubline(
            allowedFoodsOn(
              args.allowedSet.ctx,
              localDayIndex(input.nowMs, args.timeZone),
            ).filter((f) => f.role !== 'primary_diet').length,
          ),
        }
      : null;

  const offDiet = input.exposures?.offDiet ?? 0;
  const terminal = state === 'completed' || state === 'abandoned';
  const exposures =
    !terminal && offDiet > 0
      ? { label: EXPOSURES_DOOR, sub: null }
      : null;

  // The state's own actions. The doors carry the card's two references (the allowed list
  // and the exposures list), so neither is repeated as an action; the decision block
  // carries the milestone's and the overrun's.
  //
  // `/report` builds the ACTIVE pet's report, so from another pet's screen either door to
  // it would build the wrong animal's (C-9). Both are withheld there until the report
  // takes a pet (CUL-1334). Correct-but-absent beats confidently wrong.
  const actions = decisionState
    ? []
    : card.actions.filter(
        (a) =>
          a.id !== 'view_allowed_foods' &&
          a.id !== 'view_exposures' &&
          (a.id !== 'open_report' || args.isActivePet),
      );

  // The vet report door, unless the state's own action already is that door (S8: one door
  // per action).
  const report =
    args.isActivePet && !hasAction('open_report') ? { label: VET_REPORT_DOOR, sub: null } : null;

  return {
    kind: 'trial',
    state,
    petName: args.petName,
    title: strip?.header ?? card.kicker,
    subline: sublineFor(input, card.foodLabel, card.dayLine, state),
    safety: safety && safetyLines.length > 0 ? safetyLines : null,
    headline: card.dayLineRole === 'headline' ? card.dayLine : null,
    decision: decisionState ? { notes: decisionNotes, actions: card.actions } : null,
    allowedFoods,
    ledger,
    facts: factLines,
    vomiting: strip?.trialResponseLine ?? null,
    qualifier,
    standingMeta: card.standingMeta,
    standingNote: card.standingNote,
    exposures,
    getReady: args.appointment
      ? { label: GET_READY_DOOR, sub: args.appointment.when, appointmentId: args.appointment.id }
      : null,
    report,
    actions,
    manage: RUNNING_STATES.has(state) ? MANAGE_THE_TRIAL : null,
  };
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
  if (!SAFETY_STATES.has(state) && state !== 'milestone') {
    const end = formatTrialDate(trialEndDayIndex(startIndex, trial.targetDurationDays), today);
    parts.push(progress.dayCounter > progress.targetDays ? `window ended ${end}` : `ends ${end}`);
  }
  return parts.join(' · ');
}
