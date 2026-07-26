// Diet-trial card v2 — the pure state resolver (B-417 PR 4, executes D2).
// Spec: docs/nyx-diet-trial-requirements.md §4.2 (the card), §5.1 (two facts),
//       §5.2 (G2 — what the app may say), §5.6 (free-fed + multi-pet),
//       §6 (clinical invariants). Design lock: docs/nyx-diet-trial-mockups.html
//       (round 4, eleven states).
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
// §4.2: "One card, one layout. The eleven states are WHICH STRINGS occupy the
// fact and note lines — a switch, not eleven components." That switch is here,
// as a pure function, because §12's QA finding is that every previous card
// criterion was "a manual assertion against an undefined oracle" — there is not
// a single test anywhere under `app/(tabs)/`. A model this function returns IS
// the oracle: every state's literal strings are assertable without mounting a
// screen, and the component below it only lays them out.
//
// ── THE TWO RULES THIS FILE ENFORCES BY CONSTRUCTION ─────────────────────────
//
// R2 — NO BLENDED COVERAGE/ADHERENCE METRIC, IN ANY FORM (D2; §6.9). Not a
// string, ring, badge, grade, colour or BAR WIDTH. The model carries exactly one
// number a view may turn into a width — `progressFraction` — and it is
// `getDietTrialProgress().fraction`, i.e. DAY progress, and nothing else. There
// is deliberately no other 0..1 field on the model for a view to reach for. The
// shipped defect this replaces (`profile.tsx:770`) bound the bar's width to a
// "% compliance" that measured logging, so day 2 of 56 rendered a nearly-full
// bar; deleting only the STRING would have shipped that bar unchanged, which is
// why the acceptance criterion is asserted on the computed width prop.
//
// R1 — THE NEGATIVE CLAIM IS DELETED FROM THE PRODUCT (G2, ruled as a RULE and
// not a threshold). "No off-diet foods logged" renders at no coverage, on no
// surface. Every claim here is in POSITIVE form about the RECORD, carries BOTH
// denominators, and drags its blind-spot qualifier inline. Coverage (days with a
// non-treat feeding) and exposures (feedings) are different units — roughly 3×
// apart — so they never share a sentence.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT DECIDE ──────────────────────────────
// It does not classify a feeding, and it does not know what "off-diet" means.
// That is `lib/dietTrial.ts` (PR 5, `adversarial-reviewer` mandatory), which
// pins the §5.1 metric and sets the coverage floor. Every such judgement arrives
// here as an INPUT: `exposures`, `belowCoverageFloor`. When the classifier has
// not run, `exposures` is null and the adherence sentence simply does not
// render — silence, never an all-clear (the same asymmetry as B-351 D10).
import { getDietTrialProgress } from './analytics';
import { milestoneNote, trialDecisionChoices, type TrialOutcome } from './dietTrialCompletion';
import { localDayIndexOf } from './utils';
import type { TrialIndication } from './dietTrialSetup';

const MS_PER_DAY = 86_400_000;

// ── Inputs ───────────────────────────────────────────────────────────────────

export type TrialStatus = 'active' | 'completed' | 'abandoned';

/** Owned by `dietTrialCompletion.ts` (which the milestone imports from), re-exported
 *  here because every existing consumer reads it off the card's model. */
export type { TrialOutcome };

export interface TrialCardTrial {
  /** The row's id. The RESOLVER never reads it — it is carried on the input so the
   *  hosting screen has something to write against when the milestone's actions
   *  fire (PR 6), without a second query for a row it already loaded. */
  id?: string;
  status: TrialStatus;
  /** 'YYYY-MM-DD' (the DATE column) or ISO. */
  startedAt: string;
  /** 'YYYY-MM-DD' — written on BOTH completed and abandoned (§3.1). */
  endedAt?: string | null;
  targetDurationDays: number;
  /** `diet_trials.food_label`, else the joined food's "Brand Product". */
  foodLabel?: string | null;
  /** The stored `stopped_reason`. PR 3's `endActiveTrial` writes a closed set of
   *  TOKENS (`vet_advised` / `refused` / `other` / `completed`), documented in
   *  `lib/dietTrialSetup.ts` as load-bearing — so this resolver maps the tokens
   *  to display phrases itself and never interpolates the raw value ("Stopped
   *  because refused." is not a sentence). Unrecognised values render verbatim,
   *  which keeps PR 6 free to add reasons without a silent blank. */
  stoppedReason?: string | null;
  /** True when the trial was abandoned because the pet refused the diet.
   *  DERIVED from the stored token when omitted — callers do not need to set it,
   *  and the round-1b rule (a refused trial renders no adherence line anywhere)
   *  cannot be lost to a caller that forgot the flag. */
  stoppedForRefusal?: boolean;
  outcome?: TrialOutcome | null;
  /** What the trial is FOR (§4.1). Read by the MILESTONE only, and only for two
   *  things §4.3 keys on it: the GI continuation sentence and the named extension
   *  default. PR 4 deliberately did not select this column — it is diagnosis-grade
   *  ('skin' names a suspected condition) and the card had no use for it. PR 6 is
   *  the use. The constraint it was carried from still stands where it was written:
   *  `indication` stays OUT of the App Group / widget projection, which crosses a
   *  process boundary and renders a day counter. This card renders on the pet's own
   *  profile, next to the pet's own trial diet, in the app. */
  indication?: TrialIndication | null;
}

/** §5.1 coverage: distinct local days with ≥1 logged NON-TREAT feeding, over the
 *  trial's own overlap range. `daysElapsed` is the day counter, so the two sides
 *  of the ratio are on one clock (B-421). */
export interface TrialCoverageFacts {
  daysLogged: number;
  daysElapsed: number;
}

