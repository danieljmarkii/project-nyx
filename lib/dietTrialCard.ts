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
// here as an INPUT: `exposures`, `belowCoverageFloor`, `trialDietRefusal`,
// `intakeRating`, `exposures.mayStateRecordClean`. When the classifier has
// not run, `exposures` is null and the adherence sentence simply does not
// render — silence, never an all-clear (the same asymmetry as B-351 D10).
//
// ── B-533 PR A: THE WIRING AND THE CLAIM GATE ────────────────────────────────
// PR 5 computed five disclosure channels and one reached a surface. This half
// connects the ones that make the EXISTING states honest: `exposures` and
// `belowCoverageFloor` (previously hard-nulled, so states 3/4 were unreachable),
// `exposures.mayStateRecordClean` (the composite gate the vet report has always
// asked and the card never did), `allowedSetUnavailable`, and the §10 S3
// untracked head.
//
// ── B-533 PR B (THIS ONE): THE TWO OWNER-FACING REGISTERS ────────────────────
//
// PR A deliberately shipped without them: five adversarial rounds put essentially
// every one of their 39 findings in these two surfaces while the wiring held from
// round 1. They arrive here re-expressed on the composition layer B-559 built in
// between — which is the whole reason this is a re-cut rather than a rebase. The
// live refusal state is now a REGISTER with a row in the table below, so the four
// disclosure questions it used to answer inline (does it owe the floor? the
// can't-match caveat? the past bowl? the household scope?) are answered where
// every other register answers them, and `everyState` walks it.
//
//   R1  `trial_refusal` — the trial diet itself is going unfinished. This is the
//       patient `detectIntakeDecline` structurally cannot see: that detector needs
//       a baseline to decline FROM, so a diet refused from day 1 is uniformly low
//       rather than declining, and the chronic case decays INTO the clean case.
//       `trialDietRefusal` was built for it in PR 5 and nothing consumed it — the
//       pre-ship review's worst client-side finding.
//
//   R1b `pushTeachLine` — the refusal lane fires on RATED feedings only, so an
//       owner who never learns the intake tap has a trial whose viability the app
//       is blind to. The card teaches the tap before anything is wrong.
//
// STILL BLOCKING, and named here because a reader of this file is who needs to
// know: **Dr. Chen has not ratified the stand-down semantics** (when may a fired
// safety register be stood down? — `liveRefusal` below) **or the feline "needs a
// call today" register**. Both are marked at their site.
//
// The rule every register shares, and the one this file enforces in a single
// place —
// `TRIAL_CARD_DISCLOSURES`, applied by `recordRegion` and asserted by a property
// test over every state (B-559; it was `pushExposureFloor` for the floor half
// alone, and that helper now only writes its sentence):
//
//   WITHHOLD THE READING when the record cannot support it.
//   NEVER WITHHOLD THE FLOOR — the off-diet count is owed in every state.
//
import { getDietTrialProgress } from './analytics';
import {
  // The fire predicate's own floors, reused BY THE STAND-DOWN so the two
  // directions cannot drift apart — see `liveRefusal`.
  REFUSAL_MIN_RATED,
  REFUSAL_SHARE,
  trialViabilityHeadline,
  trialViabilityNote,
  type TrialDietRefusal,
  type TrialIntakeRating,
} from './dietTrial';
import { milestoneNote, trialDecisionChoices, type TrialOutcome } from './dietTrialCompletion';
import { type TrialProteinSource } from './trialProtein';
import { proteinTrialLabel } from './trialProteinPicker';
import { localDayIndexOf, MONTHS } from './utils';
import type { TrialIndication } from './dietTrialSetup';
import { TRIAL_RESPONSE_COUNTS_DEFAULTS, type TrialResponseCounts } from './trialResponseCounts';

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
  /** B-704 — the resolved trial protein for the "{Protein} trial" identity naming
   *  (TP-4 viewers). ALREADY RESOLVED by `loadDietTrialFacts` through the one
   *  predicate (`trialTargetProtein`, stored-first with derivation fallback), so
   *  this pure resolver never re-derives it — it has no allowed foods to derive
   *  from, and a second definition of "the trial's protein" is exactly the §5.3
   *  failure the predicate exists to prevent. `{ protein: null }` (or omitted) is
   *  the honest no-naming state and falls the identity back to "Diet trial" — never
   *  an all-clear (TG-2). */
  trialProtein?: { protein: string | null; source: TrialProteinSource | null };
}

/**
 * The card/strip identity — "{Protein} trial" when a protein resolves (either
 * source, TP-4), else the unchanged "Diet trial" (B-704 §7.3, §8).
 *
 * It is the LEADING token of both the card kicker ("Rabbit trial · finished") and
 * the strip header ("Rabbit trial · day 12 of 42"); each caller appends its own
 * lifecycle/day suffix. The food label stays the naming BELOW it, so the
 * no-protein fallback is the card exactly as it renders today.
 *
 * NEVER A CLAIM. A null protein yields the generic "Diet trial" — it never says
 * "no protein set" and never reads as an all-clear (TG-2); the absence of a name
 * is not a verdict.
 */
export function trialIdentityLabel(trial: TrialCardTrial | null | undefined): string {
  return proteinTrialLabel(trial?.trialProtein?.protein ?? null);
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
  /**
   * `lib/dietTrial.mayStateRecordClean(facts, opts)` — may this card say the
   * affirmative "all N matched the trial diet or a permitted food"?
   *
   * REQUIRED, NOT OPTIONAL, and that is the point of the field. The pre-ship
   * review found the shipped defect at exactly this boundary: `computeTrialFacts`
   * withholds the claim for several separate computed reasons (a refused diet, a
   * free-choice bowl, an oral-route exposure, an unclassifiable feeding, an
   * off-list arrangement, an unreadable permit set) and the card knew about none
   * of them, so it rendered the unqualified sentence anyway — including the
   * free-fed variant a green test was locking in place (round 5 ①). A
   * defaulted-true flag would have re-created that hole for the next caller that
   * forgot it; making it required means the compiler asks at every construction
   * site.
   *
   * IT IS THE COMPOSITE GATE, NOT `mayClaimAllMatched`. The adversarial pass
   * proved the weaker one insufficient on three executed fixtures: day 3 of 56
   * ("all 3 matched" under `not_yet`), the sub-floor card (which contradicted its
   * own lead sentence one line down), and a completed trial with 84 of 112
   * prescribed feedings logged unfinished ("all 112 matched" — the recency window
   * hid it). `mayStateRecordClean` folds in the range refusal, the
   * interpretability floor and the unreadable permit set, which is the same
   * question `generate-report` has been asking all along.
   *
   * It gates the CLAIM only, never the COUNT. §5.2 rules the exposure count a
   * floor and the floor direction is disclose-more — withholding the number is
   * how the last two attempts at this wiring deleted real findings.
   */
  mayStateRecordClean: boolean;
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
  /**
   * The WHOLE-RANGE refusal (`lib/dietTrial.TrialFacts.rangeRefusal`) — a
   * history, where `trialDietRefusal` is a now-fact.
   *
   * THE TERMINAL CARDS READ THIS ONE, mirroring `generate-report/render.ts`'s
   * `rangeRefusal ?? trialDietRefusal`. Without it a completed trial whose diet
   * went unfinished for six weeks and was eaten for the last two rendered
   * "Meals logged on 56 of 56 days" over "112 feedings in total" — a maximally
   * clean-LOOKING terminal card. The affirmative claim was correctly withheld
   * (the gate has read the range fact since B-533 round 1), but withholding a
   * claim is not the same as disclosing the finding, and the report was
   * rendering the refusal on the same record. Same record, two surfaces, two
   * answers, which is the whole thing the shared module exists to stop.
   *
   * The LIVE card deliberately does not use it: that register is present-tense
   * ("needs a call today"), and a six-week-old refusal is not news today.
   */
  rangeRefusal?: TrialDietRefusal | null;
  /**
   * `lib/dietTrial.TrialFacts.trialDietRefusal` — the RECENCY-bounded refusal, and
   * the primary trigger for the R1 register (§6.5's second, non-clinical path).
   *
   * A now-fact by construction: bounded to the last `REFUSAL_WINDOW_DAYS`, because
   * what it drives is a present-tense sentence about the pet today.
   */
  trialDietRefusal?: TrialDietRefusal | null;
  /** `TrialFacts.recentFinishedFeedings` — the NUMERATOR of the stand-down. Never
   *  read alone; its denominator is `recentRatedFeedings`. See `liveRefusal`. */
  recentFinishedFeedings?: number;
  /** `TrialFacts.recentRatedFeedings` — the denominator. The pair is what makes
   *  the stand-down symmetric with the fire instead of a bare `=== 0` test. */
  recentRatedFeedings?: number;
  /** `TrialFacts.rangeRefusalSpansEpisodes` — the range fact carries no episode
   *  guard, so a live present-tense register may not speak from a single bout. */
  rangeRefusalSpansEpisodes?: boolean;
  /** R1b — `TrialFacts.intakeRating`. Null when there is nothing in range to have
   *  rated, which is not the same fact as "nothing is rated". */
  intakeRating?: TrialIntakeRating | null;
  /** §5.6 — a free-choice bowl OVERLAPPED the window but is not in force now.
   *  A bowl emits no meal events by construction, so the days it was down can
   *  never have a meal-by-meal record. Without this the owner who RECORDED the
   *  removal lands on the sub-floor card's deficiency lead with nothing naming
   *  the cause — and B-474's un-nulling is what made that state reachable. */
  freeFedOverlap?: boolean;
  /**
   * `lib/dietTrial.TrialFacts.allowedSetUnavailable` — the trial has nothing
   * usable to define the diet with, so "off-diet" stops being a measurement.
   *
   * IT IS ITS OWN INPUT AND NOT A CASE OF `mayStateRecordClean`: that gate lives
   * on the `offDiet <= 0` branch, which an unusable permit set can never reach
   * (every feeding falls to rung 3, so `offDiet` equals the total). Wiring it
   * only into the gate left it unreachable in the one state it was added for, and
   * the card went on telling a fully compliant owner "0 matched, 40 did not".
   */
  allowedSetUnavailable?: boolean;
  /**
   * `lib/dietTrial.TrialFacts.antigenArmDark` (B-597) — the protein arm is off for
   * part of the window (a `primary_diet` food with no readable source, a membership
   * gap with nothing in force, or a suppressed contamination), so the trial's
   * antigens could not be checked for that stretch.
   *
   * ITS STRUCTURALLY IDENTICAL SIBLING IS `allowedSetUnavailable`, and it is here
   * for the same reason: the report reads `antigenArmDark` (renders "Antigen check
   * paused" + the §7.2 caveat) and the CLAIM gate already reads it
   * (`mayClaimAllMatched`), but the CARD LOADER dropped it — so the Home strip
   * stated a plain coverage ratio while the arm was off, and the card carried no
   * membership-gap disclosure the report had. THE BOOLEAN, not a food list: on a
   * membership gap the arm is dark with nothing to name, so gating on a `.length`
   * would keep the quiet ratio in exactly that state (`withholdingReasons`).
   */
  antigenArmDark?: boolean;
  /** §10 S3 — days between the trial's start and the first logged feeding. The
   *  coverage denominator excludes them (days the owner could not have logged are
   *  not a gap in their record), so the card has to SAY so rather than quietly
   *  render a flattering ratio; the report already does. */
  untrackedDaysBeforeFirstLog?: number;
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
  /**
   * Signals v2 (B-755 / CUL-13, §4.2) — the standing one-line VOMIT count for the Home strip,
   * computed from LOCAL data (`lib/trialResponseCounts`), always present while a trial runs. Present
   * ONLY when `signals_v2` is on (the loader skips the read when off — so `resolveTrialStrip` renders
   * no extra line and the strip is byte-identical). It is a DESCRIPTION of the record, not a control
   * (§4.2's second-door rule is intact — nothing here opens a form); the un-gated raw-count sibling of
   * the event-driven Signal trial card. Null when off / not computed → no line.
   */
  trialResponse?: TrialResponseCounts | null;
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
  | 'free_fed'        // 9  — replacement
  | 'trial_refusal';  // 10 — replacement (R1, mock round 5)

/** Line roles, so a test can assert a literal string AT its role rather than by
 *  index, and so the view never has to infer emphasis from position.
 *   lead      — the sentence that owns the card in a replacement state
 *   fact      — a record statement with its own denominator (§5.1)
 *   qualifier — the inline blind-spot line; §5.2 forbids making it a legend
 *   caveat    — §5.6's multi-pet scope gate on the claim above it
 *   note      — record-and-continue / outcome / overrun prose (§6.7)
 *   forward   — the "keep going" line; the card's actual job (§4.2)
 *   flag      — a SAFETY register: the two states where something about the
 *               animal outranks the trial (intake decline, trial-diet refusal).
 *               Drawn as the tinted block the design lock draws, rather than as
 *               body text: both states are structural REPLACEMENTS of the record
 *               lines, and a replacement that renders in the same weight as what
 *               it replaced is invisible as a replacement. Round 5 drew the
 *               refusal state tinted and the shipped decline state was rendering
 *               as plain text, so the two sibling safety registers looked nothing
 *               alike and the more urgent one looked quieter.
 *   teach     — R1b's intake-rating line. Quiet, never a safety register: it
 *               fires when nothing is wrong, and nothing in it may imply
 *               otherwise. */
export type TrialCardLineRole =
  | 'lead' | 'fact' | 'qualifier' | 'caveat' | 'note' | 'forward' | 'flag' | 'teach';

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
  | 'view_exposures'       // PR 5's list screen
  // B-616 PR 2 — "What {pet} can eat" (/trial-foods), the allowed set as a
  // re-readable rule list. The card is the only surface that always knows a trial
  // is running, so it is the entry point that cannot go missing; the Foods tab's
  // strip (PR 3) and food detail add two more.
  //
  // IT IS THE SET'S ONLY DOOR ON THIS SCREEN, not a second one: the card's §4.2
  // rule forbids a shortcut into the FAB's LOGGING flow, and nothing here logs.
  // The list is also the only non-punitive place a permitted food can be added —
  // every other trial surface reports what was fed.
  //
  // The handler is passed only when the allowed set is actually hydrated (R2), so
  // this action self-suppresses on a read that could not answer rather than
  // opening a screen with nothing on it.
  | 'view_allowed_foods'
  // R1 — the refusal state's way out, opening the same sheet the header's
  // "Change" opens. It is a deliberate SECOND door to that room and the only one
  // on the card: §4.2's no-second-door rule is about logging (the FAB), and on the
  // one state whose whole message is "this diet may need to change" the way out
  // may not be a 13px link in the corner.
  | 'trial_manage';

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
  // NOTHING TO WITHHOLD ABOUT AN EMPTY RECORD. With no feedings logged, the
  // withholding variant below rendered "0 feedings in total. Culprit isn't saying
  // how many matched the trial diet on this record." — the app declining to
  // answer a question nobody asked, which reads as hiding something about a
  // record that is simply empty. The count alone is the honest line here: it
  // makes no claim in either direction, which is the same reason the
  // pre-classifier path renders it bare.
  if (total <= 0) return 'Nothing logged against the trial yet.';
  if (ex.offDiet <= 0) {
    // THE COUNT STAYS, THE CLAIM GOES (round 5 ①) — AND THE WITHHOLDING IS NAMED.
    //
    // "N feedings in total." alone was the reassurance-on-absence B-494 ruled on,
    // one surface over. An owner reads "56 of 56 days, 112 feedings" as "we're
    // nailing it": the state that exists BECAUSE the app is uncertain rendered as
    // the most reassuring card in the set — cleaner than state 3, which at least
    // says "4 did not". She has never seen the affirmative variant, so she cannot
    // notice its absence. And the same string means "too early to say" in week 1
    // and "something I won't name" on day 40, so six weeks teach her the reading
    // that is wrong on the day it matters.
    //
    // The register already exists in this file — `refusal_withheld` says out
    // loud what it is not showing, and the free-fed lead explains itself. One
    // withholding reason had a voice and five had silence.
    return ex.mayStateRecordClean
      ? `${total} ${noun} in total — all ${total} matched the trial diet or a permitted food.`
      // NO "see below for why": the reason may be an oral-route exposure or an
      // unclassifiable feeding, neither of which renders a line — a pointer to an
      // explanation that is not there is the same defect one level down.
      : `${total} ${noun} in total. Culprit isn’t saying how many matched the trial ` +
        'diet on this record.';
  }
  return `${total} ${noun} in total — ${total - ex.offDiet} matched, ${ex.offDiet} did not.`;
}

