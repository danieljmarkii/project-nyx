// The diet-trial WINDOW guard — PR 0 of the trial-extension track (CUL-1036).
//
// docs/nyx-trial-extension-requirements.md §7 (PR 0), §5.2, §5.4, §5.6 ·
// track home CUL-156.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
// This is the one PR of the track that changes no behaviour. Everything below is
// a statement about what the app does TODAY, written before any repair touches it,
// because the track is about to move a number the vet report reads and §5.4 is
// what happens when that is assumed rather than executed.
//
// It holds two different kinds of test and they must not be confused:
//
//   • THREE GREEN GUARDS (G1–G3) — true today and required to STAY true until the
//     mid-trial door ships. Each is proven by mutation, not by reading (C-18); the
//     mutation that reds each one is named in its own block.
//   • TWO EXPECTED FAILURES — hazards the record now carries as executable tests.
//     They are `test.failing`, never `skip`: the body states the REQUIREMENT, jest
//     records that it does not hold today, and the suite goes RED the moment the
//     behaviour is repaired — which is the whole point. A repair that does not
//     actually repair cannot land quietly, and neither can one that lands without
//     promoting the marker. (§5.2's other half is a Deno test and lives in
//     `supabase/functions/generate-report/render.test.ts`, beside the B-532 block
//     it extends — that render is server-side and jest does not run it.)
//
// ── FIXTURE DISCIPLINE (C-35) ───────────────────────────────────────────────────
// Every fixture here is one the real caller could hand over. The adversarial pass
// that produced §5.4 seeded a row 70 days back to disarm a guard — a row the 56-day
// read cannot produce — and a fixture shaped unlike production is green over a shape
// production never creates. So: day counters come from `trialDayCounter`'s real
// range, extension sizes are read from the shipped `extensionDays()` rather than
// restated, and each boundary is derived from the shipped constant it depends on.
//
// `lib/analytics` (where `getDietTrialProgress` lives) pulls `lib/sync` →
// `lib/supabase` and its fail-fast env check. The resolvers under test are pure and
// touch neither, so the edge of the graph is stubbed exactly as
// `lib/dietTrialCard.test.ts` does.
jest.mock('../lib/feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { getDietTrialProgress } from '../lib/analytics';
import {
  COVERAGE_FLOOR,
  COVERAGE_SUPPORTS,
  MIN_INTERPRETABLE_DAYS,
  computeTrialFacts,
  mayClaimAllMatched,
  mayStateRecordClean,
  type AllowedFood,
  type TrialFacts,
  type TrialFeeding,
  type TrialSpec,
} from '../lib/dietTrial';
import {
  planTrialCard,
  resolveTrialCard,
  type TrialCardActionId,
  type TrialCardInput,
  type TrialCardState,
} from '../lib/dietTrialCard';
import { extensionDays, nextTargetDays } from '../lib/dietTrialCompletion';
import type { TrialIndication } from '../lib/dietTrialSetup';

// ── Shared fixture helpers ──────────────────────────────────────────────────────

/** Local noon on a calendar date. NEVER a UTC literal and never midnight: the day
 *  boundary is LOCAL midnight (B-421 / C-29), so a fixture built from UTC asserts
 *  the runner's zone as much as the behaviour and the non-UTC CI leg reds on it. */
function localNoon(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

const MS_PER_DAY = 86_400_000;

/** Local noon on trial day N, counting from a start date, day 1 inclusive.
 *  Built by adding whole days to a local-noon instant — noon is 12h clear of both
 *  boundaries, so this survives a DST shift in either direction. */
function trialDay(start: readonly [number, number, number], n: number): number {
  return localNoon(start[0], start[1], start[2]) + (n - 1) * MS_PER_DAY;
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

// ════════════════════════════════════════════════════════════════════════════════
// G1 — there is NO mid-trial route to `trial_extend`, in any state
// ════════════════════════════════════════════════════════════════════════════════
//
// WHAT THE RULE IS. Before its target end date, a running trial's window cannot be
// changed from any surface. That is the failure CUL-156 exists to repair, and until
// the door ships it is the app's actual behaviour — so it is pinned here, at the
// resolver, and the door's PR will have to come through this file to change it.
//
// WHY THE RESOLVER AND NOT A SCREEN (C-41). The rule is about the model. A screen
// test renders one state and is green over every state it never rendered, which is
// exactly the shape of the two tests that went green over nothing on CUL-904. The
// walk below is keyed by `TrialCardState` as a `Record`, so ADDING a state to the
// union fails `tsc --noEmit` rather than silently escaping the guard.
//
// THE TWO HALVES, and they are separable:
//   (a) `stateFor` (lib/dietTrialCard.ts:1169) returns `milestone` only at
//       `overrunDays === 0` and `overrun` only above it, so neither state — and so
//       neither state's actions — is REACHABLE while the trial is mid-window.
//   (b) the replacement cards that keep the decision reachable at the window
//       (`intake_decline` :1575, `trial_refusal` :1618) each gate that action on
//       `overrunDays >= 0`.
//
// ⚠️ ONE CORRECTION TO THE ISSUE'S DESCRIPTION, verified at file:line rather than
// taken on trust. CUL-1036 names three routes "each gated on `overrunDays >= 0`"
// at :1576, :1619 and :1789. Only the first two carry that expression. The third
// (:1789) sits inside `if (state === 'overrun')` and is gated by the STATE, which
// `stateFor` reaches only at `overrunDays > 0` — the same bound by a different
// mechanism. The distinction matters for what a mutation proves: half (a) is what
// covers :1789, so a guard that only asserted half (b) would leave it unguarded.

/** The two states the resolver CANNOT return mid-trial, with the reason. These are
 *  not skips — each is asserted structurally in `G1 — half (a)` below. */
interface UnreachableMidTrial {
  readonly unreachableMidTrial: string;
}

function unreachable(why: string): UnreachableMidTrial {
  return { unreachableMidTrial: why };
}

/** A 56-day dog trial started 3 July, read on day 23 — mid-window by 33 days. */
const MID_TRIAL_START = [2026, 7, 3] as const;
const MID_TRIAL_TARGET = 56;
const MID_TRIAL_DAY = 23;

function midTrialInput(over: Partial<TrialCardInput> = {}): TrialCardInput {
  return {
    trial: {
      status: 'active',
      startedAt: '2026-07-03',
      targetDurationDays: MID_TRIAL_TARGET,
      foodLabel: 'Zignature Kangaroo Formula',
    },
    nowMs: trialDay(MID_TRIAL_START, MID_TRIAL_DAY),
    petName: 'Biscuit',
    species: 'dog',
    coverage: { daysLogged: 22, daysElapsed: MID_TRIAL_DAY },
    exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 0 },
    ...over,
  };
}

/** Keyed by `TrialCardState`: a new member of the union fails the type check here
 *  rather than escaping the walk. That is the point of the `Record` — an
 *  enumeration a future state can be added beside is not an enumeration. */
const MID_TRIAL_BY_STATE: Record<TrialCardState, TrialCardInput | UnreachableMidTrial> = {
  no_trial: midTrialInput({ trial: null }),
  day_one: midTrialInput({
    nowMs: trialDay(MID_TRIAL_START, 1),
    coverage: { daysLogged: 0, daysElapsed: 1 },
    exposures: null,
  }),
  clean: midTrialInput(),
  exposures: midTrialInput({
    exposures: {
      mayStateRecordClean: true,
      totalFeedings: 68,
      offDiet: 3,
      mostRecent: { label: 'Zuke’s Mini Naturals (chicken)', when: 'Yesterday, 6:40 pm' },
    },
  }),
  below_floor: midTrialInput({
    belowCoverageFloor: true,
    coverage: { daysLogged: 6, daysElapsed: MID_TRIAL_DAY },
    exposures: { mayStateRecordClean: true, totalFeedings: 9, offDiet: 0 },
  }),
  free_fed: midTrialInput({ freeFed: { loggedFeedings: 22 } }),
  intake_decline: midTrialInput({
    species: 'cat',
    petName: 'Mochi',
    intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
  }),
  trial_refusal: midTrialInput({
    species: 'cat',
    petName: 'Mochi',
    trialDietRefusal: { days: 11, ratedFeedings: 22, refusedFeedings: 19, population: 'trial_diet' },
  }),
  // The terminal states at a day counter BELOW the target — which is not a
  // contradiction and is in fact §5.2's own shape: a trial stopped at day 28 of 56
  // is a completed row read mid-window. The window is closed, so no extension
  // route may appear here either.
  completed: midTrialInput({
    trial: {
      status: 'completed',
      startedAt: '2026-07-03',
      endedAt: '2026-07-30',
      targetDurationDays: MID_TRIAL_TARGET,
      foodLabel: 'Zignature Kangaroo Formula',
    },
    nowMs: trialDay(MID_TRIAL_START, 28),
  }),
  abandoned: midTrialInput({
    trial: {
      status: 'abandoned',
      startedAt: '2026-07-03',
      endedAt: '2026-07-30',
      targetDurationDays: MID_TRIAL_TARGET,
      foodLabel: 'Zignature Kangaroo Formula',
      stoppedReason: 'cost',
    },
    nowMs: trialDay(MID_TRIAL_START, 28),
  }),
  milestone: unreachable('stateFor returns it only at overrunDays === 0 (:1169)'),
  overrun: unreachable('stateFor returns it only at overrunDays > 0 (:1170)'),
};

/** Every route from the card into the extension decision. `trial_extend` is the
 *  write itself; `milestone` opens the sheet that offers it, so a guard naming only
 *  the first would be green over the three surfaces that actually carry the route
 *  (§0.1: "every other route to the decision sheet"). */
const EXTENSION_ROUTES: readonly TrialCardActionId[] = ['trial_extend', 'milestone'];

function overrunDaysOf(input: TrialCardInput): number | null {
  if (!input.trial) return null;
  const progress = getDietTrialProgress(
    { startedAt: input.trial.startedAt, targetDurationDays: input.trial.targetDurationDays },
    input.nowMs,
  );
  return progress ? progress.dayCounter - progress.targetDays : null;
}

describe('G1 — no mid-trial route to trial_extend, in any state (CUL-156 §0.1)', () => {
  const entries = Object.entries(MID_TRIAL_BY_STATE) as Array<
    [TrialCardState, TrialCardInput | UnreachableMidTrial]
  >;
  const reachable = entries.filter(
    (e): e is [TrialCardState, TrialCardInput] => !('unreachableMidTrial' in e[1]),
  );

  // ── Non-vacuity floor, first (C-36) ──────────────────────────────────────────
  // A walk is only worth its assertions if each fixture reaches the state it is
  // filed under and is genuinely mid-window. Without this, a fixture that quietly
  // resolved to `clean` would satisfy every assertion below while measuring one
  // state eleven times.
  it.each(reachable)('%s — the fixture reaches the state it is filed under', (state, input) => {
    expect(planTrialCard(input).state).toBe(state);
  });

  it.each(reachable)('%s — the fixture is genuinely mid-window', (state, input) => {
    const overrun = overrunDaysOf(input);
    if (state === 'no_trial') {
      // No trial, no window: the state is in the walk because the resolver can
      // return it, and it must carry no extension route either.
      expect(overrun).toBeNull();
      return;
    }
    expect(overrun).not.toBeNull();
    expect(overrun as number).toBeLessThan(0);
  });

  // ── The rule ────────────────────────────────────────────────────────────────
  it.each(reachable)('%s — declares no route into the extension decision', (_state, input) => {
    const ids = resolveTrialCard(input).actions.map((a) => a.id);
    for (const route of EXTENSION_ROUTES) expect(ids).not.toContain(route);
  });

  // ── Half (a): the two states are structurally unreachable mid-window ─────────
  //
  // Driven across the whole window rather than at one day, because the claim is
  // about a boundary and a single sample cannot see a boundary move. The sweep
  // runs day 1 → target + 5 and asserts the switch lands on EXACTLY the target.
  it('half (a) — milestone appears at exactly the target, overrun only above it', () => {
    const seen: Array<{ day: number; state: TrialCardState }> = [];
    for (let day = 1; day <= MID_TRIAL_TARGET + 5; day += 1) {
      seen.push({
        day,
        state: planTrialCard(midTrialInput({ nowMs: trialDay(MID_TRIAL_START, day) })).state,
      });
    }
    const milestoneDays = seen.filter((s) => s.state === 'milestone').map((s) => s.day);
    const overrunDays = seen.filter((s) => s.state === 'overrun').map((s) => s.day);

    expect(milestoneDays).toEqual([MID_TRIAL_TARGET]);
    expect(overrunDays).toEqual([1, 2, 3, 4, 5].map((n) => MID_TRIAL_TARGET + n));
    // And the sweep really covered the window — a loop that ran zero times would
    // satisfy both assertions above with two empty arrays.
    expect(seen).toHaveLength(MID_TRIAL_TARGET + 5);
    expect(seen.filter((s) => s.day < MID_TRIAL_TARGET).every((s) => s.state !== 'milestone'))
      .toBe(true);
  });

  it('half (a) — every state marked unreachable mid-window names its reason', () => {
    const marked = entries.filter(
      (e): e is [TrialCardState, UnreachableMidTrial] => 'unreachableMidTrial' in e[1],
    );
    expect(marked.map(([s]) => s).sort()).toEqual(['milestone', 'overrun']);
    for (const [, why] of marked) expect(why.unreachableMidTrial).not.toHaveLength(0);
  });

  // ── Half (b): the two replacement cards gate their route on the window ───────
  //
  // Asserted as a PAIR — withheld mid-window AND offered at it — because "no button
  // here" is also what a broken fixture produces. Only the second half proves the
  // first one measured a gate rather than an accident.
  it.each([
    ['intake_decline', MID_TRIAL_BY_STATE.intake_decline as TrialCardInput],
    ['trial_refusal', MID_TRIAL_BY_STATE.trial_refusal as TrialCardInput],
  ])('half (b) — %s withholds the decision mid-window and offers it at the window', (_s, input) => {
    const midWindow = resolveTrialCard(input).actions.map((a) => a.id);
    expect(midWindow).not.toContain('milestone');

    const atWindow = resolveTrialCard({
      ...input,
      nowMs: trialDay(MID_TRIAL_START, MID_TRIAL_TARGET),
    }).actions.map((a) => a.id);
    expect(atWindow).toContain('milestone');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// G2 — `nextTargetDays`' clamp, as a PROPERTY over the caller's real input space
// ════════════════════════════════════════════════════════════════════════════════
//
// THE ACCEPTANCE CRITERION, from the function's own docstring: "whatever the
// inputs, the returned target is strictly greater than the current day, so this can
// never write a target that leaves the card in the state it was tapped from."
//
// §5.6 recorded 1,280 degenerate combinations with zero violations. CUL-1036 asks
// for that as a property rather than an example list, and the existing example list
// (`lib/dietTrialCompletion.test.ts`, six cases) stays where it is — it names the
// two worked cases in prose, which a sweep cannot.
//
// TWO CLAIMS, DELIBERATELY NOT ONE (C-34). The strict inequality is stated over the
// inputs the CALLER can actually produce. The non-finite degrade is a separate,
// named case, because `x > NaN` is vacuously false — folding it into the property
// would force the test to restate `intOr`'s fallback, and a test that re-derives the
// production rule to check it is a tautology with fixtures.
//
// C-35: the ranges below are the caller's, read from the shipped code rather than
// invented. `handleExtendTrial` (app/(tabs)/profile.tsx:431) passes
// `progress.dayCounter` — `lib/utils.trialDayCounter` is `Math.max(1, …)`, so it is
// an integer >= 1 and never zero, negative or fractional — alongside the row's
// `target_duration_days` and `extensionDays(indication)`.
//
// ⚠️ A BLIND SPOT, STATED BECAUSE AN UNDOCUMENTED ONE READS AS COVERAGE (C-38).
// The criterion is implemented TWICE and the two are mutually redundant: `base`
// takes `Math.max(currentTargetDays, day)` and the return takes
// `Math.max(base + extra, day + 1)`. Since `extra >= 1`, EITHER alone is sufficient
// — so NO SINGLE-LINE mutation of `nextTargetDays` can red the property below, and
// a mutation proof that stopped at one line would report coverage this guard does
// not have. Measured, not reasoned: removing the final clamp alone leaves all 47
// tests green; removing `base`'s max alone leaves the property green (it reds only
// the §5.4 fixture's derived tap, which is a different assertion). What reds it is
// removing BOTH, or removing `base`'s max together with `day + 1` → `day` — the
// off-by-one that turns "strictly greater" into "at or equal", which is precisely
// what the criterion forbids. If a future refactor collapses these two into one,
// that one line becomes load-bearing and a single-line mutation starts working.

const TRIAL_INDICATIONS: readonly (TrialIndication | null | undefined)[] = [
  'skin',
  'gi',
  'other',
  null,
  undefined,
];

describe('G2 — nextTargetDays never lands at or below the current day (§5.6)', () => {
  // Read from the shipped function, never restated: if the ruled GI default moves
  // (D5 / CUL-367), the sweep moves with it instead of silently testing 14 forever.
  const EXTRA_DAYS = [...new Set(TRIAL_INDICATIONS.map((i) => extensionDays(i)))];

  // The caller's day counters: `trialDayCounter`'s floor, the two named worked
  // cases, the milestone and overrun shapes, and a long-abandoned trial well past
  // TRIAL_OVERRUN_GRACE_DAYS. Integers >= 1, because that is all the caller emits.
  const DAY_COUNTERS = [1, 2, 7, 27, 28, 42, 53, 56, 57, 61, 84, 140, 400, 3650];
  // The row's own column: the shipped defaults, the worked trial's hand-set 56, and
  // the degenerate-but-storable ends of an integer column.
  const CURRENT_TARGETS = [0, 1, 14, 28, 42, 56, 84, 365, 3650];

  const CASES = CURRENT_TARGETS.flatMap((currentTargetDays) =>
    DAY_COUNTERS.flatMap((dayCounter) =>
      EXTRA_DAYS.map((extraDays) => ({ currentTargetDays, dayCounter, extraDays })),
    ),
  );

  it('the sweep is the size it claims to be', () => {
    // A property test over an empty cross-product passes. This is the floor that
    // says it did not.
    expect(EXTRA_DAYS.length).toBeGreaterThan(0);
    expect(CASES).toHaveLength(CURRENT_TARGETS.length * DAY_COUNTERS.length * EXTRA_DAYS.length);
    // And the two cases §4.3 names in prose are inside it.
    expect(CASES).toContainEqual({ currentTargetDays: 56, dayCounter: 56, extraDays: 28 });
    expect(CASES).toContainEqual({ currentTargetDays: 56, dayCounter: 61, extraDays: 28 });
  });

  it('is strictly greater than the day counter, over every case the caller can make', () => {
    const violations = CASES.filter((c) => !(nextTargetDays(c) > c.dayCounter));
    expect(violations).toEqual([]);
  });

  it('returns a whole number of days, over every case the caller can make', () => {
    const violations = CASES.filter((c) => !Number.isInteger(nextTargetDays(c)));
    expect(violations).toEqual([]);
  });

  // The degrade, stated separately and in its own terms: §5.6's "NaN degrades to
  // 'one more day' rather than throwing". `extendTrial` would throw on a NaN target
  // — safe, but it fails the one button whose job is keeping a diet going.
  it('degrades a non-finite input to a finite whole target rather than throwing', () => {
    const junk = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    const degenerate = junk.flatMap((currentTargetDays) =>
      junk.flatMap((dayCounter) => junk.map((extraDays) => ({ currentTargetDays, dayCounter, extraDays }))),
    );
    expect(degenerate).toHaveLength(27);
    for (const c of degenerate) {
      const got = nextTargetDays(c);
      expect(Number.isInteger(got)).toBe(true);
      // "One more day" from the day-counter fallback of 1 — never zero, and never
      // a value `extendTrial` would refuse to write.
      expect(got).toBeGreaterThanOrEqual(2);
    }
  });

  it('a fractional day counter still clears the day the owner is actually on', () => {
    // Not reachable through `trialDayCounter` today, and pinned anyway: the
    // function is exported and the clamp is the safety property, not the caller's
    // manners. `Math.ceil` is the honest oracle here — a target must clear the
    // whole day, and stating it this way does not restate `intOr`.
    for (const dayCounter of [0.5, 27.4, 56.2, 56.9]) {
      const got = nextTargetDays({ currentTargetDays: 56, dayCounter, extraDays: 28 });
      expect(Number.isInteger(got)).toBe(true);
      expect(got).toBeGreaterThanOrEqual(Math.ceil(dayCounter));
      expect(got).toBeGreaterThan(dayCounter);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// The §5.4 / §5.3 fixture world — one trial, read twice across one target move
// ════════════════════════════════════════════════════════════════════════════════
//
// THE SHAPE, and why it is the shape (C-35). This is a record the app can actually
// produce: a dog on the shipped 28-day GI default, logged sparsely through the
// prescribed window and then diligently past it. Nothing is seeded outside a read
// the caller could hand over, and the "tap" is the real `nextTargetDays` over the
// real `extensionDays('gi')` — not a number typed into the fixture.
//
// It is read TWICE and the ONLY thing that differs between the reads is
// `targetDurationDays`. Not one feeding is added, removed or edited. That is the
// whole finding: an owner action carrying no information about the record moves
// what the record is said to show.

const GATE_START = [2026, 5, 1] as const;
/** The shipped GI default the worked case sits on. */
const GATE_TARGET = 28;
/** Read on trial day 50 — 22 days past the prescribed window. */
const GATE_TODAY = 50;

const GATE_DIET: AllowedFood = {
  foodItemId: 'rc-venison',
  foodKey: 'royal caninselected protein pv',
  label: 'Royal Canin Selected Protein PV',
  role: 'primary_diet',
  allowedFrom: '2026-05-01',
  allowedUntil: null,
  // Designated, so the antigen arm is not dark — an undesignated `primary_diet` row
  // fails `mayClaimAllMatched` on `antigenArmDark` and the gate under test would
  // never reach the question it is about.
  primaryProtein: 'venison',
  proteins: ['venison'],
};

const OFF_DIET_TREAT = {
  foodItemId: 'zukes-chicken',
  foodKey: 'zuke’smini naturals chicken',
  label: 'Zuke’s Mini Naturals (chicken)',
  proteins: ['chicken'] as const,
};

function onDiet(day: number): TrialFeeding {
  return {
    eventId: `on-${day}`,
    occurredAt: isoAt(trialDay(GATE_START, day)),
    foodItemId: GATE_DIET.foodItemId,
    foodKey: GATE_DIET.foodKey,
    label: GATE_DIET.label,
    foodType: 'meal',
    proteins: [...GATE_DIET.proteins],
  };
}

function offDiet(day: number): TrialFeeding {
  return {
    eventId: `off-${day}`,
    occurredAt: isoAt(trialDay(GATE_START, day)),
    foodItemId: OFF_DIET_TREAT.foodItemId,
    foodKey: OFF_DIET_TREAT.foodKey,
    label: OFF_DIET_TREAT.label,
    foodType: 'meal',
    proteins: [...OFF_DIET_TREAT.proteins],
  };
}

function daysRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** The tap, computed rather than typed: the real arithmetic over the real ruled
 *  GI extension. If D5 / CUL-367 ever moves that constant, this moves with it. */
const GATE_TARGET_AFTER = nextTargetDays({
  currentTargetDays: GATE_TARGET,
  dayCounter: GATE_TODAY,
  extraDays: extensionDays('gi'),
});

function factsAtTarget(targetDurationDays: number, feedings: readonly TrialFeeding[]): TrialFacts {
  const trial: TrialSpec = {
    id: 'trial-gate',
    startedAt: '2026-05-01',
    targetDurationDays,
    species: 'dog',
  };
  return computeTrialFacts({
    trial,
    allowedFoods: [GATE_DIET],
    feedings,
    nowMs: trialDay(GATE_START, GATE_TODAY),
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// G3 — the off-diet exposure floor SURVIVES the target move (§5.3, §5.6)
// ════════════════════════════════════════════════════════════════════════════════
//
// This is the half of the invariant that HELD, and the reason it held is
// structural: every exposure loop bounds on `evidenceEnd`, and only `range` and
// `coverage` use the tail-clipped `endDayIndex`. `lib/dietTrial.ts`'s own comment
// says why letting the clip bound the feeding loop is forbidden — it "would
// silently DROP a treat fed on day 2 … which is the one direction a floor may never
// move".
//
// It is pinned here because PR 1b is about to change how that clip is DISCLOSED,
// and a repair to the disclosing half must not quietly reach the counting half.
//
// MUTATION THAT REDS IT: in `computeTrialFacts`, bound the feeding loop on the
// coverage `endDayIndex` instead of `evidenceEnd` — the two off-diet feedings in the
// tail vanish from the BEFORE read and the counts stop matching.

describe('G3 — a target move cannot change the off-diet exposure counts (§5.3)', () => {
  // Two real off-diet feedings INSIDE the clipped tail — past the prescribed window
  // (day 28) and inside the evidence (day 50). Anywhere else and the test would not
  // be about the clip.
  const TAIL_OFF_DIET = [35, 42];
  const FEEDINGS = [
    ...daysRange(1, 10).map(onDiet),
    ...daysRange(29, GATE_TODAY).map(onDiet),
    ...TAIL_OFF_DIET.map(offDiet),
  ];

  const before = factsAtTarget(GATE_TARGET, FEEDINGS);
  const after = factsAtTarget(GATE_TARGET_AFTER, FEEDINGS);

  // ── Non-vacuity floor, first ────────────────────────────────────────────────
  // "The counts match" is also what a fixture with no tail, no clip and no off-diet
  // feedings produces. These four assertions are what make the match mean something.
  it('the fixture really is clipped before the move, and really is not after it', () => {
    expect(before.range?.closedByOverrun).toBe(true);
    expect(after.range?.closedByOverrun).toBe(false);
    expect(GATE_TARGET_AFTER).toBeGreaterThan(GATE_TODAY);
  });

  it('the two off-diet feedings sit in the stretch the clip removes from coverage', () => {
    for (const day of TAIL_OFF_DIET) {
      expect(day).toBeGreaterThan(GATE_TARGET);
      expect(day).toBeLessThanOrEqual(GATE_TODAY);
    }
    // And the clip really did remove that stretch from the coverage window.
    expect(before.coverage?.daysElapsed).toBe(GATE_TARGET);
    expect(after.coverage?.daysElapsed).toBe(GATE_TODAY);
  });

  // ── The rule ────────────────────────────────────────────────────────────────
  it('totalFeedings and offDiet are identical before and after the move', () => {
    expect(before.exposures.totalFeedings).toBe(after.exposures.totalFeedings);
    expect(before.exposures.offDiet).toBe(after.exposures.offDiet);
    // Stated absolutely as well as relationally: two equal wrong numbers would
    // satisfy the equality above.
    expect(before.exposures.offDiet).toBe(TAIL_OFF_DIET.length);
    expect(before.exposures.totalFeedings).toBe(FEEDINGS.length);
  });

  it('the exposure window itself does not move, and the coverage window does', () => {
    // The asymmetry §5.3 names, asserted rather than described. `exposureRange` is
    // what a consumer needing the rows reads; `range` is coverage's and only
    // coverage's.
    expect(after.exposureRange).toEqual(before.exposureRange);
    expect(after.range?.endDayIndex).toBeGreaterThan(before.range?.endDayIndex as number);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// EXPECTED FAILURE 1 — §5.4: one tap moves a reassurance gate on the vet report
// ════════════════════════════════════════════════════════════════════════════════
//
// CUL-1038 (PR 1b) is what turns this green. Do not delete it, do not skip it, and
// do not "fix" it by weakening the requirement — the requirement is TE-6:
//
//   > An extension may not move a claim about the record that the record did not
//   > change.
//
// WHAT HAPPENS TODAY. The B-422 tail clip applies only while the trial is un-ended
// and past its target. Extending pushes the target end past the evidence, the clip
// stops applying, and the coverage denominator jumps from the prescribed window to
// the full elapsed range — carrying `belowCoverageFloor` and `mayStateRecordClean`
// with it, retroactively, over days already reported, on zero new evidence.
//
// WHAT THE VET READS ACROSS THAT TAP:
//   before → "The record is too sparse to read that as a clean elimination"
//   after  → "32 feedings — all 32 matched the trial diet or a permitted food."
//
// It runs both ways: on a trial logged daily to day 28 then silent to day 90, one
// tap WITHDRAWS a clean claim. The direction is not the defect; the movement is.

describe('§5.4 — the coverage gate an owner can move with one tap (CUL-1038)', () => {
  // The §5.4 record: 10 of days 1–28 logged, then every day to day 50. No off-diet
  // feeding anywhere, so the affirmative claim is the one under test rather than a
  // second thing being withheld for a second reason.
  const LOGGED_IN_WINDOW = daysRange(1, 10);
  const FEEDINGS = [...LOGGED_IN_WINDOW.map(onDiet), ...daysRange(29, GATE_TODAY).map(onDiet)];

  const before = factsAtTarget(GATE_TARGET, FEEDINGS);
  const after = factsAtTarget(GATE_TARGET_AFTER, FEEDINGS);

  // ── The executed defect, as GREEN assertions ────────────────────────────────
  //
  // These are not the requirement — they are the evidence, and they are green
  // because this is what the app does today. They also carry the expected failure
  // below: if the fixture ever stops producing the §5.4 shape, THESE red, rather
  // than the expected failure silently passing over a broken fixture (C-36).
  it('the record is identical across the tap — only the target moved', () => {
    expect(GATE_TARGET_AFTER).toBe(64);
    expect(FEEDINGS).toHaveLength(LOGGED_IN_WINDOW.length + (GATE_TODAY - 29 + 1));
    expect(before.exposures.totalFeedings).toBe(after.exposures.totalFeedings);
    expect(before.exposures.offDiet).toBe(0);
    expect(after.exposures.offDiet).toBe(0);
  });

  it('the coverage denominator jumps from the prescribed window to the elapsed range', () => {
    // The spec's own table, as literals — this is the executed record and it should
    // read the same in the test as it does in §5.4.
    expect(before.coverage).toEqual({ daysLogged: 10, daysElapsed: 28, fraction: 10 / 28 });
    expect(after.coverage).toEqual({ daysLogged: 32, daysElapsed: 50, fraction: 32 / 50 });
    // …and the same numbers derived from the fixture's own constants, so an edit to
    // the fixture cannot leave the literals above quietly describing a different
    // record than the one that was read.
    expect(before.coverage?.daysLogged).toBe(LOGGED_IN_WINDOW.length);
    expect(before.coverage?.daysElapsed).toBe(GATE_TARGET);
    expect(after.coverage?.daysLogged).toBe(FEEDINGS.length);
    expect(after.coverage?.daysElapsed).toBe(GATE_TODAY);
    // Both sides of the floor, derived from the shipped constants rather than from
    // the percentages in the spec's table.
    expect((before.coverage as { fraction: number }).fraction).toBeLessThan(COVERAGE_FLOOR);
    expect((after.coverage as { fraction: number }).fraction).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    expect((after.coverage as { fraction: number }).fraction).toBeLessThan(COVERAGE_SUPPORTS);
    // And neither read is below the two-sided minimum, where the answer would be
    // `not_yet` and no claim would be made in either direction.
    expect(before.coverage?.daysElapsed).toBeGreaterThanOrEqual(MIN_INTERPRETABLE_DAYS);
  });

  it('and the two gates move with it, in the reassuring direction', () => {
    expect(before.interpretability).toBe('does_not_support');
    expect(after.interpretability).toBe('partially_supports');
    expect(before.belowCoverageFloor).toBe(true);
    expect(after.belowCoverageFloor).toBe(false);
    expect(mayStateRecordClean(before)).toBe(false);
    expect(mayStateRecordClean(after)).toBe(true);
    // Not a second reason hiding the first: the claim gate itself never objected.
    expect(mayClaimAllMatched(before)).toBe(true);
    expect(mayClaimAllMatched(after)).toBe(true);
  });

  // ── The requirement (TE-6) ──────────────────────────────────────────────────
  //
  // `test.failing` and not `skip`: jest records this as an expected failure today
  // and turns the suite RED the moment it starts passing. That is deliberate. When
  // CUL-1038 lands, this test going red is the signal to promote it to a plain
  // `it` — and a repair that does not actually repair leaves it exactly as it is,
  // which is what stops the fix shipping quietly.
  test.failing(
    'TE-6 — a target move may not flip belowCoverageFloor or mayStateRecordClean [CUL-1038]',
    () => {
      expect(after.belowCoverageFloor).toBe(before.belowCoverageFloor);
      expect(mayStateRecordClean(after)).toBe(mayStateRecordClean(before));
    },
  );
});