/** §5.1 exposures: in-window feedings classified by §5.3, with their OWN feeding
 *  denominator. Supplied by PR 5's `classifyFeeding`; null until it ships. */
export interface TrialExposureFacts {
  /** Every in-window feeding — treats included. */
  totalFeedings: number;
  /** How many of those were classified off-diet. A FLOOR, never a total. */
  offDiet: number;
  /** The most recent exposure, for state 3's record-and-continue note. */
  mostRecent?: { label: string; when: string } | null;
}

export interface TrialCardInput {
  /** null when this pet has no trial on record → state 0. */
  trial: TrialCardTrial | null;
  nowMs: number;
  petName: string;
  species?: 'dog' | 'cat' | 'other';
  coverage?: TrialCoverageFacts | null;
  exposures?: TrialExposureFacts | null;
  /** §5.2 — a live intake-decline flag REPLACES the adherence line entirely. */
  intakeDeclineHeadline?: string | null;
  /** §5.6 — an overlapping free-choice arrangement replaces the coverage RATIO. */
  freeFed?: { loggedFeedings: number } | null;
  /** §5.6 — other non-archived pets in the household. Gates the CLAIM only. */
  otherPetNames?: string[];
  /** Object pronoun for state 0's forward line ("put HIM on an elimination
   *  diet"), from the shipped `lib/utils.petPronouns` — the app records a pet's
   *  sex, so this is a known fact rather than a guess. Defaults to 'them', which
   *  is also what `petPronouns` returns for an unknown sex. */
  petObjectPronoun?: string;
  /** §5.2 — set by PR 5, which owns the floor's number. Never computed here. */
  belowCoverageFloor?: boolean;
  /** C2 standing fact, re-sited from slice 4's `TrialContaminantNote`. */
  standingNote?: { title: string; body: string } | null;
  /** B-351 slice 4's target-protein line — the assumption the contaminant check
   *  rests on, rendered where the owner can see it is wrong. Quiet metadata, not
   *  a safety card; re-sited here for the same reason as `standingNote`. */
  standingMeta?: string | null;
}

// ── Output model ─────────────────────────────────────────────────────────────

export type TrialCardState =
  | 'no_trial'        // 0
  | 'day_one'         // 1
  | 'clean'           // 2
  | 'exposures'       // 3
  | 'below_floor'     // 4
  | 'milestone'       // 5
  | 'overrun'         // 6
  | 'completed'       // 7a
  | 'abandoned'       // 7b
  | 'intake_decline'  // 8  — replacement
  | 'free_fed';       // 9  — replacement

/** Line roles, so a test can assert a literal string AT its role rather than by
 *  index, and so the view never has to infer emphasis from position.
 *   lead      — the sentence that owns the card in a replacement state
 *   fact      — a record statement with its own denominator (§5.1)
 *   qualifier — the inline blind-spot line; §5.2 forbids making it a legend
 *   caveat    — §5.6's multi-pet scope gate on the claim above it
 *   note      — record-and-continue / outcome / overrun prose (§6.7)
 *   forward   — the "keep going" line; the card's actual job (§4.2) */
export type TrialCardLineRole =
  | 'lead' | 'fact' | 'qualifier' | 'caveat' | 'note' | 'forward';

export interface TrialCardLine {
  role: TrialCardLineRole;
  text: string;
}

/** Actions are declared by the model but rendered ONLY when the surface passes a
 *  handler for the id (see `DietTrialCard`). PR 4 shipped the card before PR 3's
 *  start modal and PR 6's completion sheet existed, and a button that goes nowhere
 *  is worse than no button. */
export type TrialCardActionId =
  | 'start_trial'          // PR 3
  | 'milestone'            // PR 6 — the overrun card's single way into the decision
  | 'trial_extend'         // PR 6 — "Keep going — 4 more weeks"
  | 'trial_complete'       // PR 6 — "This trial is done" → the outcome sheet
  | 'trial_stopped_early'  // PR 6 — "Stopped early" → the reason sheet
  | 'open_report'          // shipped (/report)
  | 'view_exposures';      // PR 5's list screen

/** `primary` draws a filled button, `secondary` a ghost one, `link` the quiet
 *  inline "Label ›".
 *
 *  This field exists because §4.3 makes relative weight an ACCEPTANCE CRITERION
 *  (`Keep going` is never weaker than `This trial is done`), and a criterion
 *  asserted on a StyleSheet is a criterion asserted on nothing. Declaring weight
 *  on the model makes it assertable in the resolver's own test, next to the copy
 *  it governs — the same reasoning that put `progressFraction` on the model
 *  rather than leaving the bar's width to the view. */
export type TrialCardActionEmphasis = 'primary' | 'secondary' | 'link';

export interface TrialCardAction {
  id: TrialCardActionId;
  label: string;
  emphasis: TrialCardActionEmphasis;
}

