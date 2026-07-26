// The completion milestone and the owner-reported outcome — B-417 PR 6 (§4.3).
// Design lock: `docs/nyx-diet-trial-mockups.html` Surface 3 (round 4).
//
// ── WHAT THIS IS THE MOMENT OF ───────────────────────────────────────────────
// This is the one screen in the product where the app's copy can end a medical
// intervention. §4.3's first requirement is not a copy note, it is the clinical
// risk: **it must never read as permission to stop the diet.** On the GI default
// that is live harm — ACVIM 2026 says continue the diet ≥12 weeks before
// transitioning away, so a day-28 milestone saying "trial complete" tells an
// owner to stop a diet their vet wanted continued for three months.
//
// Three constructions carry that, and none of them is decoration:
//
//  1. NO COMPLETION VOCABULARY. Nothing here says complete, finished, passed,
//     well done or congratulations. The milestone states a FACT about a window
//     the OWNER set ("the window you set is done") and then hands the clinical
//     decision to the vet, in the sentence directly under it.
//  2. `Keep going` IS NEVER THE WEAKER OPTION, and it arrives with a NAMED
//     DEFAULT — +28d skin, +14d GI — never a blank field. At day 56, 5–10% of
//     true food-responsive patients have not yet remitted, and Jordan's own
//     review said the thing that stops her tapping "done" is that keep-going
//     "already has the four weeks filled in, so I don't have to work out a date".
//  3. ACTION FIRST, VERDICT SECOND. The owner decides what happens next before
//     being asked how it went. A milestone that asks "how did it go?" first
//     turns an unanswered card into a stalled trial, and a stalled trial is the
//     one the vet report renders as still ongoing.
//
// ── AND THE SHEET LEADS WITH DATA, NOT THE QUESTION ──────────────────────────
// Ruled 2026-07-25 against the round-2 mock. The sheet opens with the symptom
// counts before vs during and only then asks "does that match what you've seen?".
// This does not breach §6.1 ("Culprit never scores the trial"): counts are facts,
// nothing here says the trial worked, and the verdict still belongs to the vet.
// The owner's read is captured because it is the one thing the counts cannot
// supply — how the animal actually seems — and it goes on the report attributed
// to them.
//
// ── PURE, AND IT STAYS PURE ──────────────────────────────────────────────────
// The DB read that produces `TrialOutcomeFacts` lives in
// `lib/dietTrialOutcomeFacts.ts`, not here. `dietTrialCard.ts` imports this
// module for the milestone's decision row, and that resolver's whole value is
// that it is testable without a database — pulling `./db` in through this file
// would have dragged expo-sqlite into the card's test graph. Same split as
// `dietTrialCard.ts` / `dietTrialFacts.ts`, for the same reason.
import type { TrialIndication } from './dietTrialSetup';

// ── The owner's read ─────────────────────────────────────────────────────────
//
// Declared HERE rather than in `dietTrialCard.ts` (which re-exports it) purely to
// keep the dependency one-way: the card imports this module for the milestone's
// decision row, so this module may not import the card.
export type TrialOutcome = 'improved' | 'no_change' | 'worse' | 'unsure';

// ════════════════════════════════════════════════════════════════════════════
// 1. The decision — three ways out of the milestone
// ════════════════════════════════════════════════════════════════════════════

export type TrialDecisionId = 'extend' | 'complete' | 'stopped_early';

/** `primary` draws as a filled button, `secondary` as a ghost.
 *
 *  THE WEIGHT RULE, and why it is a field rather than a styling detail. §4.3:
 *  "`Keep going` carries equal visual weight to `This trial is done`." The
 *  design lock draws it as filled-plus-two-ghosts — equal-OR-GREATER — and its
 *  own annotation flags the difference for the PM rather than assuming it:
 *  a three-ghost row makes "done" the path of least resistance by reading order
 *  alone, and this is the single moment the app can prevent a premature stop.
 *  Shipping the mock therefore satisfies §4.3's floor (never weaker) in the
 *  clinically safe direction. If the PM rules strict equality, change
 *  KEEP_GOING_EMPHASIS below to 'secondary' — that is the whole edit. */
export type TrialDecisionEmphasis = 'primary' | 'secondary';

const KEEP_GOING_EMPHASIS: TrialDecisionEmphasis = 'primary';

export interface TrialDecisionChoice {
  id: TrialDecisionId;
  label: string;
  emphasis: TrialDecisionEmphasis;
}