/** Below this many wholly-unmatched feedings, "nothing matched" is not yet a
 *  pattern — a trial can genuinely open with a couple of off-list meals. It only
 *  decides whether a CAVEAT renders, never whether a count does. */
export const UNMATCHED_CAVEAT_MIN_FEEDINGS = 3;

/**
 * R1b — the intake-rating teach line's two floors, and both are guards rather
 * than tuning.
 *
 * `SHARE` is a HALF: below it, most of the meal record is silent on whether the
 * food was eaten, which is the state worth teaching about. Above it the owner is
 * already rating and the line would be noise on a card that has to survive eight
 * weeks of daily reading (Principle 4's spirit — the card is not a lecture).
 *
 * `MIN_FEEDINGS` is what stops the line firing on the first unrated breakfast: a
 * 0-of-1 record is not a habit, and teaching off it hands a correction to an owner
 * on day 1 of 56 for the crime of having logged one meal. Four is the smallest
 * sample where "most" is a fair word.
 *
 * Deliberately NOT clinical values — nothing keys on them but whether a warm
 * sentence renders, so they need no Dr. Chen ratification the way the coverage
 * floor and the refusal floors do.
 */
export const INTAKE_RATING_TEACH_SHARE = 0.5;
export const INTAKE_RATING_TEACH_MIN_FEEDINGS = 4;

/**
 * §5.2: "the exposure count is a floor, never a total." Said ON the claim.
 */
function floorSuffix(offDiet: number): string {
  return offDiet === 1
    ? ' That 1 is what’s been logged, not a total.'
    : ` The ${offDiet} are what’s been logged, not a total.`;
}

// ── THE COMPOSITION LAYER (B-559) ────────────────────────────────────────────
//
// §4.2 specified "one card, one layout — the eleven states are WHICH STRINGS
// occupy the fact and note lines, a switch not eleven components." The STATES
// were already a switch. The DISCLOSURES were not: nine push helpers composed
// independently of the state machine, and every branch was trusted to remember
// each rule that applied to it.
//
// Nine adversarial rounds produced the same defect shape every time — "the
// branch I didn't visit inherited the opposite rule." Round 9's is the sharpest:
// `rangeRefusal` reached three of eleven active states, because `pushRecordFacts`
// was its only consumer while `day_one`, `below_floor`, `free_fed` and
// `milestone` carry bodies of their own. That is a REGISTER-PLACEMENT failure,
// not a disclosure one — so this layer answers both halves before a single
// string is chosen:
//
//   (a) WHICH REGISTER owns the record region    → `registerFor`
//   (b) WHICH DISCLOSURES it may make            → `TRIAL_CARD_DISCLOSURES`
//
// and then composes. No branch pushes a disclosure of its own; the table is the
// whole answer. A new state cannot inherit a rule by accident — it has to name
// its register, the register has to have a row, and `everyState` has to walk it.
//
// `pushExposureFloor` plus its cross-state property test (#498) was the first
// half of this — one rule, one place, asserted over every state. This is the
// other half, the withhold-the-reading side, plus the placement question the
// floor rule never had to ask.

/**
 * THE SIX WITHHOLDING REASONS — the inputs that argue against reading this
 * record plainly, enumerated in ONE list.
 *
 * Both surfaces in this file consume the same set, and every round-8/9 defect
 * was one surface gaining a reason the other had not: the strip kept stating a
 * ratio the card had learned to qualify, then dropped one the card still states.
 *
 * The CARD routes four of them into `registerFor` (they change who speaks) and
 * treats the other two as disclosures (they qualify what is said). The STRIP has
 * one line and nowhere to put a qualifier, so it states its ratio only when this
 * list is EMPTY — which is the whole of its "deliberately stricter than the
 * card" rule, and is now that sentence rather than a hand-maintained conjunction.
 *
 * WHAT THAT DOES AND DOES NOT BUY, stated precisely, because the first draft of
 * this comment claimed the second half and `adversarial-reviewer` disproved it:
 *
 *   IT BUYS one list with two consumers. A reason cannot mean one thing to the
 *   card and another to the strip, which is real and is what rounds 8/9 kept
 *   getting wrong.
 *
 *   IT DOES NOT BUY protection against the list being WRONG. Deleting a push
 *   from this function silently widens what Home will state, and no property
 *   test written against `withholdingReasons` can notice — an oracle sharing an
 *   implementation with its subject is a change-detector. What actually defends
 *   the list is `names every withholding reason the record carries`, plus #498's
 *   hand-written per-reason strip tests. Keep both.
 */
export type TrialCardWithholding =
  | 'intake_decline'
  | 'trial_diet_refusal'
  | 'range_refusal'
  | 'free_fed'
  | 'allowed_set_unavailable'
  | 'antigen_arm_dark'
  | 'untracked_head'
  | 'below_floor';

export function withholdingReasons(input: TrialCardInput): TrialCardWithholding[] {
  const reasons: TrialCardWithholding[] = [];
  if (input.intakeDeclineHeadline) reasons.push('intake_decline');
  // R1's now-fact. Listed SEPARATELY from `range_refusal` and keyed on the raw
  // input rather than on `liveRefusal`, deliberately: keying it on the composed
  // predicate would let the stand-down conditions — whose semantics are the open
  // Dr. Chen question — widen what Home states. A reason may be added to this
  // list, never subtracted by a downstream guard.
  if (input.trialDietRefusal) reasons.push('trial_diet_refusal');
  if (input.rangeRefusal) reasons.push('range_refusal');
  if (input.freeFed) reasons.push('free_fed');
  if (input.allowedSetUnavailable) reasons.push('allowed_set_unavailable');
  // B-597 — the dark antigen arm, the forgotten sibling of `allowed_set_unavailable`
  // above. The report withholds the clean claim AND discloses on this (§7.2 caveat +
  // "Antigen check paused" row); the strip has one line, so a dark arm is a reason it
  // cannot state its ratio plainly — a caveat it has nowhere to put.
  if (input.antigenArmDark) reasons.push('antigen_arm_dark');
  // `!== 0`, NOT `> 0`. The strip's predicate has always been "the head is
  // exactly zero" and its complement is not `> 0` — a negative or `NaN` head is
  // NOT a plain record, and rewriting the comparison the obvious way narrowed
  // the withholding in the REASSURING direction: Home stated a coverage ratio
  // the pre-refactor strip suppressed. Unreachable through the shipped loader
  // (`lib/dietTrial.ts` derives the head from a first-log day filtered
  // `>= scopedStart`, and `lib/dietTrialFacts.ts` defaults it to 0), which is
  // exactly why no test defended it and why a contract-respecting fixture
  // generator could not see it. Found by `adversarial-reviewer` feeding
  // out-of-contract values to a field only ever generated in contract.
  if ((input.untrackedDaysBeforeFirstLog ?? 0) !== 0) reasons.push('untracked_head');
  if (input.belowCoverageFloor) reasons.push('below_floor');
  return reasons;
}

/**
 * The NOT-EATING subset of `withholdingReasons` — the reasons that make a
 * REASSURING record summary (a falling vomit count) dishonest BESIDE them, as
 * opposed to the reasons that only make a COVERAGE ratio unstatable. The line is
 * "does this reason mean the animal isn't eating?": an intake decline or a diet
 * refusal does; a broken off-diet comparator (`allowed_set_unavailable`), a
 * free-fed bowl (`free_fed`), a dark antigen arm, an untracked head, or a thin
 * record (`below_floor`) does NOT — a vomit count stays honest next to any of
 * those, and dropping it there would lose a real safety-relevant count on the
 * wedge surface (Sam's grazing cat).
 */
const NOT_EATING_WITHHOLDING: readonly TrialCardWithholding[] = [
  'intake_decline',
  'trial_diet_refusal',
  'range_refusal',
];

