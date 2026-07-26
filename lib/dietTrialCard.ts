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
import { localDayIndexOf } from './utils';

const MS_PER_DAY = 86_400_000;

// ── Inputs ───────────────────────────────────────────────────────────────────

export type TrialStatus = 'active' | 'completed' | 'abandoned';

export type TrialOutcome = 'improved' | 'no_change' | 'worse' | 'unsure';

export interface TrialCardTrial {
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
}

/** §5.1 coverage: distinct local days with ≥1 logged NON-TREAT feeding, over the
 *  trial's own overlap range. `daysElapsed` is the day counter, so the two sides
 *  of the ratio are on one clock (B-421). */
export interface TrialCoverageFacts {
  daysLogged: number;
  daysElapsed: number;
}

/** §5.1 exposures: in-window feedings classified by §5.3, with their OWN feeding
 *  denominator. Supplied by PR 5's `computeTrialFacts`. Still NULLABLE, and the
 *  null is load-bearing rather than vestigial: `lib/dietTrialFacts` withholds
 *  these numbers whenever the allowed set has not fully hydrated, or whenever the
 *  predicate computed a reason the affirmative "all N matched" sentence would be
 *  false (`mayClaimAllMatched`). Silence, never an all-clear. */
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
 *  handler for the id (see `DietTrialCard`). PR 4 ships the card before PR 3's
 *  start modal and PR 6's completion sheet exist, and a button that goes nowhere
 *  is worse than no button. */
export type TrialCardActionId =
  | 'start_trial'      // PR 3
  | 'milestone'        // PR 6
  | 'open_report'      // shipped (/report)
  | 'view_exposures';  // PR 5's list screen

export interface TrialCardModel {
  state: TrialCardState;
  /** "Diet trial" | "Diet trial · finished" | "Diet trial · stopped early". */
  kicker: string;
  foodLabel: string | null;
  /** "Day 23 of 56" | "Day 61 — 5 days past the window you set" | a date range. */
  dayLine: string | null;
  /** "Ends 27 August" | "Window ended 27 August". */
  windowLine: string | null;
  /** DAY progress in [0,1], or null when a bar would carry no information.
   *  R2: this is `getDietTrialProgress().fraction` and NOTHING else. */
  progressFraction: number | null;
  lines: TrialCardLine[];
  action: { id: TrialCardActionId; label: string } | null;
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

/** §5.2: "the exposure count is a floor, never a total." Said ON the claim.
 *
 *  IT IS SAID ON THE CLEAN CLAIM TOO (added at PR 5, after the adversarial pass).
 *  The first cut appended this only when `offDiet > 0`, so §5.2's floor rule was
 *  stated on every card EXCEPT the one where it is load-bearing: "all 84 matched
 *  the trial diet or a permitted food" is precisely the sentence a reader can
 *  mistake for a total, and it was the only one carrying no qualifier. */
function floorSuffix(offDiet: number): string {
  if (offDiet <= 0) return ' That’s what’s been logged, not everything that happened.';
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
      windowLine: null,
      progressFraction: null,
      lines: [],
      action: null,
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
    action: { id: 'start_trial', label: 'Start a diet trial' },
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
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      action: null,
    };
  }

  // ── State 5 — the milestone. Day counter has REACHED the target exactly.
  // Action-first; the verdict is asked only after the owner decides what happens
  // next (§4.3). It must never read as permission to stop: on the GI default,
  // ACVIM 2026 says continue ≥12 weeks, so a day-28 "trial complete" would tell
  // an owner to stop a diet their vet wanted continued for three months.
  if (progress.targetDays > 0 && overrunDays === 0) {
    return {
      ...base,
      state: 'milestone',
      dayLine: `Day ${progress.dayCounter} of ${progress.targetDays} — the window you set is done.`,
      windowLine: null,
      lines: [{ role: 'note', text: 'Your vet decides when the diet changes.' }],
      action: { id: 'milestone', label: 'Tell Culprit what’s next' },
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
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      action: null,
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
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      action: null,
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
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      action: null,
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
      windowLine: windowLineFor(endIndex, overrunDays),
      lines,
      action: { id: 'milestone', label: 'Tell Culprit what’s next' },
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
    windowLine: windowLineFor(endIndex, overrunDays),
    lines,
    action:
      state === 'exposures' && (input.exposures?.offDiet ?? 0) > 0
        ? { id: 'view_exposures', label: 'Outside the trial diet' }
        : null,
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
      text: BLIND_SPOT_QUALIFIER + floorSuffix(ex.offDiet),
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
    windowLine: null,
    // A finished window has no progress left to encode; a full bar here would be
    // decoration, and decoration on this card is what R2 exists to stop.
    progressFraction: null,
    lines,
    action: { id: 'open_report', label: 'Open vet report' },
    standingNote: input.standingNote ?? null,
    standingMeta: input.standingMeta ?? null,
  };
}

/** PR 3's stored tokens → the owner-facing phrase. The fallback renders an
 *  unrecognised value verbatim so a future reason is never a silent blank. */
function stoppedBecauseLine(petName: string, trial: TrialCardTrial): string {
  switch (trial.stoppedReason) {
    case 'refused': return `Stopped because ${petName} wouldn’t eat it.`;
    case 'vet_advised': return 'Stopped because the vet said to change diets.';
    case 'other': return 'Stopped early.';
    default: return `Stopped because ${trial.stoppedReason}.`;
  }
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
      windowLine: null,
      progressFraction: null,
      lines,
      action: null,
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

  return {
    state: 'abandoned',
    // §6.6 — an abandoned trial is a legitimate clinical fact, never a failure
    // state, so the kicker states what happened and judges none of it.
    kicker: 'Diet trial · stopped early',
    foodLabel: trial.foodLabel ?? null,
    dayLine: range,
    windowLine: null,
    progressFraction: null,
    lines,
    action: { id: 'start_trial', label: 'Start a new trial' },
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