/** §4.3's named defaults. +28d for skin carries 8 weeks → 12 weeks in one tap;
 *  +14d for GI carries the assessment window toward ACVIM's ≥12-week continuation
 *  without pretending the app knows the vet's plan.
 *
 *  `other` and an absent indication take the SKIN value, and the asymmetry is the
 *  same one `defaultDurationDays` makes for the same reason: a too-long extension
 *  costs the owner two more weeks of a restrictive diet and is re-decidable at the
 *  next milestone; a too-short one puts this screen back in front of them sooner
 *  than the evidence warrants. */
export function extensionDays(indication: TrialIndication | null | undefined): number {
  return indication === 'gi' ? 14 : 28;
}

/** "4 more weeks". Weeks, not days: an owner plans a diet commitment in weeks,
 *  and both ruled extensions are whole weeks by construction. */
export function extensionPhrase(days: number): string {
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 more week' : `${weeks} more weeks`;
}

/**
 * The new `target_duration_days` for an extension — and the acceptance criterion
 * with an oracle: **`Keep going` cannot set a target at or below the current day.**
 *
 * It extends from whichever is FURTHER ALONG, the current target or the day the
 * owner is actually on. That distinction is the whole function: at the milestone
 * the two are equal, but the overrun state (6) is what renders while the owner
 * ignores the milestone, so by the time many owners tap this they are on day 61
 * of a 56-day trial. Extending the TARGET by 28 there would write 84 — a real
 * extension — but extending from day 61 writes 89, which is what "4 more weeks"
 * actually promised. Under-delivering on the one button that keeps a diet going
 * is the wrong direction to be sloppy in.
 *
 * The final clamp is a belt-and-braces guarantee of the criterion itself: whatever
 * the inputs, the returned target is strictly greater than the current day, so
 * this can never write a target that leaves the card in the state it was tapped
 * from.
 */
export function nextTargetDays(args: {
  currentTargetDays: number;
  dayCounter: number;
  extraDays: number;
}): number {
  // Every input is floored through a finite guard first. A NaN reaching the
  // arithmetic would propagate to a NaN target, and `extendTrial` would then
  // throw rather than write — which is safe, but it fails the ONE button whose
  // job is keeping a diet going. Degrading to "one more day" is a bad extension;
  // silently not extending at all is a worse one.
  const day = intOr(args.dayCounter, 1);
  const base = Math.max(intOr(args.currentTargetDays, 0), day);
  const extra = Math.max(1, intOr(args.extraDays, 1));
  return Math.max(base + extra, day + 1);
}

function intOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

/** The sentence under the milestone headline. Base clause on every indication;
 *  the GI clause is the reason this copy cannot be one string (§4.3).
 *
 *  The GI sentence says "around three months" rather than "12 weeks" because an
 *  owner reads a duration, not a protocol — and it says diets "are often
 *  continued", which is a statement about clinical practice, never an instruction
 *  Culprit is issuing about this pet. */
export function milestoneNote(indication: TrialIndication | null | undefined): string {
  const base = 'Your vet decides when the diet changes.';
  if (indication !== 'gi') return base;
  return (
    `${base} For gut problems, diets are often continued for around three months ` +
    'even when things look better early.'
  );
}

/** The three-way row, in reading order. `Keep going` is first for the same reason
 *  it is not weaker: reading order is itself weight. */
export function trialDecisionChoices(
  indication: TrialIndication | null | undefined,
): TrialDecisionChoice[] {
  return [
    {
      id: 'extend',
      label: `Keep going — ${extensionPhrase(extensionDays(indication))}`,
      emphasis: KEEP_GOING_EMPHASIS,
    },
    { id: 'complete', label: 'This trial is done', emphasis: 'secondary' },
    { id: 'stopped_early', label: 'Stopped early', emphasis: 'secondary' },
  ];
}