/**
 * Does the record carry a NOT-EATING safety concern — a live intake decline or a
 * diet refusal — that forbids a reassuring vomit-count summary beside it (§5.2)?
 *
 * ONE PREDICATE, TWO CONSUMERS. The Home trial strip's standing vomit line
 * (`resolveTrialStrip`) and the event-driven Signal trial card (B-789, dropped in
 * `SignalZone`'s LiveStack) both suppress on THIS, so the two surfaces can never
 * disagree about the same refusal — the card reassuring "0 vomiting · was 20"
 * while the strip withholds the identical line was the exact split B-789 closed.
 * It reads the SAME `withholdingReasons` list both surfaces already share (scoped
 * to the not-eating subset above), so a reason cannot be added to one surface and
 * forgotten on the other. `trial_diet_refusal` / `range_refusal` are keyed on the
 * raw refusal facts, not on `liveRefusal`'s stand-down (see `withholdingReasons`),
 * so the same day-1-refusal cat the relative-decline detector is blind to is
 * caught here.
 */
export function isAnimalNotEating(input: TrialCardInput): boolean {
  return withholdingReasons(input).some((r) => NOT_EATING_WITHHOLDING.includes(r));
}

/**
 * R1 — MAY THE LIVE REFUSAL REGISTER SPEAK, AND FROM WHICH FACT?
 *
 * The now-fact speaks for itself. `trialDietRefusal` is recency-bounded and
 * carries `REFUSAL_MIN_SPAN_MS`, so it is already both current and multi-episode.
 *
 * The range fact is the fallback, and it exists because SILENCE MUST NOT CANCEL AN
 * ALARM. An owner who documents 42 refusals and then stops tapping intake empties
 * the recency window, and the live register would vanish over a cat that is still
 * refusing — the "chronic case decays into the clean case" defect reached through
 * the rating door. R1a says absence of ratings must never ALARM; it does not
 * license absence of ratings CANCELLING an alarm that already fired on logged
 * evidence.
 *
 * ── THE STAND-DOWN IS SYMMETRIC WITH THE FIRE, AND THAT IS THE WHOLE RULE ────
 *
 * `adversarial-reviewer` broke the first cut of this function on its SHAPE, not
 * on its inputs. Firing carries four guards; standing down carried none — a bare
 * "is there one finished bowl?". On a lane whose stated safe error direction is
 * toward firing, the OFF predicate was the loosest test in the module, and three
 * executed findings fell out of that single asymmetry:
 *
 *   1. A cat with 60 of 60 bowls refused across 30 days, then ONE `most`-rated
 *      bowl on day 44, rendered a clean card — "Meals logged on 44 of 44 days…
 *      2 weeks to go."
 *   2. Logging a refusal AND a good meal disclosed LESS than logging nothing at
 *      all (F=0,R=0 fired; F=1,R=1 did not).
 *   3. The register flickered across a record with NO new data in it — present
 *      days 30–43, silent 44–48, present again 49–56: absent nearest the last
 *      refusal and present a week later on strictly older evidence.
 *
 * So the stand-down now asks the SAME question the fire asks, in the opposite
 * direction, against the SAME ratified constants: at least `REFUSAL_MIN_RATED`
 * recent ratings, and a finished share clearing `1 - REFUSAL_SHARE`. Reusing the
 * fire’s own floors is deliberate, and is what makes this repair available with
 * no new clinical ruling — the finding was that the SHAPE was indefensible, and a
 * mirror of an already-ratified floor invents nothing.
 *
 * Read both halves together and the rule is one sentence: **it takes the same
 * weight of evidence to say this pet is eating as it took to say it was not.**
 *
 * ── THE EPISODE GUARD, UNCHANGED ───────────────────────────────────────────
 * The range fact drops `REFUSAL_MIN_SPAN_MS` (right for a HISTORY, wrong for a
 * present-tense register), so one midnight-straddling bout would otherwise fire
 * "needs a call today" for the next 36 days over a cat that ate throughout.
 *
 * ⚠️ STILL OPEN, STILL DR. CHEN’S — B-572. That span guard is only a >=12h test,
 * which any two-calendar-day cluster clears: three refusals in week one followed
 * by 41 unrated days still speaks in the present tense on 41-day-old evidence.
 * Making the range fact EXPIRE needs a recency threshold, and a threshold is a
 * clinical number rather than an engineering one — as is the now-fact’s own floor
 * firing on a day-2 some/all/some dog. Both are OVER-fire, the survivable
 * direction, which is why they are filed rather than guessed at here.
 */
function liveRefusal(input: TrialCardInput): TrialDietRefusal | null {
  if (input.trialDietRefusal) return input.trialDietRefusal;
  if (input.rangeRefusal && input.rangeRefusalSpansEpisodes === true && !isEatingNow(input)) {
    return input.rangeRefusal;
  }
  return null;
}

/**
 * Does the RECENT record carry evidence the diet is being eaten, to the same
 * standard `computeTrialFacts` demands before it will say the opposite?
 *
 * `false` ON AN EMPTY WINDOW BY CONSTRUCTION, and that is the load-bearing half:
 * no recent ratings means no new evidence, never evidence of recovery. A
 * defaulted-true reading here re-creates the defect this replaced.
 */
function isEatingNow(input: TrialCardInput): boolean {
  const rated = input.recentRatedFeedings ?? 0;
  const finished = input.recentFinishedFeedings ?? 0;
  if (rated < REFUSAL_MIN_RATED) return false;
  return finished / rated >= 1 - REFUSAL_SHARE;
}

/**
 * (a) — WHO OWNS THE RECORD REGION.
 *
 * A register is a VOICE, not a state: several states share one, and one state
 * (`completed` / `abandoned`) reaches three depending on what the record holds.
 * The state decides which strings occupy the fact and note lines; the register
 * decides what may be said about the record at all.
 */
export type TrialCardRegister =
  /** No record substrate — state 0, the unparseable-start-date card, and any
   *  card with neither coverage nor exposures to speak about. */
  | 'none'
  /** §5.2's safety replacement: the animal outranks the trial. State 8, and both
   *  terminal cards while the flag is live. */
  | 'decline'
  /** TERMINAL ONLY — a diet the record shows went uneaten. The counts stay; the
   *  READING is deleted. Reached from the stored reason or from `rangeRefusal`. */
  | 'refusal_withheld'
  /** LIVE ONLY (R1) — §6.5's second, non-clinical path: the trial diet itself is
   *  going unfinished RIGHT NOW. `refusal_withheld` is this register's history;
   *  the two are deliberately different voices over the same shape of fact,
   *  because a terminal card reports and a live one escalates. */
  | 'trial_refusal'
  /** §5.6 — a bowl in force NOW, so the coverage ratio has no denominator. */
  | 'free_fed'
  /** State 4's combined "of what's on the record so far" paragraph. */
  | 'so_far'
  /** States 1 and 5: no record reading BY DESIGN, and the off-diet floor still
   *  owed. The two declared deviations, and the only rows where the floor renders
   *  without its can't-match caveat. */
  | 'floor_only'
  /** Before the classifier ran (`exposures` null): coverage, and silence about
   *  what matched. Silence, never an all-clear — the B-351 D10 asymmetry. */
  | 'coverage_only'
  /** The ordinary two-fact statement (§5.1) — states 2 / 3 / 6 and the ordinary
   *  terminal card. */
  | 'record';

function registerFor(
  state: TrialCardState,
  input: TrialCardInput,
  trial: TrialCardTrial,
): TrialCardRegister {
  switch (state) {
    case 'no_trial':
      return 'none';
    case 'intake_decline':
      return 'decline';
    case 'trial_refusal':
      return 'trial_refusal';
    case 'free_fed':
      return 'free_fed';
    case 'below_floor':
      return 'so_far';
    case 'day_one':
    case 'milestone':
      return 'floor_only';
    case 'clean':
    case 'exposures':
    case 'overrun':
      return recordRegisterFor(input);
    case 'completed':
    case 'abandoned':
      // THE LIVE CARD DELIBERATELY DOES NOT READ `rangeRefusal`, AND THAT IS A
      // RULING RATHER THAN AN OMISSION — round 9 routed the active card through
      // this register and two independent reviews broke it on the same ground.
      //
      //   THE FLOORS WERE DERIVED FOR A CLAIM GATE, NOT FOR A VOICE.
      //   `rangeRefusal` is 3 rated / 2 not-finished days / 50% share with NO
      //   span guard, and `some` scores as not-finished — floors whose own
      //   justification in `lib/dietTrial.ts` reads "what firing does is
      //   withhold an affirmative claim, and silence is cheap." Verified against
      //   the real predicate: a dog rated some / all / some fires it on DAY 2 of
      //   56. Handing that predicate a paragraph gives a wedge owner a clinical
      //   assertion about a dog that ate, and the likely response is that she
      //   stops rating intake honestly — the one signal the trial needs from her.
      //
      //   AND THE SENTENCE HAS NO ANTECEDENT ON A LIVE CARD. It closes "…is the
      //   refusal", which lands under the owner's own "wouldn't eat it" here and
      //   under nothing there, because the register that states the finding is
      //   #499's.
      //
      // A terminal card is a HISTORY, which is why the same fact carries a voice
      // here and not there, and it mirrors `generate-report/render.ts`'s own
      // `rangeRefusal ?? trialDietRefusal` precedence. Note that hoisting the
      // check above the state switch is the fix this layer makes trivial and
      // must still not take: it would give the day-2 misfire four more states.
      // The live-card residual is B-566, against #499's register.
      //
      // AND IT DOES NOT READ THE NOW-FACT EITHER, which R1 makes worth naming
      // because R1 is what put `trialDietRefusal` on this input in the first
      // place. The two facts are not nested: a trial eaten for six weeks and
      // refused for the last two clears the RANGE share and fires the recency
      // one, so a terminal card can carry a now-fact with no range fact — and it
      // routes to `record`. What is guaranteed there is that the AFFIRMATIVE
      // CLAIM is withheld (`mayClaimAllMatched` reads the now-fact, so the
      // adapter's `mayStateRecordClean` is already false). What is NOT guaranteed
      // is that the finding is DISCLOSED, and this file's own `rangeRefusal`
      // docstring says why that distinction matters. Routing it here would change
      // what an owner reads on a finished trial, and it is the same "when may a
      // register speak" question Dr. Chen owes a ruling on — so it is filed as
      // B-570 rather than taken inside a wiring PR.
      if (input.intakeDeclineHeadline) return 'decline';
      if (state === 'abandoned' && wasRefused(trial)) return 'refusal_withheld';
      if (input.rangeRefusal) return 'refusal_withheld';
      return recordRegisterFor(input);
    default:
      // A NEW STATE MUST NAME ITS REGISTER, AND THE COMPILER IS WHAT ASKS.
      // Without this the switch falls out, `registerFor` returns `undefined`,
      // and `TRIAL_CARD_DISCLOSURES[undefined]` takes the card down at
      // `policy.floor` — a runtime crash where the whole point of this layer is
      // to make it a build-time question. `noImplicitReturns` is NOT set in
      // `tsconfig.json` and `strict` does not imply it, so the fallthrough is
      // silent without the `never` binding below: verified by adding a twelfth
      // state and watching `tsc --noEmit` stay green until this existed.
      return assertNever(state);
  }
}

/** The compile-time half of the exhaustiveness guarantee. `everyState walks every
 *  register` is the test-time half — this one asks whether a new state named a
 *  register, that one asks whether anybody walks it. Neither implies the other. */
function assertNever(value: never): never {
  throw new Error(`Unhandled diet-trial card case: ${String(value)}`);
}

/** The record register degrades with the SUBSTRATE and never with a claim: no
 *  classifier → coverage alone; nothing on the record → no region at all. */
function recordRegisterFor(input: TrialCardInput): TrialCardRegister {
  if (input.exposures) return 'record';
  return input.coverage ? 'coverage_only' : 'none';
}

/** (b) — WHAT A REGISTER MAY DISCLOSE. */
export interface TrialCardDisclosurePolicy {
  /**
   * The separate off-diet sentence, and its lead-in.
   *
   * `null` where the register states the count INLINE (the two-fact form and the
   * so-far paragraph) or has no record substrate. §5.2 rules the count a FLOOR
   * and a floor only moves in the disclose-more direction, so every register
   * that WITHHOLDS a reading carries one: rounds 1–4 found the same defect in
   * four branches, each of which had withheld the count along with the reading.
   */
  floor: 'separately' | 'plain' | null;
  /** The can't-match caveat — and, by the same predicate, whether the floor
   *  suffix ("not a total") is suppressed. `false` only on `floor_only`, whose
   *  two states took the count as a declared deviation and must not inherit a
   *  directive with it. */
  unmatched: boolean;
  /** §5.6's past-bowl qualifier. `false` on `refusal_withheld` even though its
   *  sentence states coverage — a shipped hole, filed as B-560 and left visible
   *  in this cell rather than fixed under a refactor. */
  pastBowl: boolean;
  /** §10 S3's untracked head. */
  untrackedHead: boolean;
  /** §5.6's multi-pet scope gate. `active_only` preserves a shipped asymmetry
   *  rather than hiding it: the live decline card gates its floor line with the
   *  household caveat and the two TERMINAL decline branches never have. Written
   *  as a value in the table so it reads as a decision someone can overturn,
   *  which is the only thing that was wrong with it. */
  scope: 'always' | 'active_only' | 'never';
}