export interface TrialCardModel {
  state: TrialCardState;
  /** "Diet trial" | "Diet trial · finished" | "Diet trial · stopped early". */
  kicker: string;
  foodLabel: string | null;
  /** "Day 23 of 56" | "Day 61 — 5 days past the window you set" | a date range. */
  dayLine: string | null;
  /**
   * How the day line reads: quiet metadata on every ordinary day, a HEADLINE at
   * the milestone.
   *
   * On the model rather than inferred from `state` in the view, for the same
   * reason `TrialCardAction.emphasis` is: the design lock draws the milestone's
   * day line as a 21px serif headline (`.milestone-h`) and every other day's as
   * caption-scale secondary text, and PR 6's first cut routed both through the
   * same `styles.dayLine` — so the sentence that has to stop an owner on the one
   * day it matters rendered exactly like "Day 23 of 56" on an ordinary Tuesday,
   * and the largest text on the milestone card was the food label. A view that
   * decides that from `state` puts a §4.3 requirement somewhere no test reaches.
   */
  dayLineRole: 'meta' | 'headline';
  /** "Ends 27 August" | "Window ended 27 August". */
  windowLine: string | null;
  /** DAY progress in [0,1], or null when a bar would carry no information.
   *  R2: this is `getDietTrialProgress().fraction` and NOTHING else. */
  progressFraction: number | null;
  lines: TrialCardLine[];
  /** In reading order, and reading order is itself weight (§4.3). Empty when the
   *  state offers nothing to do. Most states declare one; the milestone declares
   *  the three-way decision row. */
  actions: TrialCardAction[];
  /** C2's trial-level standing fact — never a per-feeding verdict. */
  standingNote: { title: string; body: string } | null;
  /** B-351's target-protein disclosure line. Quiet metadata. */
  standingMeta: string | null;
}

// ── Copy constants (LOCKED strings live here, once) ──────────────────────────

/** §5.2 LOCKED. Rewritten at v1.0: the old line said "flavoured medications …
 *  aren't visible here", which C3 falsified by ruling the chewable lane INTO v1
 *  — it told the reader to discount a line the app now detects. The residual it
 *  still has to name is B-419: flavoured NON-chewable forms. */
export const BLIND_SPOT_QUALIFIER =
  "Culprit only sees what's logged — flavoured liquids and tablets, other " +
  'households and foraging aren’t visible here.';

/** §6.7, CAVD verbatim in both owner handouts. No restart language, no voiding
 *  language, and no QUANTIFIED reassurance ("a small amount probably won't
 *  matter") — the cross-contact threshold is explicitly unknown. */
export const RECORD_AND_CONTINUE =
  'Keep going with the trial diet. Your vet will want to see this at the recheck.';

/** The decision's ids are owned by `dietTrialCompletion` (the sheet reads them
 *  too); the card's action ids are its own namespace. One map, so the milestone's
 *  buttons and the sheet's choices can never drift into two vocabularies. */