// ════════════════════════════════════════════════════════════════════════════
// 2. "Stopped early" — the structured reason
// ════════════════════════════════════════════════════════════════════════════
//
// A vet reading "stopped at day 19 — wouldn't eat it" prescribes differently than
// "stopped — cost". That is the entire justification for asking, and it is why the
// tokens are a closed set rather than free text: they reach a clinician verbatim.
//
// `refused` is LOAD-BEARING, not a label. §4.3: a refusal reason routes to the
// intake-decline HEALTH lane and is never rendered as a compliance outcome. Three
// things enforce that, and they are in three different files on purpose:
//   • here — a refusal carries a health-lane note and the flow never offers this
//     trial an outcome verdict (stopping early collects no verdict at all);
//   • `endActiveTrial` — structurally cannot attach an `outcome` to an abandoned
//     trial, so there is no code path that turns a refusal into a compliance read;
//   • `dietTrialCard.wasRefused` — a refused trial renders no adherence line on
//     any terminal state, because a diet that wasn't eaten cannot be read as one
//     that was followed.
//
// What this is NOT: it does not make `detectIntakeDecline` fire. That detector
// reads meal intake ratings and knows nothing about trials; wiring a trial row
// into it would be a new detector, with the adversarial pass that implies. The
// routing here is the copy register and the refusal to score — say so plainly
// rather than letting a future session assume a flag it never sees.

export type TrialStopReason =
  | 'refused'
  | 'cost'
  | 'too_hard'
  | 'vet_advised'
  | 'symptoms_resolved'
  | 'other';

export interface TrialStopReasonOption {
  value: TrialStopReason;
  label: string;
}

/** The pet's own name and pronoun, because "Too hard to keep them off everything
 *  else" is the sentence the owner actually lived. `pronouns` comes from the
 *  shipped `petPronouns`; the default is what that helper returns for an unknown
 *  sex, so a caller without the pet's sex to hand still gets grammatical copy
 *  rather than a second reason set. */
export function trialStopReasons(
  petName: string,
  pronouns: { object: string; possessive: string } = { object: 'them', possessive: 'their' },
): TrialStopReasonOption[] {
  const possessive =
    pronouns.possessive.charAt(0).toUpperCase() + pronouns.possessive.slice(1);
  return [
    { value: 'refused', label: `${petName} wouldn’t eat it` },
    { value: 'cost', label: 'Too expensive' },
    { value: 'too_hard', label: `Too hard to keep ${pronouns.object} off everything else` },
    { value: 'vet_advised', label: 'The vet said to stop' },
    { value: 'symptoms_resolved', label: `${possessive} symptoms cleared up` },
    { value: 'other', label: 'Something else' },
  ];
}

export const STOPPED_SHEET_TITLE = 'What got in the way?';

/** Normalises rather than absolves — no failure framing, and no "that's OK"
 *  either, which would be Culprit having an opinion about the owner's choice.
 *  §6.6: an abandoned trial is a legitimate clinical fact. */
export const STOPPED_SHEET_INTRO =
  'Trials get stopped early all the time. Which one it was changes what your vet ' +
  'suggests next.';

/**
 * The one line that renders under a selected reason, or null.
 *
 * Only two reasons get one, and both are there because the reason itself is a
 * clinical fact rather than a logistics one:
 *
 *  • `refused` — intake is not preference. A pet turning food down routes toward
 *    a health question, never toward "picky", and the standard clinical answer is
 *    a different hydrolysate rather than abandoning the plan (§6.5).
 *  • `symptoms_resolved` — this is the milestone's own hazard arriving through a
 *    side door. An owner stopping BECAUSE things improved is stopping a diet that
 *    may be working, which on the GI indication is exactly the ACVIM ≥12-week
 *    harm. The line points at the vet and asserts nothing about this pet.
 *
 * The other four are logistics. Culprit does not comment on an owner's money, or
 * on how hard their household is to control.
 */