/**
 * THE TABLE. One row per register, and the row is the whole answer — this is the
 * artefact B-559 exists to produce. Reading a column top to bottom is the review
 * that nine rounds had to do by walking branches.
 *
 * ── HOW TO READ A CELL ──────────────────────────────────────────────────────
 * Every value here reproduces what the pre-refactor branches did, verified cell
 * by cell against `7a9108d` by a 307,200-case exhaustive differential. But a
 * value that was DECIDED and a value that fell out of where a helper call
 * happened to sit are not the same thing, and a table where they look alike does
 * not deliver "reading a column IS the review" (`adversarial-reviewer`'s
 * strongest objection to the first cut). So each non-obvious cell is marked:
 *
 *   RULED      — a decision someone made, with the reasoning at the cell.
 *   FILED      — a known hole with a backlog row; preserved because a refactor
 *                may not change behaviour, not because it is right.
 *   INHERITED  — fell out of control flow in `7a9108d` and has never been
 *                reviewed on its merits. Preserved for purity. Fair game.
 *
 * `true` also means ELIGIBLE, never GUARANTEED: each disclosure still gates on
 * its own predicate (`pushPastBowlCaveat` additionally needs `freeFedOverlap &&
 * !freeFed`, and so on). The table says who MAY speak, not who does.
 */
export const TRIAL_CARD_DISCLOSURES: Record<TrialCardRegister, TrialCardDisclosurePolicy> = {
  // Nothing to disclose about: no trial, or no coverage AND no exposures. Every
  // cell here is unfalsifiable rather than decided — each disclosure's predicate
  // needs a record this register is defined by not having.
  none: {
    floor: null, unmatched: false, pastBowl: false, untrackedHead: false, scope: 'never',
  },
  decline: {
    // scope — INHERITED. The live decline card gates its floor line with the
    // household caveat and the two TERMINAL decline branches never have, because
    // `pushScopeCaveat` sat in `activeCard`'s branch and not in the other two.
    // Never argued either way; preserved so this stays a refactor.
    floor: 'separately', unmatched: true, pastBowl: false, untrackedHead: false,
    scope: 'active_only',
  },
  trial_refusal: {
    // floor — RULED. `separately`, exactly as `decline`: a flag block precedes
    // it, so the count needs its own lead-in or it reads as part of the safety
    // sentence. And it renders AT ALL because §5.2's floor only moves in the
    // disclose-more direction — the first cut of this register emitted the two
    // flag lines and nothing else, which silently deleted twelve real off-diet
    // exposures from an owner who had entered the refusal state.
    //
    // unmatched — RULED. The can't-match caveat is about the COMPARATOR, not
    // about the register: an unusable food list is equally unusable on a card
    // about a cat that isn't eating. Withholding it here would put the floor's
    // "not a total" suffix on a wholly-unmatched count with nothing saying the
    // comparator may be missing — at-least-N and maybe-fewer, the adjacent
    // contradiction rounds 4 and 9 both found.
    //
    // pastBowl, untrackedHead — RULED, and for the same reason `free_fed` has
    // them false: both qualify a COVERAGE RATIO, and this register renders none.
    // §10 S3's rule is "wherever coverage renders", and the head has no ratio to
    // be excluded from here. (Note this is where `refusal_withheld` differs and
    // is FILED as a hole rather than ruled: that register DOES state coverage, in
    // prose — B-560.)
    //
    // scope — RULED `always`, not `active_only`. The two are behaviourally
    // identical for this register, which is reachable only from a live card; the
    // distinction `active_only` draws would imply a terminal branch exists.
    // `always` says what is true: wherever this register speaks, an off-diet
    // count in a multi-pet household is a claim, and §5.6 gates it.
    floor: 'separately', unmatched: true, pastBowl: false, untrackedHead: false,
    scope: 'always',
  },
  refusal_withheld: {
    // pastBowl — FILED (B-560). untrackedHead, scope — INHERITED, and they are
    // B-560 one and two columns over: this register's body states coverage in
    // prose ("the record is meals offered on 18 of 19 days"), and §10 S3's rule
    // is "wherever coverage renders". `so_far` states coverage in prose too and
    // gets `untrackedHead: true`. Three cells, one hole; B-560's row names only
    // the first. Fixing any of them changes what an owner reads, so none belongs
    // in a refactor.
    floor: 'plain', unmatched: true, pastBowl: false, untrackedHead: false, scope: 'never',
  },
  free_fed: {
    // pastBowl, untrackedHead — RULED. A bowl in force NOW is this card's lead,
    // so the past-bowl qualifier has nothing to add (its own predicate excludes
    // it for the same reason); and the untracked head qualifies a coverage ratio
    // this register replaces outright.
    floor: null, unmatched: true, pastBowl: false, untrackedHead: false, scope: 'always',
  },
  so_far: {
    floor: null, unmatched: true, pastBowl: true, untrackedHead: true, scope: 'always',
  },
  floor_only: {
    // unmatched — RULED. Day 1 and the milestone take the count as a declared
    // deviation and must not inherit the can't-match caveat with it: it is a
    // directive, not a floor, and it lands before an owner has finished
    // populating the permitted list.
    floor: 'plain', unmatched: false, pastBowl: false, untrackedHead: false, scope: 'never',
  },
  coverage_only: {
    // scope — INHERITED, and this is the cell that most needed the marker: in
    // `7a9108d` it was not a decision at all, it fell out of `pushScopeCaveat`
    // sitting inside `pushRecordFacts`'s `if (ex)` block. `record` gates the
    // identical coverage claim. untrackedHead — inherited too, but the other
    // way: the old code DID render it here, from the second `if (coverage)`.
    //
    // NOTE this register is currently unreachable from the shipped loader —
    // `lib/dietTrialFacts.ts` nulls `coverage` and `exposures` together, so
    // `exposures === null` implies `coverage === null` implies `none`. It is the
    // pre-classifier contract, kept because the resolver is a pure function with
    // its own contract and `exposures` is optional on the input type. Read
    // "everyState walks every register" with that in mind: this row is walked by
    // fixture, not by the app.
    floor: null, unmatched: false, pastBowl: false, untrackedHead: true, scope: 'never',
  },
  record: {
    floor: null, unmatched: true, pastBowl: true, untrackedHead: true, scope: 'always',
  },
};

export interface TrialCardPlan {
  state: TrialCardState;
  register: TrialCardRegister;
  disclosures: TrialCardDisclosurePolicy;
  withheld: TrialCardWithholding[];
}

/** The composition layer's answer without rendering a string — so a test can
 *  assert the two halves directly, and so `everyState` can be CHECKED for
 *  register coverage rather than trusted to be exhaustive. */
export function planTrialCard(input: TrialCardInput): TrialCardPlan {
  const ctx = trialContext(input);
  const state = ctx ? stateFor(input, ctx) : degenerateStateFor(input.trial);
  const register = ctx ? registerFor(state, input, ctx.trial) : 'none';
  return {
    state,
    register,
    disclosures: TRIAL_CARD_DISCLOSURES[register],
    withheld: withholdingReasons(input),
  };
}

// ── The resolver ─────────────────────────────────────────────────────────────

interface TrialContext {
  trial: TrialCardTrial;
  startIndex: number;
  progress: NonNullable<ReturnType<typeof getDietTrialProgress>>;
  overrunDays: number;
}