const DECISION_ACTION_ID: Record<'extend' | 'complete' | 'stopped_early', TrialCardActionId> = {
  extend: 'trial_extend',
  complete: 'trial_complete',
  stopped_early: 'trial_stopped_early',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Small pure helpers ───────────────────────────────────────────────────────

/** "3 July". Formatted from the day INDEX rather than via `toLocaleDateString`
 *  so the string is identical under every device locale and test environment —
 *  a date on this card is read next to a vet's instructions, not localised. */
export function formatTrialDate(dayIndex: number): string {
  const d = new Date(dayIndex * MS_PER_DAY);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Day 1 IS the start day, so the last day of an N-day window is start + N - 1.
 *  (3 July + 56 days ends 27 August, matching the design lock.) */
export function trialEndDayIndex(startIndex: number, targetDays: number): number {
  return startIndex + Math.max(1, Math.floor(targetDays)) - 1;
}

/** "5 weeks", "6 days", "1 day" — the forward line's unit. Weeks once there is a
 *  week to speak of, because an owner plans an 8-week commitment in weeks. */
function remainingPhrase(daysRemaining: number): string | null {
  if (daysRemaining <= 0) return null;
  if (daysRemaining < 7) return daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;
  const weeks = Math.round(daysRemaining / 7);
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

/** "Mochi" / "Mochi and Rex" / "Mochi, Rex and Bo". */
function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ── The two fact sentences (§5.1 — never welded together) ────────────────────

/** Coverage. Days with a non-treat feeding, over days elapsed. This sentence is
 *  about DAYS WITH MEALS and may never carry the feeding count: a treat-only day
 *  is excluded from this numerator and included in the exposure denominator, and
 *  15.7% of live covered days are treat-only, so a welded sentence is false in a
 *  common case (the v0.97 correction). */
function coverageLine(coverage: TrialCoverageFacts): string {
  return `Meals logged on ${coverage.daysLogged} of ${coverage.daysElapsed} days.`;
}

/** Exposures. Feedings, over feedings. POSITIVE form about the record — the
 *  clean variant describes what MATCHED, and there is no variant anywhere in
 *  this file that describes what was absent (R1). */
function exposureLine(ex: TrialExposureFacts): string {
  const total = ex.totalFeedings;
  const noun = total === 1 ? 'feeding' : 'feedings';
  if (ex.offDiet <= 0) {
    return `${total} ${noun} in total — all ${total} matched the trial diet or a permitted food.`;
  }
  return `${total} ${noun} in total — ${total - ex.offDiet} matched, ${ex.offDiet} did not.`;
}

/** §5.2: "the exposure count is a floor, never a total." Said ON the claim. */
function floorSuffix(offDiet: number): string {
  return offDiet === 1
    ? ' That 1 is what’s been logged, not a total.'
    : ` The ${offDiet} are what’s been logged, not a total.`;
}

// ── The resolver ─────────────────────────────────────────────────────────────

export function resolveTrialCard(input: TrialCardInput): TrialCardModel {
  const { trial, petName } = input;

  if (!trial) return noTrialCard(petName, input.petObjectPronoun ?? 'them');

  const startIndex = localDayIndexOf(trial.startedAt);
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    input.nowMs,
  );

  // An unparseable start date is the one case with no honest day line. Render the
  // card's identity and nothing that would be a guess — in particular no fact
  // lines, because every one of them is denominated in days elapsed.
  if (!progress || startIndex === null) {
    return {
      state: trial.status === 'abandoned' ? 'abandoned'
        : trial.status === 'completed' ? 'completed'
          : 'day_one',
      kicker: trial.status === 'abandoned' ? 'Diet trial · stopped early'
        : trial.status === 'completed' ? 'Diet trial · finished'
          : 'Diet trial',
      foodLabel: trial.foodLabel ?? null,
      dayLine: null,
      dayLineRole: 'meta',
      windowLine: null,
      progressFraction: null,
      lines: [],
      actions: [],
      standingNote: input.standingNote ?? null,
      standingMeta: input.standingMeta ?? null,
    };
  }

  if (trial.status === 'completed') return completedCard(input, trial, startIndex);
  if (trial.status === 'abandoned') return abandonedCard(input, trial, startIndex);

  return activeCard(input, trial, startIndex, progress);
}

// ── State 0 ──────────────────────────────────────────────────────────────────

function noTrialCard(petName: string, objectPronoun: string): TrialCardModel {
  return {
    state: 'no_trial',
    kicker: 'Diet trial',
    foodLabel: null,
    dayLine: null,
    dayLineRole: 'meta',
    windowLine: null,
    progressFraction: null,
    lines: [
      { role: 'lead', text: 'No trial running.' },
      {
        role: 'forward',
        // Names the PAYOFF, not the feature (Principle 5 — empty states are
        // features). Verbatim from the design-locked mock, and from the string
        // B-417 PR 3 shipped — the two must not drift, because PR 3's modal is
        // what this card's action opens.
        text:
          `If ${petName}’s vet has put ${objectPronoun} on an elimination diet, ` +
          'tell Culprit — it keeps the dated record your vet will ask for at the recheck.',
      },
    ],
    actions: [{ id: 'start_trial', label: 'Start a diet trial', emphasis: 'secondary' }],
    standingNote: null,
    standingMeta: null,
  };
}

// ── States 1–6 (the active trial) ────────────────────────────────────────────

function activeCard(
  input: TrialCardInput,
  trial: TrialCardTrial,
  startIndex: number,
  progress: NonNullable<ReturnType<typeof getDietTrialProgress>>,
): TrialCardModel {
  const { petName } = input;
  const endIndex = trialEndDayIndex(startIndex, trial.targetDurationDays);
  const overrunDays = progress.dayCounter - progress.targetDays;

  const base = {
    kicker: 'Diet trial',
    foodLabel: trial.foodLabel ?? null,
    // R2: the ONLY number that becomes a width, and it is day progress.
    progressFraction: progress.fraction,
    standingNote: input.standingNote ?? null,
    standingMeta: input.standingMeta ?? null,
  };

  // ── Replacement (8) — intake decline. Checked FIRST, and it is structural:
  // while the flag is live this function is INCAPABLE of returning an adherence
  // line, because it returns here. §5.2 proof #1 is a cat that refuses the
  // hydrolyzed diet every day whose owner dutifully logs the offered bowl —
  // 100% coverage, 0 exposures, a maximally clean trial rendered over a starving
  // animal seven times past the feline 48h hepatic-lipidosis window.
  if (input.intakeDeclineHeadline) {
    // The 48h hepatic-lipidosis window is FELINE, so the cat line names
    // "today". The dog line is firm without borrowing a feline urgency.
    const lines: TrialCardLine[] = [];
    pushDeclineLines(lines, input);
    return {
      ...base,
      state: 'intake_decline',
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      // THE DECLINE REPLACES THE RECORD LINES, NOT THE WAY OUT OF THE TRIAL.
      //
      // This branch returned `actions: []` unconditionally, which meant that while
      // a decline flag was live a trial that had reached its window had NO
      // affordance at all: §4.3's "never expires and re-surfaces until acted on"
      // silently failed, the trial stayed `active`, and §7 then rendered a stopped
      // intervention as one still under way — on the sickest patient the feature
      // has. Found by `adversarial-reviewer`; `pm-feature-review` reached the same
      // place from the owner's side.
      //
      // What §5.2 actually says is that the flag replaces the ADHERENCE LINE, and
      // the record lines above are duly gone. The decision is a different thing,
      // and it stays reachable — quietly, as one link rather than the three-button
      // row, because a card about a pet that has stopped eating is not a decision
      // surface. Only once the window is actually up; mid-trial there is nothing
      // to decide.
      // Same rule the milestone applies one branch down: at or past the target the
      // bar is pinned at 100%, and a saturated bar is completion vocabulary drawn
      // in pixels. It was doubly wrong here — drawn over a pet that has stopped
      // eating, on the card whose entire job is to say the animal outranks the
      // trial. Mid-trial the bar still carries real day progress, so it stays.
      progressFraction: overrunDays >= 0 ? null : progress.fraction,
      actions:
        overrunDays >= 0
          ? [{ id: 'milestone', label: 'Tell Culprit what’s next', emphasis: 'link' }]
          : [],
    };
  }

  // ── State 5 — the milestone (PR 6, §4.3). Day counter has REACHED the target
  // exactly. Persistent STATE, not a push, so Principle 4 is untouched — and it
  // never expires: the owner who ignores it lands in state 6, which carries the
  // same decision behind one quieter action.
  //
  // ACTION FIRST; the verdict is asked only after the owner has decided what
  // happens next. A milestone that asks "how did it go?" first turns an unanswered
  // card into a stalled trial, and a stalled trial is the one the vet report
  // renders as still ongoing.
  //
  // IT MUST NEVER READ AS PERMISSION TO STOP. No completion vocabulary reaches
  // this state (the greppable guard in the test file is the enforcement): the day
  // line states a fact about a window the OWNER set, and the note hands the
  // clinical decision straight to the vet. On the GI indication that note gains
  // the ACVIM ≥12-week continuation sentence, because a day-28 or day-42 "trial
  // complete" would otherwise tell an owner to stop a diet their vet wanted
  // continued for three months — §4.3 names this as the live clinical harm, and
  // it is why the milestone copy cannot be one string.
  //
  // Deliberately NO fact lines. The record statement is not what this moment is
  // for, and putting coverage next to a stop button invites reading the coverage
  // as the trial's result.
  if (progress.targetDays > 0 && overrunDays === 0) {
    return {
      ...base,
      state: 'milestone',
      dayLine: `Day ${progress.dayCounter} of ${progress.targetDays} — the window you set is done.`,
      dayLineRole: 'headline',
      windowLine: null,
      // NO BAR HERE, and it is the same argument `completedCard` already makes one
      // state along ("a full bar would be decoration, and decoration on this card
      // is what R2 exists to stop") — only stronger. At the milestone the bar is
      // pinned at 100% directly above copy working hard to avoid saying the trial
      // is complete: R2 governs what the bar MEASURES, but a saturated bar is
      // completion vocabulary drawn in pixels, which is the one thing §4.3 forbids
      // this state from saying. The design lock draws the milestone with no bar.
      progressFraction: null,
      lines: [{ role: 'note', text: milestoneNote(trial.indication) }],
      actions: trialDecisionChoices(trial.indication).map((c) => ({
        id: DECISION_ACTION_ID[c.id],
        label: c.label,
        emphasis: c.emphasis,
      })),
    };
  }

  const lines: TrialCardLine[] = [];
  const state: TrialCardState =
    overrunDays > 0 ? 'overrun'
      : input.freeFed ? 'free_fed'
        : input.belowCoverageFloor ? 'below_floor'
          : progress.dayCounter === 1 ? 'day_one'
            : (input.exposures?.offDiet ?? 0) > 0 ? 'exposures'
              : 'clean';

  // ── State 1 — day 1. No claim in EITHER direction, because there is nothing
  // yet to describe. Note what is absent: no "0 off-diet foods", which R1
  // forbids and which day 1 would otherwise render most confidently.
  if (state === 'day_one') {
    if ((input.coverage?.daysLogged ?? 0) === 0) {
      lines.push({ role: 'fact', text: 'Nothing logged yet today.' });
    }
    lines.push({
      role: 'forward',
      text: 'From here, every meal and treat you log builds the record your vet reads.',
    });
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      actions: [],
    };
  }

  // ── Replacement (9) — free-fed (§5.6). A `free_choice` arrangement emits no
  // meal events, so the coverage RATIO has no denominator: it is replaced by the
  // intakeNotDirectlyObserved marker, mirroring lib/analytics invariant #6.
  // Without this the most tightly controlled feline trial in the app scores
  // near-zero coverage and Culprit spends eight weeks telling a compliant owner
  // she is failing.
  if (state === 'free_fed' && input.freeFed) {
    lines.push({
      role: 'lead',
      text:
        `${petName} grazes from a bowl that’s topped up, so there’s no day-by-day ` +
        'count of what was eaten.',
    });
    const n = input.freeFed.loggedFeedings;
    const ex = input.exposures;
    lines.push({
      role: 'fact',
      text:
        ex && ex.offDiet <= 0
          ? `${n} bowl top-ups and wet meals logged; all ${n} were the trial diet.`
          : ex
            ? `${n} bowl top-ups and wet meals logged; ${n - ex.offDiet} were the trial diet, ${ex.offDiet} were not.`
            : `${n} bowl top-ups and wet meals logged.`,
    });
    lines.push({ role: 'qualifier', text: BLIND_SPOT_QUALIFIER });
    pushScopeCaveat(lines, input);
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      actions: [],
    };
  }

  // ── State 4 — below the coverage floor. Jordan's binding constraint: the owner
  // below the floor is BY DEFINITION the one logging least, which is the one
  // closest to quitting, so handing them the emptiest, most disapproving card in
  // the app is exactly backwards. The card gets MORE here, not less — and every
  // sentence is about the RECORD, never the person (§6.9).
  if (state === 'below_floor') {
    lines.push({
      role: 'lead',
      text: 'There isn’t enough logged yet for your vet to read much into this.',
    });
    const remaining = remainingPhrase(progress.daysRemaining);
    lines.push({
      role: 'forward',
      text: remaining
        ? `Every meal from here counts, and there are ${remaining} left to build it.`
        : 'Every meal from here counts.',
    });
    lines.push({ role: 'fact', text: soFarLine(input) });
    lines.push({ role: 'qualifier', text: BLIND_SPOT_QUALIFIER });
    pushScopeCaveat(lines, input);
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      actions: [],
    };
  }

  // ── States 2, 3 and 6 share one body: coverage, then exposures, then the
  // inline qualifier. They differ in the day/window header and the note.
  pushRecordFacts(lines, input);

  if (state === 'overrun') {
    // §4.2 state 6: "Day 61 — 5 days past", NEVER "Day 61 of 56" (a PR 7
    // criterion, and the same string reaches the widget header). The bar clamps
    // at 100% and stops carrying information — which is deliberate, and the
    // reason the copy takes over here.
    lines.push({
      role: 'note',
      text:
        'Still running. Plenty of trials run past their window on the vet’s say-so. ' +
        'When you know what’s next, tell Culprit — a trial with no ending reads to ' +
        'your vet as one that’s still going.',
    });
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      actions: [{ id: 'milestone', label: 'Tell Culprit what’s next', emphasis: 'link' }],
    };
  }

  if (state === 'exposures') {
    // §6.7 record-and-continue. This is the screen that decides whether an owner
    // finishes six weeks, so it records the exposure, does not scold, and does
    // not tell them the trial is ruined — because it isn't, and a restart is
    // what actually loses the diagnosis.
    const recent = input.exposures?.mostRecent;
    lines.push({
      role: 'note',
      text: recent
        ? `${recent.when} — ${recent.label}. ${RECORD_AND_CONTINUE}`
        : RECORD_AND_CONTINUE,
    });
  } else {
    const remaining = remainingPhrase(progress.daysRemaining);
    if (remaining) lines.push({ role: 'forward', text: `${remaining} to go.` });
  }

  return {
    ...base,
    state,
    dayLine: dayLineFor(progress, overrunDays),
    dayLineRole: 'meta',
    windowLine: windowLineFor(endIndex, overrunDays),
    lines,
    actions:
      state === 'exposures' && (input.exposures?.offDiet ?? 0) > 0
        ? [{ id: 'view_exposures', label: 'Outside the trial diet', emphasis: 'link' }]
        : [],
  };
}