export function stopReasonNote(reason: TrialStopReason, petName: string): string | null {
  if (reason === 'refused') {
    // Named, not generic: "a pet turning food down" is the register that makes an
    // owner skim past it. It is also the sentence that has to carry `intake is not
    // preference` — a health question FIRST, never softened toward picky.
    return (
      `Worth telling your vet. ${petName} turning food down is a health question ` +
      'before it’s a diet question, and it usually means a different diet rather ' +
      'than a different plan.'
    );
  }
  if (reason === 'symptoms_resolved') {
    return (
      'Worth checking with your vet before the diet changes — improvement is often ' +
      'the point at which they want a diet continued rather than stopped.'
    );
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. The outcome sheet — the data leads, the owner's read follows
// ════════════════════════════════════════════════════════════════════════════

export interface TrialSymptomDelta {
  symptomType: string;
  /** Through the app's single `symptomLabel`, so this can't drift from History. */
  label: string;
  before: number;
  during: number;
}

/** Meal-logging days over one stretch. See `densityLine` for why it is meals. */
export interface TrialMealDensity {
  daysLogged: number;
  days: number;
}

export interface TrialOutcomeFacts {
  /** Inclusive local-day span of the trial as actually run (start .. today). */
  duringDays: number;
  /** The equal-length stretch immediately before it. */
  beforeDays: number;
  /**
   * Whether ANY event of any type was logged in the before stretch.
   *
   * This is §5.2's S3 rule applied one surface over: a pre-adoption span is NAMED
   * AS UNTRACKED, never counted as zero. Rendering "14 before · 3 during" when the
   * owner had not installed the app before the trial started would be a fabricated
   * comparison on the screen where an owner decides what the trial meant.
   */
  beforeTracked: boolean;
  /**
   * Days in the before-stretch carrying ANY logged event — the stretch's
   * OBSERVABILITY as a count rather than a yes/no.
   *
   * `beforeTracked` alone implements §5.2's S3 rule only for the all-or-nothing
   * case, and `adversarial-reviewer` broke the middle: an owner who installs
   * Culprit *because* of a flare, logs scratching hard for three days, and starts
   * a vet-prescribed trial the following week has `beforeTracked === true` over a
   * 56-day stretch of which four days are observable — and those four are the
   * attention peak AND the symptom peak. The sheet then rendered
   * `Itch/Scratch: 11 before · 3 during` with nothing saying the 11 came from four
   * days: an attention spike plus regression to the mean, drawn as a 4×
   * improvement, above a button that ends the trial. The mirror case alarms
   * instead — one logged meal the day before, then diligent logging, renders
   * `0 before · 9 during` and reads as the diet making the dog worse.
   *
   * Measure and disclose rather than gate (the same instrument C5 uses, and the
   * same one §7 uses for the symptom trend): the count is rendered, so a reader
   * can see how much of the stretch the comparison is actually built on. No floor
   * is invented here — §5.2 deliberately left the coverage floor's number undefined
   * and PR 5 owns it.
   */
  beforeLoggedDays: number;
  /** The same count for the trial stretch, so the two are comparable. */
  duringLoggedDays: number;
  /** Every symptom type with activity in either stretch, most-during first. */
  symptoms: TrialSymptomDelta[];
  meals: { before: TrialMealDensity; during: TrialMealDensity };
}

export const OUTCOME_OPTIONS: { value: TrialOutcome; label: string }[] = [
  { value: 'improved', label: 'Better' },
  { value: 'no_change', label: 'No change' },
  { value: 'worse', label: 'Worse' },
  { value: 'unsure', label: 'Not sure' },
];

export const OUTCOME_QUESTION = 'Does that match what you’ve seen?';

/** §6.1 in one owner-facing sentence — the thing v0.9 never wrote down. It says
 *  who decides, and it says where the owner's answer goes and in whose name. */
export const OUTCOME_QUESTION_NOTE =
  'Culprit reports what happened; your vet decides what it means. Your read goes ' +
  'on the report next to these counts.';

/** The same question with NO REFERENT TO THE COUNTS, for the state where a live
 *  intake-decline flag has replaced them.
 *
 *  Both default strings point at content the decline branch deliberately removes:
 *  "Does *that* match" — match what? — and "next to *these* counts", of which
 *  there are none on screen. The suppression is right and the two sentences that
 *  survived it were pointing at nothing. Caught by `pm-feature-review`. */
export const OUTCOME_QUESTION_NO_COUNTS = 'How has it seemed to you?';

export const OUTCOME_QUESTION_NOTE_NO_COUNTS =
  'Culprit reports what happened; your vet decides what it means. Your read goes ' +
  'on the report in your name.';

export const OUTCOME_NOTES_PLACEHOLDER = 'Anything you want your vet to know (optional)';

export interface TrialOutcomeSheetModel {
  title: string;
  /**
   * The indication-keyed continuation sentence, carried ONTO the outcome sheet.
   *
   * §4.3's "never reads as permission to stop" is a property of the FLOW, not of
   * one card. PR 6's first cut put the ACVIM continuation sentence on the decision
   * point only, so a GI owner who tapped `This trial is done` saw it once and then
   * read two screens — this sheet, then `Diet trial · finished` — with no
   * continuation statement anywhere. The screens an owner reads WHILE and AFTER
   * ending a 28-day GI trial are exactly the ones that most need it. Caught by
   * `adversarial-reviewer`; `pm-feature-review` reached it from the owner's side,
   * noting the guardrail was wired to the least-travelled path.
   */
  continuationNote: string;
  /** The comparison's own scope, stated once rather than repeated per row. */
  comparisonLine: string;
  /** One per symptom type, or a single record-form line when there are none. */
  factLines: string[];
  /** C5. Never null — see `densityLine`. */
  densityLine: string;
  question: string;
  questionNote: string;
  options: typeof OUTCOME_OPTIONS;
  notesPlaceholder: string;
  saveLabel: string;
  /**
   * A live intake-decline flag, which REPLACES the counts (§5.2's composition).
   *
   * The round-1b lesson, in mirror image: §5.2's rule was drawn as a live-flag
   * replacement on the ACTIVE card and so never reached the terminal states, and
   * the first cut of `dietTrialCard.ts` then repeated the mistake the other way
   * round. This sheet is a terminal surface too. A pet that has stopped eating
   * outranks a symptom tally about the last eight weeks, whatever the tally says.
   */
  declineLead: string | null;
  /**
   * The sentence that names the priority — and its absence was the sharpest
   * finding against PR 6's first cut.
   *
   * The card's `pushDeclineLines` says *"A cat that stops eating needs a call
   * today, whatever the trial is doing."* The sheet said only that Culprit was not
   * showing the numbers — so the strongest safety sentence in the whole feature
   * was missing from the one terminal screen that ENDS the intervention, on the
   * one patient it matters most for. Species-aware for the same reason the card's
   * is: the 48h hepatic-lipidosis window is feline, and a dog line must be firm
   * without borrowing a feline urgency.
   */
  declineNote: string | null;
}

/**
 * Is the before-stretch too thinly observed for its calendar length to describe
 * it? Half its days, which is a DISCLOSURE trigger and not a coverage floor —
 * §5.2 leaves the floor's number to PR 5, and nothing here gates a claim on this.
 * Below it the sheet says how many days it can actually see; above it the stretch
 * is described by its length as before. Either way both counts still render.
 */
function isSparseBefore(facts: TrialOutcomeFacts): boolean {
  return facts.beforeLoggedDays * 2 < facts.beforeDays;
}

/** "8 weeks" once there are whole weeks to speak of, else "30 days". */
function spanPhrase(days: number): string {
  if (days >= 14 && days % 7 === 0) return `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * C5's disclosure, owner-facing — and the denominator was settled the hard way.
 *
 * DO NOT RE-DERIVE THIS. `generate-report`'s `TrialLoggingDensity` records both
 * failed denominators, each found by a cold read on a rendered artifact:
 *   • ALL events — habitual, app-prompted meal logging saturates it, so a 12 → 1
 *     symptom collapse rendered an affirmative "logging held up" and the report
 *     certified the exact artefact C5 exists to disclose;
 *   • NON-MEAL events — on a pet whose only discretionary logs ARE its symptoms,
 *     the series IS the symptom series, so the line becomes a tautology that
 *     revokes the trial's own result.
 * Only the MEAL series survives, and it survives WITH NO VERDICT: it answers
 * "did the owner keep logging?" without circling, because it is independent of
 * the symptom count by construction.
 *
 * TWO DELIBERATE DIFFERENCES FROM THE REPORT'S VERSION, both of which follow from
 * this being the owner's screen rather than the vet's:
 *
 *  • BEFORE vs DURING, not first-half vs last-half. The report renders density
 *    against within-window symptom charts; this sheet's counts are a before/during
 *    comparison, so the density has to cover the same two stretches or it is not
 *    checking the same bias.
 *  • NO 14-DAY FLOOR. The report goes silent under a fortnight because a weak
 *    claim would discredit a record that is fine. There is no claim here to be
 *    weak — §4.3 makes this line MANDATORY on this sheet, and two ratios with no
 *    verdict attached cannot be made false by a short window.
 *
 * The mock's line ("You logged about as often in both stretches, so the drop isn't
 * just less logging") is deliberately NOT shipped: it is the adjudicating form,
 * and an owner reading a flattering number is exactly the person who stops a diet
 * early.
 */
export function densityLine(facts: TrialOutcomeFacts, petName: string): string {
  const { before, during } = facts.meals;
  const tail =
    `That’s how much got logged, not how ${petName} was — read it alongside the ` +
    'counts above. Culprit doesn’t judge whether a change in one explains a ' +
    'change in the other.';

  // THE BEFORE-HALF IS DROPPED WHEN THERE IS NO BEFORE-STRETCH TO REPORT ON, and
  // this branch is a bug fix, not a refinement. Without it the sheet contradicted
  // itself in two adjacent lines: "Nothing was logged in the 8 weeks before the
  // trial started, so there's nothing to compare these with" — and then "Meals
  // logged: 0 of 56 days before, 52 of 56 during." That 0 is precisely the
  // fabricated comparison `beforeTracked` exists to prevent, rendered by the one
  // line that was not consulting it. (The guard test missed it too: it scanned
  // `factLines` and not this string. Caught by `pm-feature-review`.)
  // "DAYS YOU LOGGED ANY FOOD", not "Meals logged".
  //
  // The card's coverage line reads "Meals logged on 41 of 56 days" and EXCLUDES
  // treats (§5.1 — 15.7% of live covered days are treat-only, so a coverage floor
  // would otherwise be clearable on treat data alone). This series INCLUDES them,
  // deliberately, because it measures whether the owner kept logging at all. Two
  // metrics with two denominators is correct; two metrics with the same NAME two
  // taps apart on the decision path is not — and the sheet's number is
  // systematically the larger of the two, so the collision reads as the record
  // improving between screens. Caught by `adversarial-reviewer`.
  if (!facts.beforeTracked) {
    return `Days you logged any food during the trial: ${during.daysLogged} of ${during.days}. ${tail}`;
  }

  return (
    `Days you logged any food: ${before.daysLogged} of ${before.days} before, ` +
    `${during.daysLogged} of ${during.days} during. ${tail}`
  );
}

export function buildOutcomeSheet(args: {
  facts: TrialOutcomeFacts;
  petName: string;
  species?: 'dog' | 'cat' | 'other';
  indication?: TrialIndication | null;
  intakeDeclineHeadline?: string | null;
}): TrialOutcomeSheetModel {
  const { facts, petName } = args;

  const comparisonLine = !facts.beforeTracked
    ? // Named as untracked, never counted as zero. The owner is told plainly that
      // the comparison cannot be made, rather than shown a number that implies it
      // was made and came out well.
      `Nothing was logged in the ${spanPhrase(facts.beforeDays)} before the trial ` +
      'started, so there’s nothing to compare these with.'
    : isSparseBefore(facts)
      ? // The middle case, and the one that flatters. The stretch is named by the
        // days it can actually see rather than by its calendar length, so a
        // four-day install-during-a-flare window never renders as "the 8 weeks
        // before it started". Disclosure, not a floor.
        `Compared with the ${spanPhrase(facts.beforeDays)} before it started — though ` +
        `only ${facts.beforeLoggedDays} of those ${facts.beforeDays} days have anything ` +
        'logged, so there’s much less to compare with than it looks.'
      : `Compared with the ${spanPhrase(facts.beforeDays)} before it started.`;

  const factLines =
    facts.symptoms.length === 0
      ? // RECORD-FORM, deliberately. "No symptoms" would be a claim about the
        // world; this is a claim about the log, which is all Culprit can see.
        ['No symptoms are on the record for either stretch.']
      : facts.symptoms.map((s) =>
          facts.beforeTracked
            ? `${s.label}: ${s.before} before · ${s.during} during.`
            : `${s.label}: ${s.during} during the trial.`,
        );

  const declineLead = args.intakeDeclineHeadline ?? null;

  return {
    // With the counts suppressed there is no span being reported on, so the
    // title stops promising one.
    title: declineLead
      ? 'Before you close this trial'
      : `What changed over the ${spanPhrase(facts.duringDays)}`,
    continuationNote: milestoneNote(args.indication),
    comparisonLine,
    factLines,
    densityLine: densityLine(facts, petName),
    // The referent-free variants when the decline branch has removed the counts
    // these two sentences otherwise point at.
    question: declineLead ? OUTCOME_QUESTION_NO_COUNTS : OUTCOME_QUESTION,
    questionNote: declineLead ? OUTCOME_QUESTION_NOTE_NO_COUNTS : OUTCOME_QUESTION_NOTE,
    options: OUTCOME_OPTIONS,
    notesPlaceholder: OUTCOME_NOTES_PLACEHOLDER,
    saveLabel: 'Save',
    declineLead,
    // Verbatim in register with `dietTrialCard.pushDeclineLines`, because it is
    // the same fact told to the same owner ten seconds later.
    declineNote: declineLead
      ? (args.species === 'cat'
          ? 'A cat that stops eating needs a call today, whatever the trial is doing.'
          : `A pet that goes off their food needs a call, whatever the trial is doing.`) +
        ' Culprit isn’t showing the trial’s numbers while this is going on.'
      : null,
  };
}