function trialContext(input: TrialCardInput): TrialContext | null {
  const { trial } = input;
  if (!trial) return null;
  const startIndex = localDayIndexOf(trial.startedAt);
  const progress = getDietTrialProgress(
    { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
    input.nowMs,
  );
  if (!progress || startIndex === null) return null;
  return {
    trial,
    startIndex,
    progress,
    overrunDays: progress.dayCounter - progress.targetDays,
  };
}

/** The §4.2 switch, extracted so the plan and the rendered card cannot drift.
 *  ORDER IS LOAD-BEARING: the decline replacement outranks everything (the
 *  animal outranks the trial), and the milestone outranks the record states so
 *  day == target is never `clean`. */
function stateFor(input: TrialCardInput, ctx: TrialContext): TrialCardState {
  const { trial, progress, overrunDays } = ctx;
  if (trial.status === 'completed') return 'completed';
  if (trial.status === 'abandoned') return 'abandoned';
  if (input.intakeDeclineHeadline) return 'intake_decline';
  // Immediately after the clinical lane it defers to, and ABOVE the milestone —
  // for the same structural reason the decline sits where it does: while this is
  // live the resolver must be INCAPABLE of returning an adherence line, and a
  // trial that has reached day 56 while the diet goes uneaten is not a
  // celebration. The milestone's decision stays reachable as an action below.
  if (liveRefusal(input)) return 'trial_refusal';
  if (progress.targetDays > 0 && overrunDays === 0) return 'milestone';
  if (overrunDays > 0) return 'overrun';
  if (input.freeFed) return 'free_fed';
  if (input.belowCoverageFloor) return 'below_floor';
  if (progress.dayCounter === 1) return 'day_one';
  if ((input.exposures?.offDiet ?? 0) > 0) return 'exposures';
  return 'clean';
}

/** An unparseable start date has no honest day line, so the card renders its
 *  identity and nothing that would be a guess — the state still says which card
 *  it is. */
function degenerateStateFor(trial: TrialCardTrial | null): TrialCardState {
  if (!trial) return 'no_trial';
  return trial.status === 'abandoned' ? 'abandoned'
    : trial.status === 'completed' ? 'completed'
      : 'day_one';
}

/**
 * The header "manage" affordance's label — or null to hide it entirely.
 *
 * SUPPRESSION IS KEYED ON THE BODY'S ACTUAL ACTIONS, NOT ON `state`. The header
 * is a duplicate only when the body already carries a way to start a trial
 * (`no_trial`'s "Start a diet trial"; the ordinary `abandoned` card's "Start a new
 * trial"), so it is suppressed there and ONLY there. Two `abandoned` branches ship
 * `actions: []` with no body Start CTA — the intake-decline replacement (§5.2, a
 * pet that has stopped eating) and the degenerate unparseable-start branch — and
 * this card is the app's ONLY entry point to starting a trial (`profile.tsx`
 * §1097), so suppressing on `state` alone would strand those cards with zero
 * controls. (Regression: caught by `code-reviewer`, 2026-08-06.)
 *
 * When it IS shown, the verb says what `onManage` opens: on a RUNNING trial the
 * ordered end-and-replace sheet ("Replace" — never "Change", which read as an EDIT
 * and routed an active trial, and on `day_one` the card's ONLY control, straight to
 * its own destruction); on a terminal/degenerate card the start form ("+ Start").
 */
export function trialManageLabel(
  model: Pick<TrialCardModel, 'state' | 'actions'>,
): string | null {
  if (model.actions.some((a) => a.id === 'start_trial')) return null;
  return trialManageVerb(model.state);
}

function trialManageVerb(state: TrialCardState): string {
  switch (state) {
    case 'no_trial':
    case 'completed':
    case 'abandoned':
      return '+ Start';
    case 'day_one':
    case 'clean':
    case 'exposures':
    case 'below_floor':
    case 'milestone':
    case 'overrun':
    case 'intake_decline':
    case 'free_fed':
    case 'trial_refusal':
      return 'Replace';
    default: {
      // Exhaustive: a new TrialCardState fails to compile here rather than
      // silently inheriting "Replace".
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** The "What {pet} can eat" reference link. B-616 FR-5 shipped it on the mid-trial
 *  clean/exposures cards (states 2/3, via the shared body below); the polish pass
 *  adds it to `day_one` / `free_fed` / `below_floor`, where "what CAN he eat?" is
 *  just as live (day 1 most of all, when it is otherwise the card's only action).
 *  Deliberately NOT on the two decision cards — `milestone` (state 5, whose
 *  choose-the-next-step buttons own it) and `overrun` (state 6, whose one action is
 *  the milestone prompt) — where a food-list link would dilute the decision. Drawn
 *  only when the allowed set is hydrated (the handler in profile.tsx is
 *  conditional), so it degrades to nothing offline. */
function viewAllowedFoodsAction(petName: string): TrialCardAction {
  return { id: 'view_allowed_foods', label: `What ${petName} can eat`, emphasis: 'link' };
}

export function resolveTrialCard(input: TrialCardInput): TrialCardModel {
  const { trial, petName } = input;

  if (!trial) return noTrialCard(petName, input.petObjectPronoun ?? 'them');

  const ctx = trialContext(input);

  // No fact lines here, because every one of them is denominated in days
  // elapsed — the register is `none` and the region is empty by construction.
  if (!ctx) {
    return {
      state: degenerateStateFor(trial),
      kicker: trial.status === 'abandoned' ? `${trialIdentityLabel(trial)} · stopped early`
        : trial.status === 'completed' ? `${trialIdentityLabel(trial)} · finished`
          : trialIdentityLabel(trial),
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

  const state = stateFor(input, ctx);
  const register = registerFor(state, input, ctx.trial);

  if (state === 'completed') return completedCard(input, ctx, register);
  if (state === 'abandoned') return abandonedCard(input, ctx, register);

  return activeCard(input, ctx, state, register);
}

// ── Compose: the register's body, then the disclosures the table allows ──────

interface RegionContext {
  /** A terminal card is a HISTORY; the live card is a now-fact. Read by the
   *  `active_only` scope rule and by the refusal register's day phrase. */
  terminal: boolean;
  /** "19 days" — what the withheld sentence reads with. */
  dayCount: string;
  /** 7b's "usually means a different diet" note answers a reason the OWNER gave,
   *  so it renders only where they NAMED the refusal — never on the route that
   *  reaches this register from the record. */
  namedRefusal: boolean;
  daysRemaining: number;
}

function recordRegion(
  register: TrialCardRegister,
  input: TrialCardInput,
  rc: RegionContext,
): TrialCardLine[] {
  const policy = TRIAL_CARD_DISCLOSURES[register];
  // ONE PREDICATE, EVERY CONSUMER. This one answer decides three things: whether
  // the can't-match caveat renders, whether the floor SENTENCE carries its "not
  // a total" suffix, and whether the record QUALIFIER does. Keying any of them
  // on a proxy for the others is what put two opposite arrows on one card,
  // twice — "at least 5" welded to "maybe fewer" (rounds 4 and 9).
  const caveat = policy.unmatched && unmatchedCaveatApplies(input);

  const lines: TrialCardLine[] = [];
  pushRegisterBody(lines, register, input, rc, caveat);
  if (policy.floor) pushFloorSentence(lines, input, policy.floor, caveat);
  if (caveat) pushUnmatchedCaveat(lines, input);
  if (policy.pastBowl) pushPastBowlCaveat(lines, input);
  if (policy.untrackedHead) pushUntrackedHead(lines, input);
  if (policy.scope === 'always' || (policy.scope === 'active_only' && !rc.terminal)) {
    pushScopeCaveat(lines, input);
  }
  return lines;
}

function pushRegisterBody(
  lines: TrialCardLine[],
  register: TrialCardRegister,
  input: TrialCardInput,
  rc: RegionContext,
  caveat: boolean,
): void {
  switch (register) {
    case 'none':
    // `floor_only` declares no record READING by design: its region is the floor
    // and nothing else, which is why it shares this case rather than a body.
    case 'floor_only':
      return;

    case 'decline':
      pushDeclineLines(lines, input);
      return;

    // R1 — the live half of the same fact `refusal_withheld` reports terminally.
    // Two `flag` lines and nothing else: the register's whole body is the safety
    // statement, and every count on this card arrives from the table's row below
    // it (the floor sentence) rather than from here. That split is the point —
    // the first cut of this register wrote its own count handling and promptly
    // withheld it.
    //
    // ORDERED BELOW `pushDeclineLines` EVERYWHERE BOTH CAN FIRE, and that is a
    // rule rather than a preference: `detectIntakeDecline` owns the clinical lane
    // and this one is explicitly non-clinical (§6.5 — "without softening the
    // first"). `stateFor` enforces it; two stacked safety headlines would also
    // make neither the headline.
    case 'trial_refusal': {
      const refusal = liveRefusal(input);
      if (!refusal) return;
      lines.push({ role: 'flag', text: trialViabilityHeadline(refusal) });
      lines.push({
        role: 'flag',
        // THE POPULATION TRAVELS WITH THE FACT (B-530). When food identity misses,
        // the counts are over the meal record rather than over the trial diet, and
        // the note must not name a diet the app could not identify — the headline
        // above already widened its noun for the same reason. Passing the field
        // rather than re-deriving it is what keeps the two sentences agreeing.
        text: trialViabilityNote(input.petName, input.species ?? 'other', refusal.population),
      });
      return;
    }

    case 'refusal_withheld':
      if (rc.namedRefusal) {
        lines.push({
          role: 'note',
          text:
            'That’s a useful thing for your vet to know — it usually means a different ' +
            'diet, not a different plan.',
        });
      }
      lines.push({ role: 'fact', text: refusalWithheldLine(input, rc.dayCount) });
      return;

    case 'free_fed': {
      const freeFed = input.freeFed;
      if (!freeFed) return;
      lines.push({
        role: 'lead',
        text:
          `${input.petName} grazes from a bowl that’s topped up, so there’s no day-by-day ` +
          'count of what was eaten.',
      });
      // THE COUNT STAYS, THE CLAIM GOES (round 5 ①). "all N were the trial diet"
      // is the exact sentence `mayStateRecordClean` refuses under
      // `intakeNotDirectlyObserved`, and this branch asserted it anyway — over
      // the one state where BOTH intake lanes are structurally blind (a topped-up
      // bowl produces no rated feedings, and `detectIntakeDecline` excludes
      // free-fed foods by invariant #6). Unobservable is not clean. The OFF-DIET
      // half is kept and always renderable: it is a floor in the disclosing
      // direction, and §5.2's floor rule only ever moves that way.
      const n = freeFed.loggedFeedings;
      const ex = input.exposures;
      const noun = n === 1 ? 'bowl top-up or wet meal' : 'bowl top-ups and wet meals';
      lines.push({
        role: 'fact',
        text:
          ex && ex.offDiet > 0
            ? `${n} ${noun} logged so far; ${ex.offDiet} were not the trial diet.`
            : `${n} ${noun} logged so far.`,
      });
      lines.push({ role: 'qualifier', text: BLIND_SPOT_QUALIFIER });
      return;
    }

    case 'so_far': {
      // Jordan's binding constraint: the owner below the floor is BY DEFINITION
      // the one logging least, which is the one closest to quitting, so handing
      // them the emptiest, most disapproving card in the app is exactly
      // backwards. The card gets MORE here, not less — and every sentence is
      // about the RECORD, never the person (§6.9).
      lines.push({
        role: 'lead',
        text: 'There isn’t enough logged yet for your vet to read much into this.',
      });
      const remaining = remainingPhrase(rc.daysRemaining);
      lines.push({
        role: 'forward',
        text: remaining
          ? `Every meal from here counts, and there are ${remaining} left to build it.`
          : 'Every meal from here counts.',
      });
      lines.push({ role: 'fact', text: soFarLine(input) });
      lines.push({ role: 'qualifier', text: BLIND_SPOT_QUALIFIER });
      return;
    }

    case 'coverage_only':
      // No classifier yet (PR 5). The coverage fact still carries its blind-spot
      // qualifier — it is a claim about the record and §5.2 makes the qualifier
      // permanent ON the claim — but NOTHING is said about what was or was not
      // matched. Silence, not an all-clear.
      if (input.coverage) {
        lines.push({ role: 'fact', text: coverageLine(input.coverage) });
        lines.push({ role: 'qualifier', text: BLIND_SPOT_QUALIFIER });
      }
      return;

    case 'record': {
      // The two record facts in §5.1 order — coverage first (days), exposures
      // second (feedings), never welded.
      const ex = input.exposures;
      if (!ex) return;
      if (input.coverage) lines.push({ role: 'fact', text: coverageLine(input.coverage) });
      lines.push({ role: 'fact', text: exposureLine(ex) });
      lines.push({
        role: 'qualifier',
        text: BLIND_SPOT_QUALIFIER + (ex.offDiet > 0 && !caveat ? floorSuffix(ex.offDiet) : ''),
      });
      return;
    }

    default:
      // Same guarantee as `registerFor`'s. A silent fallthrough here renders an
      // EMPTY record region — the card keeps its header and loses every fact —
      // which is the quietest possible failure on the surface that must never be
      // quiet. (The `Record<TrialCardRegister, …>` table type catches an unwired
      // register first; this catches one that has a row and no body.)
      assertNever(register);
  }
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
  ctx: TrialContext,
  state: TrialCardState,
  register: TrialCardRegister,
): TrialCardModel {
  const { trial, startIndex, progress, overrunDays } = ctx;
  const endIndex = trialEndDayIndex(startIndex, trial.targetDurationDays);

  const base = {
    // B-704 — "{Protein} trial" when a protein resolves, else "Diet trial". The
    // food label stays the naming below it, so the fallback is today's card.
    kicker: trialIdentityLabel(input.trial),
    foodLabel: trial.foodLabel ?? null,
    // R2: the ONLY number that becomes a width, and it is day progress.
    progressFraction: progress.fraction,
    standingNote: input.standingNote ?? null,
    standingMeta: input.standingMeta ?? null,
  };

  const rc: RegionContext = {
    terminal: false,
    dayCount: 'these days',
    namedRefusal: false,
    daysRemaining: progress.daysRemaining,
  };

  // ── Replacement (8) — intake decline. Resolved FIRST in `stateFor`, and it is
  // structural: the `decline` register renders no adherence line, on any state
  // that reaches it. §5.2 proof #1 is a cat that refuses the hydrolyzed diet
  // every day whose owner dutifully logs the offered bowl — 100% coverage, 0
  // exposures, a maximally clean trial rendered over a starving animal seven
  // times past the feline 48h hepatic-lipidosis window.
  //
  // THE FLOOR SURVIVES THE SICKEST CARD TOO — the table says so, in the one row
  // that governs this state and both terminal decline branches at once. It used
  // to withhold the reading AND the count on the one patient a vet is most
  // likely to be reading about, because the rule lived at three call sites.
  if (state === 'intake_decline') {
    const lines = recordRegion(register, input, rc);
    return {
      ...base,
      state,
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

  // ── Replacement (10) — the trial diet itself is going unfinished (R1, mock
  // round 5). Resolved immediately after the clinical decline it defers to, and
  // for the same structural reason: while it is live this function is INCAPABLE
  // of returning an adherence line, because the register renders none.
  //
  // FIRES ON LOGGED EVIDENCE ONLY (R1a) — the floors live in `lib/dietTrial.ts`
  // (>=3 rated feedings, >=2 refused days, >=50% share) and mean an owner who is
  // not rating intake can never be told her cat isn't eating. Absence never
  // alarms; that is G2's two-sidedness, and it is why `pushTeachLine` exists.
  if (state === 'trial_refusal') {
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines: recordRegion(register, input, rc),
      // Same argument as the decline branch above: at or past the window a bar
      // pinned at 100% is completion vocabulary drawn in pixels, and drawing it
      // over a diet that isn't being eaten is the worst place in the app for it.
      // Mid-trial it still carries real day progress, so it stays.
      progressFraction: overrunDays >= 0 ? null : progress.fraction,
      // THE WAY OUT IS THE AFFORDANCE. Unlike the decline state — where the
      // answer is a phone call and the trial is beside the point — the action
      // this state implies is changing or ending the trial, which is a decision
      // the owner takes with their vet and then records here.
      actions: [
        { id: 'trial_manage', label: 'Change or end the trial', emphasis: 'secondary' },
        // The drill-in survives alongside the count, for the same reason the
        // count does — a flag the owner cannot interrogate is an unfalsifiable
        // accusation (§6.3).
        ...((input.exposures?.offDiet ?? 0) > 0
          ? ([{ id: 'view_exposures', label: 'Outside the trial diet', emphasis: 'link' }] as const)
          : []),
        // The milestone stays reachable at the window for the same reason it does
        // on the decline card: a trial with no ending reads to the vet as one
        // still going.
        ...(overrunDays >= 0
          ? ([{ id: 'milestone', label: 'Tell Culprit what’s next', emphasis: 'link' }] as const)
          : []),
      ],
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
  // as the trial's result. §4.3's "deliberately NO fact lines" is an argument
  // about COVERAGE; the off-diet floor is a different rule and points the other
  // way — this is the moment the owner decides whether the trial is done, and
  // withholding twelve logged exposures here is the worst place in the flow to
  // withhold them. That is the `floor_only` row: no reading, the floor still
  // owed, and no can't-match directive riding along with it. DEVIATION FROM THE
  // ROUND-4 DESIGN LOCK, flagged for the Designer rather than taken silently.
  if (state === 'milestone') {
    return {
      ...base,
      state,
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
      lines: [
        { role: 'note', text: milestoneNote(trial.indication) },
        ...recordRegion(register, input, rc),
      ],
      actions: trialDecisionChoices(trial.indication).map((c) => ({
        id: DECISION_ACTION_ID[c.id],
        label: c.label,
        emphasis: c.emphasis,
      })),
    };
  }

  const lines: TrialCardLine[] = [];

  // ── State 1 — day 1. No claim in EITHER direction, because there is nothing
  // yet to describe. Note what is absent: no "0 off-diet foods", which R1
  // forbids and which day 1 would otherwise render most confidently. A logged
  // off-diet feeding is not a claim, it is the record, and §5.2 owes it
  // everywhere — hence `floor_only` rather than a silent register.
  if (state === 'day_one') {
    // KEYED ON THE SAME POPULATION AS THE COUNT BELOW IT. Coverage excludes
    // treats and the exposure count includes them, so an owner who logged two
    // treats and no meal on day 1 got "Nothing logged yet today." rendered
    // directly above "2 logged feedings were outside the trial diet" — a flat
    // self-contradiction on the card whose whole job is being true about the
    // record. Something WAS logged; only a meal wasn't.
    if ((input.coverage?.daysLogged ?? 0) === 0 && (input.exposures?.totalFeedings ?? 0) === 0) {
      lines.push({ role: 'fact', text: 'Nothing logged yet today.' });
    }
    lines.push({
      role: 'forward',
      text: 'From here, every meal and treat you log builds the record your vet reads.',
    });
    lines.push(...recordRegion(register, input, rc));
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      actions: [viewAllowedFoodsAction(input.petName)],
    };
  }

  // ── Replacement (9) — free-fed (§5.6). A `free_choice` arrangement emits no
  // meal events, so the coverage RATIO has no denominator: it is replaced by the
  // intakeNotDirectlyObserved marker, mirroring lib/analytics invariant #6.
  // Without this the most tightly controlled feline trial in the app scores
  // near-zero coverage and Culprit spends eight weeks telling a compliant owner
  // she is failing.
  if (state === 'free_fed') {
    lines.push(...recordRegion(register, input, rc));
    // Round 5: the forward line is restored, so Sam's card is not a count and a
    // caveat for six weeks. The card's job is keeping her IN the trial (§4.2),
    // and the free-fed state was the one active state with nothing forward on it.
    const freeFedRemaining = remainingPhrase(progress.daysRemaining);
    if (freeFedRemaining) {
      lines.push({ role: 'forward', text: `${freeFedRemaining} to go.` });
    }
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      actions: [viewAllowedFoodsAction(input.petName)],
    };
  }

  // ── State 4 — below the coverage floor. The `so_far` register owns the whole
  // body here (lead, forward, the combined paragraph, the qualifier) because the
  // sub-floor card leads with the record's LIMITS and then discloses what is on
  // it — the one state whose forward line sits inside the record region rather
  // than after it. Its disclosures are the record register's, in full: the bowl
  // and the untracked head are exactly the causes this card's deficiency lead
  // most needs named beneath it.
  if (state === 'below_floor') {
    return {
      ...base,
      state,
      dayLine: dayLineFor(progress, overrunDays),
      dayLineRole: 'meta',
      windowLine: windowLineFor(endIndex, overrunDays),
      lines: recordRegion(register, input, rc),
      actions: [viewAllowedFoodsAction(input.petName)],
    };
  }

  // ── States 2, 3 and 6 share one body: coverage, then exposures, then the
  // inline qualifier. They differ in the day/window header and the note.
  lines.push(...recordRegion(register, input, rc));

  // R1b's teach line, on every state in this body EXCEPT `exposures` — and the
  // exception is the rule, not an omission. The exposures card already carries a
  // note the owner is meant to act on (record-and-continue, the sentence that
  // decides whether they finish six weeks); a teaching aside underneath it
  // competes for the same slot and dilutes the one message that state exists for.
  // Every other state in this body has that slot free.
  if (state !== 'exposures') pushTeachLine(lines, input);

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
    // NEVER NAME A "SLIP" THE COMPARATOR CANNOT SUPPORT. With an unusable food
    // list every feeding falls to rung 3, so `mostRecent` is simply the latest
    // feeding — which on the ordinary two-device sync case is the PRESCRIBED
    // DIET. The card named it as the most recent thing outside the trial diet
    // and then said "Keep going with the trial diet" in the same sentence.
    const recent = input.allowedSetUnavailable ? null : input.exposures?.mostRecent;
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
    actions: [
      ...(state === 'exposures' && (input.exposures?.offDiet ?? 0) > 0
        ? ([{ id: 'view_exposures', label: 'Outside the trial diet', emphasis: 'link' }] as const)
        : []),
      // B-616 FR-5. Last, and a `link`, because it is a REFERENCE rather than
      // something to act on: the exposures drill-in answers a question the card
      // just raised, and this one answers a question the owner brought with them.
      // Both stay quiet — §4.2's weight belongs to the trial's own state.
      //
      // On every running state in this body, including `exposures`: the moment an
      // owner has just been told a feeding fell outside the diet is exactly when
      // "what CAN he eat?" is the next question, and answering it is the
      // record-and-continue posture rather than a scolding.
      viewAllowedFoodsAction(input.petName),
    ],
  };
}

/** The §5.2 replacement, shared by the active and BOTH terminal cards: the
 *  decline fact leads, the note names the priority, and no record line renders
 *  while it is live.
 *
 *  BOTH LINES CARRY THE `flag` ROLE as of round 5. They were `lead` + `note`,
 *  which the view drew in ordinary body weight — so the one composition §5.2
 *  makes structural was the least visible thing on the card, and the new refusal
 *  register (drawn tinted in the design lock) would have looked more urgent than
 *  the clinical lane that outranks it. */
function pushDeclineLines(lines: TrialCardLine[], input: TrialCardInput): void {
  if (!input.intakeDeclineHeadline) return;
  lines.push({ role: 'flag', text: input.intakeDeclineHeadline });
  lines.push({
    role: 'flag',
    text:
      (input.species === 'cat'
        ? 'A cat that stops eating needs a call today, whatever the trial is doing.'
        : `A pet that goes off their food needs a call, whatever the trial is doing.`) +
      // "isn't showing the trial numbers" was true only while this branch
      // rendered none. Adding the off-diet floor to it — correct, and this PR's
      // own change — made it a flat false statement rendered directly above a
      // trial number. `trialViabilityNote` had this exact sentence corrected
      // twice for the same reason; the sibling never got the edit.
      ' Culprit isn’t reading these days as a clean run while this is going on.',
  });
}

/**
 * ── THE ONE PLACE THE FLOOR RULE IS ENFORCED ─────────────────────────────────
 *
 * Four rounds of adversarial review found the same defect in four different
 * branches, and round 4 named why: every fix picked ONE of {withhold the
 * reading, withhold the count, disclose} and applied it to ONE register, so the
 * branch it did not visit inherited the opposite defect. The two rules are
 * independent and both hold everywhere:
 *
 *   WITHHOLD THE READING — no coverage ratio, no "clean run", no "all N matched"
 *   when the record cannot support it.
 *
 *   NEVER WITHHOLD THE FLOOR — how many logged feedings were off the list is a
 *   count the owner and the vet are entitled to in every state. §5.2 rules it a
 *   floor, and a floor only moves in the disclose-more direction.
 *
 * WHO CALLS IT is no longer a branch's decision: `TRIAL_CARD_DISCLOSURES` names
 * the registers that carry a floor sentence, `recordRegion` is the only caller,
 * and a property test walks every state asserting that `offDiet > 0` implies the
 * number renders. This function now only writes the sentence.
 *
 * `lead` is what it attaches to: the decline card says "Separately" because a
 * flag block precedes it; a terminal card is already mid-record.
 *
 * THE FLOOR SUFFIX IS SUPPRESSED WHEN THE CAN'T-MATCH CAVEAT RENDERS, and the
 * caller passes that one answer in rather than re-deriving it. "not a total"
 * asserts the true number is >= N; the caveat says the comparator may be
 * missing, i.e. it could be lower. Keying the suffix on the FLAG and the caveat
 * on the COUNT broke the invariant in both directions at once: five
 * wholly-unmatched feedings (below the 10-feeding reconciliation floor, so the
 * flag is off) rendered "The 5 are what's been logged, not a total." immediately
 * above "Culprit can't match these against the food list" — at-least-5 and
 * maybe-fewer, adjacent.
 */
function pushFloorSentence(
  lines: TrialCardLine[],
  input: TrialCardInput,
  lead: 'separately' | 'plain',
  caveat: boolean,
): void {
  const ex = input.exposures;
  if (!ex || ex.offDiet <= 0) return;
  const noun = ex.offDiet === 1 ? 'feeding' : 'feedings';
  const stem =
    lead === 'separately'
      ? `Separately, ${ex.offDiet} logged ${noun} were outside the trial diet.`
      : `${ex.offDiet} logged ${noun} were outside the trial diet.`;
  lines.push({
    role: 'fact',
    text: stem + (caveat ? '' : floorSuffix(ex.offDiet)),
  });
}

/** Names what a past bowl accounts for, and claims nothing about the rest — an
 *  earlier draft closed with "aren't a gap in what you logged", which offered
 *  three bowl days as the explanation for thirty missing ones. */
function pushPastBowlCaveat(lines: TrialCardLine[], input: TrialCardInput): void {
  if (!input.freeFedOverlap || input.freeFed) return;
  lines.push({
    role: 'qualifier',
    text:
      `For part of this trial ${input.petName} had a bowl that was topped up, and those ` +
      'days can’t have a meal-by-meal count.',
  });
}

/** The RECORD half of the can't-match question. `recordRegion` answers it once,
 *  ANDs it with the register's policy, and hands that single answer to all three
 *  consumers — the caveat itself, the floor sentence's suffix, and the record
 *  qualifier's suffix — so no consumer can key on a proxy for another. See the
 *  call site for the two records where the proxy disagreed. */
function unmatchedCaveatApplies(input: TrialCardInput): boolean {
  const ex = input.exposures;
  if (!ex || ex.totalFeedings <= 0) return false;
  // ONLY WHEN NOTHING MATCHED. "None of these matched" rendered one line under
  // "60 feedings in total — 40 matched, 20 did not", because the caveat keyed on
  // the flag and never on the count it was qualifying. A permitted topper is
  // enough to produce that pair.
  if (ex.offDiet !== ex.totalFeedings) return false;
  // AND WHENEVER NOTHING MATCHED, not only above the reconciliation floor. Below
  // it the card was strictly MORE accusatory — the floor suffix asserting the
  // true number is higher, with no caveat at all — which inverted the very
  // discontinuity the floor was meant to smooth.
  if (!input.allowedSetUnavailable && ex.offDiet < UNMATCHED_CAVEAT_MIN_FEEDINGS) return false;
  return true;
}

function pushUnmatchedCaveat(lines: TrialCardLine[], input: TrialCardInput): void {
  const ex = input.exposures;
  if (!unmatchedCaveatApplies(input) || !ex) return;
  lines.push({
    role: 'qualifier',
    // TWO-SIDED, and that is the correction. The first draft named only the
    // exculpatory reading ("the list is out of date, so this count is too high"),
    // which handed a pre-written excuse to the single most non-adherent record
    // the app can produce — an owner feeding the old kibble twice a day trips the
    // same flag with a perfectly correct list. Naming one reading and not the
    // other IS guessing which is true. It also no longer says "worth a look
    // before your vet reads it": there is no route from this card to the food
    // list, and pointing at one that does not exist is worse than staying quiet.
    // THE SECOND DISJUNCT IS ABOUT ADHERENCE, NOT INTAKE. "the trial diet hasn't
    // been going in" is an INTAKE claim, and this is an adherence classifier with
    // no intake input — on the fixture that found it, every one of those feedings
    // was rated `all`, so the app held direct logged evidence the food WAS eaten
    // and said the opposite. What the classifier can actually say is that the
    // food being fed is not the food on the list.
    //
    // AND IT NO LONGER INSTRUCTS. Two problems with "Worth checking the list
    // before your vet reads this", both found by `pm-feature-review`:
    //
    //   • THERE IS NO ROUTE. The only affordance on this card is the header's
    //     "Change", which on a running trial opens the ordered blocked screen —
    //     so an owner who followed the instruction was offered the destruction of
    //     her eight-week trial. The docstring above already said not to point at
    //     a route that does not exist; the string did it anyway.
    //   • "what's being fed isn't the trial diet" SCORES THE PERSON (§6.9), and
    //     "before your vet reads this" casts the vet as an audience she should
    //     tidy up in front of.
    //
    // The model is `pushPastBowlCaveat`: name the CAUSE the app is responsible
    // for, not a shortfall the owner is. This states what Culprit cannot do and
    // stops — the honest half of a disjunction whose other half it cannot
    // distinguish anyway.
    text:
      'Culprit can’t match these against the food list for this trial — the list may ' +
      'still be syncing, or it may not have everything on it yet.',
  });
}

/**
 * §10 S3 — the untracked head, disclosed rather than silently clipped.
 *
 * THE CLIP IS RIGHT AND THE SILENCE WAS NOT. Denominating coverage from
 * `started_at` scores an owner for days before the app was on their phone, so the
 * range starts at the first log — but saying "Meals logged on 2 of 2 days" over
 * "Day 30 of 56" and then claiming the record is clean is a *more* reassuring
 * card than the un-clipped one it replaced. `generate-report` has always rendered
 * this ("The first 28 days…"); the card computed it and dropped it on the floor.
 *
 * It is a statement about the RECORD's shape, not a failing: the copy names what
 * is missing and does not ask the owner to account for it.
 *
 * IT SAYS "NO MEALS", NOT "NOTHING". The head is anchored on NON-TREAT feedings
 * (the same event set as the coverage numerator), so an owner who logged a dental
 * chew every day for the first four weeks and meals thereafter got "The first 28
 * days of the trial have nothing logged against them" rendered directly beneath a
 * feeding count that included all 28 of those treats. False, contradicted one
 * line up, and — because the false thing it asserted was that the owner logged
 * nothing — the one framing §6.9 forbids. It also says "the days count", because
 * the head is excluded from the DAYS ratio and not from the feeding total.
 */
function pushUntrackedHead(lines: TrialCardLine[], input: TrialCardInput): void {
  const days = input.untrackedDaysBeforeFirstLog ?? 0;
  if (days <= 0) return;
  lines.push({
    role: 'qualifier',
    text:
      days === 1
        // CAUSE FIRST, THEN THE FACT. "The first 12 days have no meals logged
        // against them" is the clause that lands, and it is the accusatory half;
        // the part that makes the line honest rather than scoring — that those
        // days are excluded, not counted against her — was bookkeeping she had to
        // finish the sentence to reach. Inverting costs nothing.
        //
        // It also no longer says "the days count above": on the sub-floor card
        // the coverage is a clause inside one paragraph, not a discrete line, so
        // the referent was wrong there.
        ? 'The first day of the trial isn’t counted here — no meals were logged against it yet.'
        : `The first ${days} days of the trial aren’t counted here — no meals were logged ` +
          'against them yet.',
  });
}

/**
 * R1b — the line that teaches the intake tap, and the reason the register above
 * is reachable at all.
 *
 * IT FIRES WHEN NOTHING IS WRONG, which is the entire design: the refusal lane can
 * only see RATED feedings (R1a — an owner who isn't rating must never be told her
 * cat isn't eating), so an owner who never learns the tap exists has a trial whose
 * viability the app is structurally blind to. Teaching at that moment costs one
 * warm sentence; teaching after the fact costs the finding.
 *
 * Every word is about the RECORD, never the person (§6.9) and never the animal — a
 * line that made an owner on a perfectly fine day wonder what was wrong with her
 * cat would fail this state's one requirement.
 *
 * ── WHY IT IS NOT A ROW IN `TRIAL_CARD_DISCLOSURES` ─────────────────────────────
 * The table answers "what may this register say ABOUT THE RECORD", and every cell
 * in it withholds or discloses a record statement. The teach line makes no claim
 * about the record's contents at all — it is a forward affordance, in the same
 * family as the `forward` lines and the actions, neither of which the table has
 * ever governed. It is also placed by STATE (see the call site: everywhere in the
 * shared body except `exposures`), and the table is keyed by REGISTER — `clean`
 * and `exposures` share the `record` row, so a cell could not express the rule
 * even if the rule belonged there. Widening the table to hold it would cost the
 * crispness that makes reading a column a review.
 */
function pushTeachLine(lines: TrialCardLine[], input: TrialCardInput): void {
  const rating = input.intakeRating;
  if (!rating) return;
  // ASK THE NARROW QUESTION WHEN THERE IS A NARROW POPULATION TO ASK IT OF.
  //
  // The refusal lane reads `primary_diet` feedings only, so that is the population
  // whose rated share decides whether the lane can see anything. Asking only the
  // wide question breaks in one step: an owner logging two unrated bowls of the
  // prescribed diet and three rated permitted toppers a day has a 60% rated share
  // overall and 0% where it counts — so the teach line goes silent on exactly the
  // record whose viability is unknowable, which is the opposite of its job.
  //
  // The wide population is the FALLBACK, for when identity has missed and there
  // are no primary-diet feedings to measure (an un-hydrated allowed set, a
  // re-photographed bag). Silence there would be just as wrong, and the copy is
  // honest under either reading because it speaks about the meal record.
  const narrow = rating.primaryFeedings >= INTAKE_RATING_TEACH_MIN_FEEDINGS;
  const [rated, feedings] = narrow
    ? [rating.primaryRated, rating.primaryFeedings]
    : [rating.rated, rating.feedings];
  if (feedings < INTAKE_RATING_TEACH_MIN_FEEDINGS) return;
  if (rated / feedings >= INTAKE_RATING_TEACH_SHARE) return;
  // THE SENTENCE HAS TO NAME THE POPULATION IT FIRED ON. One string denominated on
  // the whole meal record, triggered by the narrow one, is false in exactly the
  // case the narrow trigger exists for: the owner logging unrated bowls of the
  // prescribed diet beside rated toppers has 96% of her logged meals rated, and
  // "most of Mochi's logged meals don't yet say how much was eaten" reads back at
  // her as a wrong statement about her own logging (§6.9).
  lines.push({
    role: 'teach',
    text: narrow
      ? `One tap makes these readable. Most of ${input.petName}’s logged meals of the ` +
        'trial diet don’t yet say how much was eaten, and on a diet trial that’s the ' +
        'part your vet reads.'
      : `One tap makes these readable. Most of ${input.petName}’s logged meals don’t ` +
        'yet say how much was eaten, and on a diet trial that’s the part your vet reads.',
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

/** State 4's single combined sentence — deliberately one paragraph, because the
 *  sub-floor card leads with the record's limits and then discloses what IS on
 *  it, rather than opening with a ratio that reads as a score. */
function soFarLine(input: TrialCardInput): string {
  // NOTHING LOGGED IS NOT A RECORD OF ZEROES. `parts.length === 0` was the only
  // route to the designed empty state below, and B-474's un-nulling closed it:
  // `coverage` and `exposures` now arrive as zeroed OBJECTS rather than nulls, so
  // an owner twelve days in with nothing logged read
  // "Of what's on the record so far: meals on 0 of 12 days, 0 feedings in total."
  // — a Principle-5 empty state, written and shipped, on the one state that most
  // needs it, unreachable. The emptiness test is the CONTENT, not the shape.
  const nothingLogged =
    (input.coverage?.daysLogged ?? 0) === 0 && (input.exposures?.totalFeedings ?? 0) === 0;
  if (nothingLogged) return 'Nothing is on the record for this trial yet.';

  const parts: string[] = [];
  if (input.coverage) {
    parts.push(`meals on ${input.coverage.daysLogged} of ${input.coverage.daysElapsed} days`);
  }
  const ex = input.exposures;
  if (ex) {
    const noun = ex.totalFeedings === 1 ? 'feeding' : 'feedings';
    parts.push(`${ex.totalFeedings} ${noun} in total`);
    // Same gate as `exposureLine`. This sentence carried its own copy of the
    // affirmative claim, which is exactly how a rule enforced in one place gets
    // shipped broken in another.
    if (ex.offDiet > 0) {
      parts.push(`${ex.totalFeedings - ex.offDiet} matched and ${ex.offDiet} did not`);
    } else if (ex.mayStateRecordClean) {
      parts.push(`all ${ex.totalFeedings} matched the trial diet or a permitted food`);
    }
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
  ctx: TrialContext,
  register: TrialCardRegister,
): TrialCardModel {
  const { trial, startIndex } = ctx;
  // §5.2's composition is TERMINAL-STATE-AWARE, in all three of its forms, and
  // `registerFor` is now the one place that says so rather than three branches
  // each remembering. The round-1b lesson was that a rule drawn as a live-flag
  // replacement never reached the terminal states; the first cut of THIS file
  // repeated it in mirror image — it made refusal terminal-aware but let a live
  // intake-decline flag through, so a completed trial rendered "182 feedings —
  // 176 matched" over a cat that has stopped eating NOW. The decline outranks
  // the record on every state, because the animal outranks the trial.
  //
  // R1 ADDS THE THIRD FORM, and it is the same lesson a third time: a trial the
  // record shows was largely left unfinished cannot render an adherence line just
  // because the owner tapped "This trial is done". State 7b has enforced exactly
  // that since round 1b — but only off `stopped_reason`, so it reached the trial
  // the owner CALLED a refusal and not the one the record shows was one.
  const lines = recordRegion(register, input, {
    terminal: true,
    dayCount: terminalDayCount(trial, startIndex),
    // 7a never names a refusal: the owner tapped "This trial is done", so there
    // is no reason of theirs for the "different diet, not a different plan" note
    // to answer.
    namedRefusal: false,
    daysRemaining: 0,
  });
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
    kicker: `${trialIdentityLabel(input.trial)} · finished`,
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

/** "56 days", else the pronoun-ish fallback the withheld sentence reads with. */
function terminalDayCount(trial: TrialCardTrial, startIndex: number): string {
  return terminalRange(trial, startIndex)?.split('· ')[1] ?? 'these days';
}

/**
 * The terminal replacement for the adherence line: what the record HOLDS, with
 * the clean statement structurally absent. The `refusal_withheld` register's
 * whole body.
 *
 * It was once reachable only from `stopped_reason === 'refused'` — the trial the
 * owner NAMED a refusal — which left the harder case uncovered: the owner who ran
 * the eight weeks out and tapped "This trial is done" over a record showing the
 * diet was left unfinished throughout. That card rendered the clean two-fact
 * statement, which is the round-1b defect exactly, one state over.
 *
 * NOTE WHAT IT STILL SAYS. It is not silence: the coverage and feeding counts are
 * both here, because the owner kept that record and the vet needs it. What is
 * deleted is the reading — "how clean these days were" — which a diet that went
 * uneaten cannot support in either direction. The off-diet floor comes from the
 * register's row rather than from this function: it once rendered coverage and
 * the feeding total but never the off-diet count, so an owner who rated three of
 * 124 meals lost twelve genuine exposures from the card.
 */
function refusalWithheldLine(input: TrialCardInput, dayCount: string): string {
  return (
    `Culprit isn’t showing how clean ${dayCount === 'these days' ? 'these days' : `these ${dayCount}`} were. ` +
    'A diet that wasn’t eaten can’t be read as one that was followed' +
    (input.coverage
      ? ` — the record is meals offered on ${input.coverage.daysLogged} of ${input.coverage.daysElapsed} days` +
        (input.exposures ? `, ${input.exposures.totalFeedings} feedings in total` : '') +
        ', and what your vet needs from it is the refusal.'
      : ', and what your vet needs from it is the refusal.')
  );
}

function abandonedCard(
  input: TrialCardInput,
  ctx: TrialContext,
  register: TrialCardRegister,
): TrialCardModel {
  const { trial, startIndex } = ctx;
  const lines: TrialCardLine[] = [];
  const range = terminalRange(trial, startIndex);

  if (trial.stoppedReason) {
    lines.push({ role: 'lead', text: stoppedBecauseLine(input.petName, trial) });
  }

  // TERMINAL-STATE-AWARE, and this is a RULE rather than a copy choice (the
  // Jordan review, round 1b). §5.2's composition rule was drawn as a LIVE-FLAG
  // replacement only, so it never reached the terminal states — and round 1 duly
  // rendered "All 54 matched the trial diet or a permitted food" three lines
  // above "wouldn't eat it". A trial whose stopped_reason is refusal is
  // STRUCTURALLY incapable of rendering an adherence line, and so is one the
  // RECORD shows went uneaten (`rangeRefusal`, R1) — `registerFor` routes both to
  // the same register, and only the first of them carries the note, because that
  // sentence answers a reason the OWNER gave.
  lines.push(...recordRegion(register, input, {
    terminal: true,
    dayCount: range?.split('· ')[1] ?? 'these days',
    namedRefusal: wasRefused(trial),
    daysRemaining: 0,
  }));

  // A live decline replaces every record line AND the way out: this card is
  // about a pet that has stopped eating, so it offers no "start a new trial".
  if (register === 'decline') {
    return {
      state: 'abandoned',
      kicker: `${trialIdentityLabel(input.trial)} · stopped early`,
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

  pushContinuation(lines, trial);

  return {
    state: 'abandoned',
    // §6.6 — an abandoned trial is a legitimate clinical fact, never a failure
    // state, so the kicker states what happened and judges none of it.
    kicker: `${trialIdentityLabel(input.trial)} · stopped early`,
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
  /**
   * Signals v2 (B-755 / CUL-13, §4.2) — the standing one-line vomit count, a SECOND line below
   * `line`: "Vomiting: 4 in the trial's 20 days · 20 in the 7 weeks before." (the B1 mock form). Null
   * when `signals_v2` is off (no `input.trialResponse` computed → byte-identical strip), when a safety
   * flag suppresses the strip's lines, or when there is no vomiting on record to describe. A
   * DESCRIPTION, never a control (§4.2 second-door rule intact).
   */
  trialResponseLine: string | null;
}

/**
 * The standing trial-card line copy (CUL-13, §4.2) — the un-gated raw-count sibling of the
 * event-driven Signal trial card. Two forms, chosen by how much the two windows were logged:
 *
 *   • COMPARISON (both windows ≥ `minLoggingDaysPerWindow` logged days — enough to compare honestly):
 *     "Vomiting: {t} in the trial's {N} days · {b} in the {W} weeks before." (the mock B1 form).
 *   • TRIAL-SO-FAR (below that floor — a too-new trial or a baseline too thin to compare): drops the
 *     baseline clause to "Vomiting: {t} in the trial's {N} days." The config comment on the detector's
 *     `minLoggingDaysPerWindow` names this exactly ("the trial-so-far counts still show on the
 *     standing Pet-tab line"). The trial count is NEVER gated away — raw counts always show.
 *
 * Returns null when there is nothing to describe — a two-sided all-zero (no vomiting either window) or
 * a below-floor zero-trial record — so the strip never proactively says "0 vomits" over a quiet
 * stretch (which would edge toward reassurance-on-absence). Two-sided, count-anchored, NEVER a verdict
 * (G1/G2). The floor is the SAME constant the detector gates on, so the two surfaces agree on "enough
 * to compare".
 *
 * ── THE DENSITY GUARD (adversarial-reviewer, CUL-13) — the never-reassure fix ──────────────────────
 *
 * The baseline clause is ALSO withheld when the comparison reads as a REDUCTION but the two windows
 * were NOT logged with comparable intensity (`densityComparable` false). This is the guard
 * `detectTrialResponse` puts on its fewer direction, and it MUST be here too: without it, a chronic
 * vomiter whose owner keeps one-tap meal-confirming (keeping the trial's logged-day count up) but
 * stops logging vomits mid-trial would see "Vomiting: 0 in the trial's 20 days · 20 in the 7 weeks
 * before" — a prominent false "it stopped", on the always-visible wedge strip, that the card
 * deliberately refuses (a quieter-looking trial may just be a less-logged one). Withheld ⇒ the line
 * drops to the trial-so-far form, which returns null for `trialCount === 0`, so the dangerous line
 * vanishes. The MORE direction is never gated (a rise always surfaces — escalation is the safe
 * direction), matching the detector's asymmetry. The residual the guard can't remove (comparable
 * density but symptom-logging attrition) is the app-wide didn't-log≠didn't-happen limit and the OPEN
 * PR-3 fewer-direction decision — the standing line now inherits whatever the card's posture becomes.
 */
export function trialResponseStandingLine(counts: TrialResponseCounts): string | null {
  const floor = TRIAL_RESPONSE_COUNTS_DEFAULTS.minLoggingDaysPerWindow;
  const days = counts.trialDayNumber === 1 ? 'day' : 'days';
  // A reduction on non-comparable logging is the reassurance-risk case — withhold the baseline clause
  // (drop to trial-so-far). A flat/increase (the escalation direction) is never withheld.
  const reduction = counts.trialCount < counts.baselineCount;
  const showComparison =
    counts.trialLoggedDays >= floor &&
    counts.baselineLoggedDays >= floor &&
    (counts.densityComparable || !reduction);
  if (showComparison) {
    if (counts.trialCount + counts.baselineCount === 0) return null;
    // B-775 — both windows in the SAME unit (days, not "7 weeks") + a "longer stretch" cue when the
    // baseline covers materially more time, so the count pair can't be read as a like-for-like ratio (a
    // falling count over the shorter recent window over-states the drop — the reassuring-direction error,
    // clinical-guardrails / intake-is-not-preference). Presentation-only; mirrors the Signal card's
    // server lead (`templateTrialResponse`), so the strip and the card scale the same.
    const baselineDays = counts.baselineWindowDays;
    const baselineDayNoun = baselineDays === 1 ? 'day' : 'days';
    const lengthCue = baselineDays >= counts.trialDayNumber * 1.5 ? ', a longer stretch' : '';
    return `Vomiting: ${counts.trialCount} in the trial's ${counts.trialDayNumber} ${days} · ${counts.baselineCount} in the ${baselineDays} ${baselineDayNoun} before${lengthCue}.`;
  }
  if (counts.trialCount === 0) return null;
  return `Vomiting: ${counts.trialCount} in the trial's ${counts.trialDayNumber} ${days}.`;
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

  // B-704 — the identity leads, then the day suffix ("Rabbit trial · day 12 of
  // 42"). Falls back to "Diet trial" when no protein resolves; the food label
  // stays in the strip's line below, so the fallback is today's strip unchanged.
  const identity = trialIdentityLabel(trial);
  const overrunDays = progress.dayCounter - progress.targetDays;
  const header = overrunDays > 0
    ? `${identity} · day ${progress.dayCounter} — ${overrunDays} ${overrunDays === 1 ? 'day' : 'days'} past`
    : `${identity} · day ${progress.dayCounter} of ${progress.targetDays}`;

  // While an intake-decline flag is live the strip carries the day count and
  // nothing else: SignalZone sits above it and owns the safety card, and a
  // coverage line under a pet that has stopped eating is the composition §5.2
  // forbids on the card for the same reason.
  //
  // R1 puts the refusal fact on the same footing. The strip has no room for the
  // register itself — that lives on the Pet tab's card — but it must not do the
  // one thing it could do wrong here, which is render a tidy coverage line as if
  // the trial were proceeding normally. Silence on Home, the register one tap
  // away; never a reassuring summary of a trial the record says isn't running.
  if (input.intakeDeclineHeadline) {
    // A live safety flag suppresses the strip's record lines — the vomit-count line included (CUL-13):
    // a two-sided count next to "the pet stopped eating" is exactly the reassuring-summary composition
    // this branch exists to withhold. Header only; the record is one tap away on the Pet tab.
    return { header, line: null, progressFraction: progress.fraction, trialResponseLine: null };
  }

  const parts: string[] = [];
  if (trial.foodLabel) parts.push(trial.foodLabel);
  const endIndex = trialEndDayIndex(startIndex, trial.targetDurationDays);
  parts.push(
    overrunDays > 0
      ? `window ended ${formatTrialDate(endIndex)}`
      : `ends ${formatTrialDate(endIndex)}`,
  );
  // THE STRIP IS STRICTER THAN THE CARD, DELIBERATELY — AND ITS RULE IS NOW ONE
  // SENTENCE: Home states the ratio only when the record carries NONE of the
  // withholding reasons.
  //
  // Home has one line and nowhere to put the can't-match caveat, the untracked
  // head, the antigen-arm pause, or the "offered, not eaten" reframing that make a
  // ratio honest on the card, so a reason the card can absorb is a reason the strip
  // cannot. Every round-8/9 strip defect was this conjunction being patched one
  // reason at a time — for the decline flag, then the head, then the refusal — with
  // the NEXT reason still rendering. `withholdingReasons` is the list, in one place,
  // that both surfaces read; a new reason (B-597's `antigen_arm_dark` was the
  // latest) cannot be added to one and forgotten on the other.
  //
  // An earlier cut of this comment said "the strip states coverage only when the
  // card would state it plainly", which stopped being true the moment round 9's
  // active-card routing was reverted. A comment asserting a guarantee the code
  // does not provide is this file's most-repeated defect, so the rule above is
  // stated as what it is rather than as a relation to the card.
  const coverageIsPlain = withholdingReasons(input).length === 0;
  if (input.coverage && coverageIsPlain) {
    parts.push(
      `meals logged on ${input.coverage.daysLogged} of ${input.coverage.daysElapsed} days`,
    );
  }
  // THE FLOOR IS OWED HERE TOO — this file's header says "in every state", and
  // the strip rendered the one number that always looks good while omitting the
  // one that reports a finding, on the surface the wedge owner sees daily.
  //
  // NOT under `allowedSetUnavailable`: there the count is an artefact of a
  // comparator the app has just declared unusable, and the strip can carry
  // neither the floor suffix nor the caveat that make it honest on the card.
  const stripOffDiet = input.allowedSetUnavailable ? 0 : input.exposures?.offDiet ?? 0;
  if (stripOffDiet > 0) {
    parts.push(`${stripOffDiet} outside the trial diet`);
  }

  // The standing vomit-count line is a REASSURING record summary (a falling count reads as
  // improvement), so §5.2 forbids it beside a record that says the animal ISN'T EATING — the same
  // composition the `intakeDeclineHeadline` early-return above already blocks, but that early-return
  // only covers RELATIVE intake decline. The adversarial-reviewer (B-766/B-775 session) surfaced the
  // hole: a diet-trial cat REFUSING the prescribed diet from day 1 has a uniformly-low intake, so the
  // relative-decline detector never fires and `intakeDeclineHeadline` is null — yet a live
  // `trialDietRefusal` IS on record. Without this gate the strip renders "Vomiting: 0 · was 20, a
  // longer stretch" under a starving cat (the canonical B-494 anorexic-cat case, one layer out), and
  // B-775's "a longer stretch" clause amplifies the false magnitude. `isAnimalNotEating` is the SAME
  // predicate the B-789 Signal card suppresses on (one definition, two surfaces), scoped to the
  // NOT-EATING reasons only: a broken off-diet comparator, a free-fed arrangement, or a thin record
  // does NOT make the vomit count dishonest, so those must not drop an otherwise-valid vomiting finding.
  const animalNotEating = isAnimalNotEating(input);
  return {
    header,
    line: parts.length > 0 ? parts.join(' · ') : null,
    progressFraction: progress.fraction,
    // CUL-13 — the standing vomit-count line, a SECOND line below the coverage line. Null unless
    // `signals_v2` is on (the loader only computes `input.trialResponse` then), so the strip is
    // byte-identical off the flag. Withheld on a not-eating record (above) so it never reassures over a
    // refusing/anorexic cat; its own render rule (comparison vs trial-so-far vs nothing) lives in
    // `trialResponseStandingLine`.
    trialResponseLine:
      input.trialResponse && !animalNotEating
        ? trialResponseStandingLine(input.trialResponse)
        : null,
  };
}