/** The §5.2 replacement, shared by the active and BOTH terminal cards: the
 *  decline fact leads, the note names the priority, and no record line renders
 *  while it is live. */
function pushDeclineLines(lines: TrialCardLine[], input: TrialCardInput): void {
  if (!input.intakeDeclineHeadline) return;
  lines.push({ role: 'lead', text: input.intakeDeclineHeadline });
  lines.push({
    role: 'note',
    text:
      (input.species === 'cat'
        ? 'A cat that stops eating needs a call today, whatever the trial is doing.'
        : `A pet that goes off their food needs a call, whatever the trial is doing.`) +
      ' Culprit isn’t showing the trial numbers while this is going on.',
  });
}

function dayLineFor(
  progress: NonNullable<ReturnType<typeof getDietTrialProgress>>,
  overrunDays: number,
): string {
  if (overrunDays > 0) {
    const unit = overrunDays === 1 ? 'day' : 'days';
    return `Day ${progress.dayCounter} — ${overrunDays} ${unit} past the window you set`;
  }
  return `Day ${progress.dayCounter} of ${progress.targetDays}`;
}

function windowLineFor(endIndex: number, overrunDays: number): string {
  return overrunDays > 0
    ? `Window ended ${formatTrialDate(endIndex)}`
    : `Ends ${formatTrialDate(endIndex)}`;
}

/** The two record facts plus their inline qualifier, in §5.1 order. Coverage
 *  first (days), exposures second (feedings), never welded. */
function pushRecordFacts(lines: TrialCardLine[], input: TrialCardInput): void {
  if (input.coverage) lines.push({ role: 'fact', text: coverageLine(input.coverage) });

  const ex = input.exposures;
  if (ex) {
    lines.push({ role: 'fact', text: exposureLine(ex) });
    lines.push({
      role: 'qualifier',
      text: BLIND_SPOT_QUALIFIER + (ex.offDiet > 0 ? floorSuffix(ex.offDiet) : ''),
    });
    pushScopeCaveat(lines, input);
    return;
  }

  // No classifier yet (PR 5). The coverage fact still carries its blind-spot
  // qualifier — it is a claim about the record and §5.2 makes the qualifier
  // permanent ON the claim — but NOTHING is said about what was or was not
  // matched. Silence, not an all-clear.
  if (input.coverage) lines.push({ role: 'qualifier', text: BLIND_SPOT_QUALIFIER });
}

/** State 4's single combined sentence — deliberately one paragraph, because the
 *  sub-floor card leads with the record's limits and then discloses what IS on
 *  it, rather than opening with a ratio that reads as a score. */
function soFarLine(input: TrialCardInput): string {
  const parts: string[] = [];
  if (input.coverage) {
    parts.push(`meals on ${input.coverage.daysLogged} of ${input.coverage.daysElapsed} days`);
  }
  const ex = input.exposures;
  if (ex) {
    const noun = ex.totalFeedings === 1 ? 'feeding' : 'feedings';
    parts.push(`${ex.totalFeedings} ${noun} in total`);
    parts.push(
      ex.offDiet <= 0
        ? `all ${ex.totalFeedings} matched the trial diet or a permitted food`
        : `${ex.totalFeedings - ex.offDiet} matched and ${ex.offDiet} did not`,
    );
  }
  if (parts.length === 0) return 'Nothing is on the record for this trial yet.';
  const joined = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  return `Of what’s on the record so far: ${joined}.`;
}

/** §5.6 multi-pet. Gates the CLAIM, in the household where it is most likely
 *  false — coverage is per-pet by construction, so the clean-trial statement
 *  renders most confidently exactly where another pet's bowl is in reach. Fires
 *  on HOUSEHOLD PET COUNT alone: `feeding_arrangements.is_shared` ships INERT
 *  ("the UX always writes FALSE"), so a shared bowl is not knowable and no copy
 *  here may imply it is. Only attached when there is a claim above it to gate. */
function pushScopeCaveat(lines: TrialCardLine[], input: TrialCardInput): void {
  const others = input.otherPetNames ?? [];
  if (others.length === 0) return;
  if (!lines.some((l) => l.role === 'fact')) return;
  lines.push({
    role: 'caveat',
    text:
      `${input.petName} shares a home with ${joinNames(others)}. Culprit records food ` +
      `against one pet at a time, so it can’t rule out ${input.petName} eating ` +
      'something logged for them.',
  });
}

// ── States 7a / 7b (terminal) ────────────────────────────────────────────────

/** "3 July – 27 August · 56 days". The end date is `ended_at` when it exists —
 *  §3.1 makes that column non-optional precisely so an ABANDONED trial has an
 *  end at all; without it `report.ts` reads a null end as "still ongoing" and
 *  the day counter renders "Day 104 of 28". */
function terminalRange(trial: TrialCardTrial, startIndex: number): string | null {
  const endIndex = trial.endedAt
    ? localDayIndexOf(trial.endedAt)
    : trialEndDayIndex(startIndex, trial.targetDurationDays);
  if (endIndex === null) return null;
  const days = Math.max(1, endIndex - startIndex + 1);
  return `${formatTrialDate(startIndex)} – ${formatTrialDate(endIndex)} · ${days} ${days === 1 ? 'day' : 'days'}`;
}

function outcomeSentence(petName: string, outcome: TrialOutcome): string {
  switch (outcome) {
    case 'improved': return `You said ${petName} was better at the end of it.`;
    case 'no_change': return `You said ${petName} was about the same at the end of it.`;
    case 'worse': return `You said ${petName} was worse at the end of it.`;
    case 'unsure': return `You said you weren’t sure how ${petName} did.`;
  }
}

function completedCard(
  input: TrialCardInput,
  trial: TrialCardTrial,
  startIndex: number,
): TrialCardModel {
  const lines: TrialCardLine[] = [];
  // §5.2's composition is TERMINAL-STATE-AWARE, in both of its forms. The
  // round-1b lesson was that a rule drawn as a live-flag replacement never
  // reached the terminal states; the first cut of THIS file repeated that
  // mistake in mirror image — it made refusal terminal-aware but let a live
  // intake-decline flag through, so a completed trial rendered "182 feedings —
  // 176 matched" over a cat that has stopped eating NOW. Found by the wrap's
  // adversarial pass. The decline outranks the record on every state, because
  // the animal outranks the trial.
  if (input.intakeDeclineHeadline) {
    pushDeclineLines(lines, input);
  } else {
    pushRecordFacts(lines, input);
  }
  // §4.3 IS A PROPERTY OF THE FLOW, AND THIS IS THE SCREEN AN OWNER LIVES WITH
  // AFTER ENDING IT. The fix commit carried the continuation sentence onto the
  // outcome SHEET and stopped there, so a GI owner read it once while deciding and
  // then saw a card headed "Diet trial · finished" with nothing about continuing —
  // on the indication ACVIM says continue >=12 weeks. Found by the second
  // `adversarial-reviewer` pass, which correctly called it this project's own
  // B-494 rule one surface over: a flow that teaches the owner it will tell them
  // about continuation may not then go silent.
  pushContinuation(lines, trial);

  if (trial.outcome) {
    lines.push({
      role: 'note',
      // Attribution is the whole point: the owner's read goes on the vet report
      // IN THEIR NAME, never as a finding Culprit computed (§6.1, §7).
      text:
        `${outcomeSentence(input.petName, trial.outcome)} That goes on the vet report ` +
        'in your name, so your vet reads it as your judgement rather than as ' +
        'something Culprit worked out.',
    });
  }
  return {
    state: 'completed',
    kicker: 'Diet trial · finished',
    foodLabel: trial.foodLabel ?? null,
    dayLine: terminalRange(trial, startIndex),
    dayLineRole: 'meta',
    windowLine: null,
    // A finished window has no progress left to encode; a full bar here would be
    // decoration, and decoration on this card is what R2 exists to stop.
    progressFraction: null,
    lines,
    actions: [{ id: 'open_report', label: 'Open vet report', emphasis: 'link' }],
    standingNote: input.standingNote ?? null,
    standingMeta: input.standingMeta ?? null,
  };
}

/** The stored tokens → the owner-facing phrase.
 *
 *  ALL SIX OF §4.3's REASONS ARE MAPPED, and the three PR 6 added are the reason
 *  this comment is longer than the function. The fallback renders an unrecognised
 *  value verbatim so a future reason is never a silent blank — which is a good
 *  failure mode for a token nobody has got to yet, and a terrible one for a token
 *  this very PR introduced. PR 6 added `cost` / `too_hard` / `symptoms_resolved`
 *  to `trialStopReasons` and, in its first cut, mapped none of them: the owner who
 *  tapped "Too expensive" read **"Stopped because cost."** and the one who tapped
 *  "Too hard to keep him off everything else" read **"Stopped because too_hard."**
 *  The sibling map in `generate-report/render.ts` had the same hole, so the vet
 *  read "Stopped: too_hard." on a clinical page. Adding a reason means touching
 *  BOTH maps; the fallback is not a substitute for either. */
function stoppedBecauseLine(petName: string, trial: TrialCardTrial): string {
  switch (trial.stoppedReason) {
    case 'refused': return `Stopped because ${petName} wouldn’t eat it.`;
    case 'vet_advised': return 'Stopped because the vet said to change diets.';
    case 'cost': return 'Stopped because of the cost.';
    // Names the difficulty without naming the owner as its cause (§6.9 — Culprit
    // never scores the owner). "Stopped because you couldn't keep him off other
    // food" is the same fact written as a failing.
    case 'too_hard': return 'Stopped because keeping other food away was too hard.';
    case 'symptoms_resolved': return 'Stopped because the symptoms cleared up.';
    case 'other': return 'Stopped early.';
    default: return `Stopped because ${trial.stoppedReason}.`;
  }
}

/**
 * The indication-keyed continuation sentence, on a terminal card.
 *
 * SKIPPED ON `vet_advised` ALONE, and that carve-out is the whole judgement here:
 * everywhere else the sentence answers a question the owner has just left open,
 * but when the vet is the one who said stop, "Your vet decides when the diet
 * changes" is Culprit restating a decision that has already been made — which
 * reads as second-guessing the clinician rather than deferring to them.
 *
 * The case it most exists for is `symptoms_resolved` on a GI trial: an owner who
 * stopped BECAUSE things improved has stopped a diet that may be working, short
 * of the ACVIM window, and without this the card renders their own stated reason
 * back at them unanswered.
 */
function pushContinuation(lines: TrialCardLine[], trial: TrialCardTrial): void {
  if (trial.stoppedReason === 'vet_advised') return;
  lines.push({ role: 'note', text: milestoneNote(trial.indication) });
}

/** Refusal is derived from the stored token unless the caller asserts it —
 *  structural, so the no-adherence-line rule cannot be dropped by omission. */
function wasRefused(trial: TrialCardTrial): boolean {
  return trial.stoppedForRefusal ?? trial.stoppedReason === 'refused';
}

function abandonedCard(
  input: TrialCardInput,
  trial: TrialCardTrial,
  startIndex: number,
): TrialCardModel {
  const lines: TrialCardLine[] = [];
  const range = terminalRange(trial, startIndex);
  const dayCount = range?.split('· ')[1] ?? 'these days';

  // Same terminal-state composition as completedCard — a live decline replaces
  // every record line, whatever else this card would have said.
  if (input.intakeDeclineHeadline) {
    if (trial.stoppedReason) {
      lines.push({ role: 'lead', text: stoppedBecauseLine(input.petName, trial) });
    }
    pushDeclineLines(lines, input);
    return {
      state: 'abandoned',
      kicker: 'Diet trial · stopped early',
      foodLabel: trial.foodLabel ?? null,
      dayLine: range,
      dayLineRole: 'meta',
      windowLine: null,
      progressFraction: null,
      lines,
      actions: [],
      standingNote: input.standingNote ?? null,
      standingMeta: input.standingMeta ?? null,
    };
  }

  if (trial.stoppedReason) {
    lines.push({ role: 'lead', text: stoppedBecauseLine(input.petName, trial) });
  }

  if (wasRefused(trial)) {
    // TERMINAL-STATE-AWARE, and this is a RULE change rather than a copy change
    // (the Jordan review, round 1b). §5.2's composition rule was drawn as a
    // LIVE-FLAG replacement only, so it never reached the terminal states —
    // and round 1 duly rendered "All 54 matched the trial diet or a permitted
    // food" three lines above "wouldn't eat it". A trial whose stopped_reason is
    // refusal is STRUCTURALLY incapable of rendering an adherence line: a diet
    // that wasn't eaten cannot be read as one that was followed.
    lines.push({
      role: 'note',
      text:
        'That’s a useful thing for your vet to know — it usually means a different ' +
        'diet, not a different plan.',
    });
    lines.push({
      role: 'fact',
      text:
        `Culprit isn’t showing how clean ${dayCount === 'these days' ? 'these days' : `these ${dayCount}`} were. ` +
        'A diet that wasn’t eaten can’t be read as one that was followed' +
        (input.coverage
          ? ` — the record is meals offered on ${input.coverage.daysLogged} of ${input.coverage.daysElapsed} days` +
            (input.exposures ? `, ${input.exposures.totalFeedings} feedings in total` : '') +
            ', and what your vet needs from it is the refusal.'
          : ', and what your vet needs from it is the refusal.'),
    });
  } else {
    pushRecordFacts(lines, input);
  }

  pushContinuation(lines, trial);

  return {
    state: 'abandoned',
    // §6.6 — an abandoned trial is a legitimate clinical fact, never a failure
    // state, so the kicker states what happened and judges none of it.
    kicker: 'Diet trial · stopped early',
    foodLabel: trial.foodLabel ?? null,
    dayLine: range,
    dayLineRole: 'meta',
    windowLine: null,
    progressFraction: null,
    lines,
    actions: [{ id: 'start_trial', label: 'Start a new trial', emphasis: 'link' }],
    standingNote: input.standingNote ?? null,
    standingMeta: input.standingMeta ?? null,
  };
}

// ── The Home strip (§4.2 — "a compact strip, not a second full card") ────────

export interface TrialStripModel {
  /** "Diet trial · day 23 of 56" | "Diet trial · day 61 — 5 days past". */
  header: string;
  /** One line: food · end date · coverage. Null while a safety flag is live. */
  line: string | null;
  /** R2 again: `getDietTrialProgress().fraction`, nothing else. */
  progressFraction: number;
}

/** Renders ONLY while a trial is active (§4.2) — Home gains nothing when there
 *  isn't one. Returns null in every other case, which is what the "renders only
 *  while a trial is active" acceptance criterion is asserted against. */
export function resolveTrialStrip(input: TrialCardInput): TrialStripModel | null {
  const { trial } = input;
  if (!trial || trial.status !== 'active') return null;

  const startIndex = localDayIndexOf(trial.startedAt);
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    input.nowMs,
  );
  if (!progress || startIndex === null) return null;

  const overrunDays = progress.dayCounter - progress.targetDays;
  const header = overrunDays > 0
    ? `Diet trial · day ${progress.dayCounter} — ${overrunDays} ${overrunDays === 1 ? 'day' : 'days'} past`
    : `Diet trial · day ${progress.dayCounter} of ${progress.targetDays}`;

  // While an intake-decline flag is live the strip carries the day count and
  // nothing else: SignalZone sits above it and owns the safety card, and a
  // coverage line under a pet that has stopped eating is the composition §5.2
  // forbids on the card for the same reason.
  if (input.intakeDeclineHeadline) {
    return { header, line: null, progressFraction: progress.fraction };
  }

  const parts: string[] = [];
  if (trial.foodLabel) parts.push(trial.foodLabel);
  const endIndex = trialEndDayIndex(startIndex, trial.targetDurationDays);
  parts.push(
    overrunDays > 0
      ? `window ended ${formatTrialDate(endIndex)}`
      : `ends ${formatTrialDate(endIndex)}`,
  );
  if (input.coverage) {
    parts.push(
      `meals logged on ${input.coverage.daysLogged} of ${input.coverage.daysElapsed} days`,
    );
  }

  return {
    header,
    line: parts.length > 0 ? parts.join(' · ') : null,
    progressFraction: progress.fraction,
  };
}
