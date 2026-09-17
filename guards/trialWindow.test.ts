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
//   • EXPECTED FAILURES — hazards the record now carries as executable tests. Each
//     body states the REQUIREMENT; `expectedFailure` records that it does not hold
//     today and turns the suite RED the moment it starts holding. Never `skip`,
//     which asserts nothing in either direction. (§5.2's half is a Deno test and
//     lives in `supabase/functions/generate-report/render.test.ts`, beside the
//     B-532 block it extends — that render is server-side and jest does not run it.)
//
// ── WHY `expectedFailure` AND NOT jest's OWN `test.failing` ─────────────────────
// `test.failing` passes on ANY throw. Measured: a `TypeError`, a `ReferenceError`
// and a bare thrown string all satisfy it. So a fixture that breaks in a way that
// happens to throw reads as "the hazard is still there" — the marker cannot tell a
// live hazard from a dead fixture, which is the one thing it exists to tell. The
// Deno half of this PR already filters on the assertion class because its own
// docstring calls that load-bearing; presenting the two harnesses as equivalent
// while one of them lacked the filter was the asymmetry. Now they match.
//
// ── WHAT THIS FILE DOES NOT PIN, STATED SO THE GAP IS NOT READ AS COVERAGE ──────
// The §5.4 markers below assert over `computeTrialFacts`. The same tap was executed
// against four more surfaces and moves all of them; none is pinned here, because
// each needs its own harness and PR 0's remit is the model:
//
//   • THE OWNER'S TRIAL CARD. State `overrun` → `clean`; the body goes from "32
//     feedings in total. Culprit isn't saying how many matched the trial diet on
//     this record." to "…all 32 matched the trial diet or a permitted food."; the
//     day line from "Day 50 — 22 days past the window you set" to "Day 50 of 64".
//     Note what that is: the tap DELETES the only sentence on the card that
//     disclosed anything was unusual. §5.4's "nothing says the window moved", made
//     worse — the one thing that did say so is what the tap removes.
//   • `interpretabilityStatement`, which renders verbatim on the vet report.
//   • `coveredDayIndices` (10 → 32), which paints the widget's trial-day strip.
//   • `pet.dietTrialActive` on the report's detection input, verified flipping
//     FALSE → TRUE across a tap on an aged trial (target 28 → 166 on day 152) via
//     `trialLastDayNum`. `report.ts`'s own comment: that "fully mutes detectors
//     ⑧/⑨/⑩ and promotes correlation to band 1". §5.5 names it in prose.
//
// They belong with PR 1b's repair, where there is something to assert them against.
// Listed rather than omitted because an undocumented blind spot reads as coverage
// (C-38) — and because the card's deleted sentence is arguably the worst of the set.
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

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
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
  trialManageLabel,
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

/** `guards/` sits one level under the repo root. */
const REPO_ROOT = path.resolve(__dirname, '..');

/** Local noon on trial day N, counting from a start date, day 1 inclusive.
 *  Built by adding whole days to a local-noon instant — noon is 12h clear of both
 *  boundaries, so this survives a DST shift in either direction. */
function trialDay(start: readonly [number, number, number], n: number): number {
  return localNoon(start[0], start[1], start[2]) + (n - 1) * MS_PER_DAY;
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * The jest half of the expected-failure harness, matching the Deno wrapper in
 * `supabase/functions/generate-report/render.test.ts`.
 *
 * The body states the REQUIREMENT. This passes while the requirement is violated
 * and FAILS the moment it holds, so a repair cannot land without promoting the
 * marker and a repair that does not actually repair cannot land quietly either.
 *
 * Only a jest MATCHER failure counts as "still violated". Anything else — a
 * `TypeError` from a fixture that stopped building, a `ReferenceError`, a bare
 * thrown string — is re-thrown as a real failure. `test.failing` absorbs all three
 * (measured), which would let a dead fixture read as a live hazard.
 *
 * `err.name` is useless here: jest's assertion errors report `name: 'Error'`.
 * `matcherResult` is the property jest attaches to them and is the discriminator.
 */
function expectedFailure(name: string, fn: () => void): void {
  it(`EXPECTED FAILURE · ${name}`, () => {
    let thrown: unknown;
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
      thrown = e;
    }
    if (!threw) {
      throw new Error(
        `EXPECTED FAILURE NOW PASSES: ${name}\n\n` +
          'The behaviour this documented has changed. That is the signal, not a bug: ' +
          'promote this to a plain `it`, drop the expectedFailure wrapper, and record ' +
          'the repair on the issue named in the block comment above it.',
      );
    }
    const isMatcherFailure =
      typeof thrown === 'object' && thrown !== null && 'matcherResult' in thrown;
    // A non-matcher throw is a broken fixture, not a documented hazard.
    if (!isMatcherFailure) throw thrown;
  });
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
//
// ⚠️ AND WHAT THE MODEL ALONE CANNOT SEE — the third half, added after the
// adversarial pass showed the first two do not add up to the rule. Halves (a) and
// (b) walk `resolveTrialCard(...).actions`, and the card's action list is not the
// only way to the extension:
//
//   • `TrialCompletionSheet` (`components/profile/TrialCompletionSheet.tsx:246`)
//     fires `onExtend()` with NO window gate of its own, whenever it is on its
//     `decision` step. The only thing keeping that unreachable mid-trial is that
//     `setCompletionEntry('decision')` has exactly ONE caller — the card's own
//     `milestone` action.
//   • The header affordance is not on `TrialCardModel` at all. It is
//     `trialManageLabel(model)` → `trialManageVerb(state)`, and D6a makes THAT the
//     mid-trial door in PR 3.
//
// So as first written this file claimed "the door's PR will have to come through
// this file to change it" and could not cash it: PR 3 could ship header `Manage` →
// `TrialWindowSheet` → the write without one assertion here going red. That is the
// C-38 cheque this guard was citing one block earlier. Half (c) below closes it by
// pinning the two facts that actually hold the door shut, so the door's PR reds
// them and has to come here to say so.

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

  // ── Half (c): the two facts outside the model that hold the door shut ────────
  //
  // Both are source scans, because both are about WIRING rather than about a
  // returned value — and the wiring is what PR 3 changes. Comments are blanked in
  // one left-to-right pass (C-18) so a mention inside a comment cannot pass for a
  // call site, and so the reported counts describe code.
  it('half (c) — the decision sheet is reachable from exactly ONE place', () => {
    // C-32's `firstCallerLands` shape. `TrialCompletionSheet:246` routes `extend`
    // straight to `onExtend()` with no window check of its own, so the entry point
    // IS the gate. A second caller — a mid-trial door being the obvious one — reds
    // this and has to come here and say what it did about the window.
    const src = blankComments(
      fs.readFileSync(path.join(REPO_ROOT, 'app/(tabs)/profile.tsx'), 'utf8'),
    );
    const callSites = [...src.matchAll(/setCompletionEntry\(\s*['"]decision['"]\s*\)/g)];
    expect(callSites).toHaveLength(1);
    // …and it is the card's `milestone` action, not something else that grew into
    // the same call. Asserted on the line, because "there is one caller" is only
    // reassuring if it is the caller this rule is about.
    const line = src.slice(0, callSites[0].index).split('\n').length;
    expect(src.split('\n')[line - 1]).toMatch(/milestone:/);

    // The ungated branch this is standing in for. If the sheet ever grows its own
    // window gate, this reds — which is a good outcome and means half (c) can relax.
    const sheet = blankComments(
      fs.readFileSync(
        path.join(REPO_ROOT, 'components/profile/TrialCompletionSheet.tsx'),
        'utf8',
      ),
    );
    expect(sheet).toMatch(/if \(c\.id === 'extend'\) \{ onExtend\(\); return; \}/);
    expect(sheet).not.toMatch(/overrunDays/);
  });

  it('half (c) — the header verb is still Replace on every running state', () => {
    // D6a makes the header the mid-trial door ("Manage") in PR 3. Until then it
    // says `Replace`, which is honest about current capability and is the thing
    // §3 of the spec calls the failure this track replaces. This reds on the day
    // the door lands, which is exactly when someone should be reading this file.
    for (const [state, entry] of Object.entries(MID_TRIAL_BY_STATE)) {
      if ('unreachableMidTrial' in entry) continue;
      if (state === 'no_trial' || state === 'completed' || state === 'abandoned') continue;
      const model = resolveTrialCard(entry);
      expect(trialManageLabel(model)).toBe('Replace');
    }
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
// Do not delete it, do not skip it, and do not "fix" it by weakening the
// requirement — the requirement is TE-6:
//
//   > An extension may not move a claim about the record that the record did not
//   > change.
//
// WHAT HAPPENS TODAY. The B-422 tail clip applies only while the trial is un-ended
// and past its target. Extending pushes the target end past the evidence, the clip
// stops applying, and the coverage denominator jumps from the prescribed window to
// the full elapsed range — carrying `belowCoverageFloor`, `mayStateRecordClean` AND
// `interpretability` with it, retroactively, over days already reported, on zero new
// evidence.
//
// WHAT THE OWNER'S CARD READS ACROSS THAT TAP (this fixture drives the CLIENT path;
// see the scope note below):
//   before → "The record is too sparse to read that as a clean elimination"
//   after  → "32 feedings — all 32 matched the trial diet or a permitted food."
//
// ⚠️ THREE CORRECTIONS TO THE SPEC'S OWN ACCOUNT, EXECUTED 2026-09-17 (CUL-1036's
// adversarial pass). Recorded here rather than left to be rediscovered, because D7
// was ruled on two of them:
//
//  1. THE TAP IS INERT AT THE MILESTONE. At `overrunDays === 0`, `overrunUnended`
//     is `evidenceEnd > targetEnd`, which is FALSE — no clip is applying, so moving
//     the target changes nothing. Executed: day 28 of 28 → 42 leaves coverage at
//     10/28 and both gates where they were. D7's justification — "this is already
//     reachable today AT THE MILESTONE" — is false in its specifics. The hazard is
//     **overrun-only**.
//  2. A MID-WINDOW EXTENSION IS ALSO INERT. Day 20 of 56 → 84: coverage 6/20 both
//     reads, nothing moves. So the mid-trial door this track exists to build cannot
//     trigger §5.4 on a mid-window trial, and D7's "not created by this feature,
//     only MULTIPLIED by it" survives only for the door offered on an overrun trial.
//  3. IT IS NOT ONE TAP OF `Keep going`. On an overrun trial the card's only action
//     is `{ id: 'milestone', label: 'Tell Culprit what's next' }` — a link whose
//     label says nothing about a window — and `Keep going — 2 more weeks` lives
//     inside the sheet it opens. Two taps, behind a label that does not name what
//     is about to move. Where the tap is one tap it is inert; where it moves the
//     gate it is two.
//
// ⚠️ AND THE SCOPE THIS FIXTURE DRIVES. It passes no `scopeStart` / `scopeEnd`, so
// it is the CLIENT read. `generate-report/trial.ts` always passes both, and under a
// since-visit scope opening at day 20 the same record reads 0 of 9 → 22 of 31 —
// different numbers, in the same direction. §5.6 already records "no live Deno
// render" as owed; this is that debt one level earlier, and PR 4 is where it lands.

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
  // CUL-1038 (PR 1b) is what turns this green — under D7(c), and only under (c).
  //
  // ⚠️ THE HISTORY MATTERS, because this comment said the opposite for six hours and
  // the reason is the whole point of PR 0. D7 was first ruled **(a) disclose it**,
  // described as "a render, not a mechanism". But `belowCoverageFloor` is
  // `interpretability === 'does_not_support'` and `mayStateRecordClean` reads
  // `facts.interpretability`, both computed in `lib/dietTrial.ts`, and NEITHER reads
  // `closedByOverrun`. A render cannot move them. Executed both ways against the
  // shipped module: a frozen denominator fires every marker in this file; (a)'s
  // render-only change fires none. PR 1b as first specced would have landed with the
  // suite green and the hazard fully intact.
  //
  // **The PM re-ruled to D7(c) — freeze AND disclose — on 2026-09-17** (spec v2.2).
  // So the marker means what it says again: when PR 1b lands, this going RED is the
  // repair signal, and the next session promotes it to a plain `it`.
  //
  // WHAT (c) ACTUALLY CHANGES, for whoever builds it: the coverage denominator is
  // pinned at `target_duration_days_initial` (D2a's column, added by PR 1 — which is
  // therefore a HARD prerequisite, not a parallel track), and the window move is
  // disclosed beside the figure. The freeze is what moves these assertions; the
  // disclosure pays off the C-38 debt at `lib/dietTrial.ts:2223` and does not.
  expectedFailure(
    'TE-6 — a target move may not move belowCoverageFloor, mayStateRecordClean or ' +
      'interpretability [CUL-1038]',
    () => {
      expect(after.belowCoverageFloor).toBe(before.belowCoverageFloor);
      expect(mayStateRecordClean(after)).toBe(mayStateRecordClean(before));
      // `interpretability` is NOT a third way of saying the same thing. At 18 of 28
      // logged it moves `partially_supports` → `supports` while BOTH booleans hold
      // — and it renders verbatim on the vet report as `interpretabilityStatement`
      // (`render.ts:3026`). A requirement stated over the booleans alone can be
      // satisfied by a repair that still violates TE-6.
      expect(after.interpretability).toBe(before.interpretability);
    },
  );
});


// ════════════════════════════════════════════════════════════════════════════════
// EXPECTED FAILURE 2 — §5.4 in the OTHER direction: one tap WITHDRAWS a clean claim
// ════════════════════════════════════════════════════════════════════════════════
//
// CUL-1036 names only the reassuring flip, and pinning only that would under-state
// the hazard in the PR whose entire job is recording it. §5.4 says the mechanism
// "runs both ways … one tap moves `supports` → `does_not_support` and WITHDRAWS a
// clean claim", and TE-6 is stated without a direction: "an extension may not move a
// claim about the record that the record did not change." So the requirement is the
// same requirement, and it is tested here in the direction that has the opposite
// sign — because a repair that only stops the movement one way satisfies neither
// TE-6 nor this test.
//
// EXECUTED, on a record the app can produce: a trial logged EVERY day of its 28-day
// window and then silent to day 90. That owner has a perfect record of the
// prescribed window — and one tap of the extension she is offered re-reads it as
// 28 of 90 and takes the claim away.
//
// It is also the direction that makes the shape unmistakable. The reassuring flip
// can be argued as a denominator becoming "more honest"; this one cannot be argued
// as anything, because the days it newly counts as gaps are days AFTER the window
// the trial was designed against, and the owner did not stop logging — the trial
// ran out.

describe('§5.4 — the same tap, the other direction: a clean claim withdrawn (CUL-1038)', () => {
  /** Logged every day of the prescribed window, then nothing. Read long after. */
  const SILENT_SINCE_TODAY = 90;
  const FEEDINGS = daysRange(1, GATE_TARGET).map(onDiet);

  function factsAt(targetDurationDays: number): TrialFacts {
    return computeTrialFacts({
      trial: { id: 'trial-gate-rev', startedAt: '2026-05-01', targetDurationDays, species: 'dog' },
      allowedFoods: [GATE_DIET],
      feedings: FEEDINGS,
      nowMs: trialDay(GATE_START, SILENT_SINCE_TODAY),
    });
  }

  const before = factsAt(GATE_TARGET);
  const after = factsAt(
    nextTargetDays({
      currentTargetDays: GATE_TARGET,
      dayCounter: SILENT_SINCE_TODAY,
      extraDays: extensionDays('gi'),
    }),
  );

  it('the record is identical across the tap, and it is a perfect one', () => {
    expect(FEEDINGS).toHaveLength(GATE_TARGET);
    expect(before.coverage).toEqual({ daysLogged: 28, daysElapsed: 28, fraction: 1 });
    expect(before.exposures.totalFeedings).toBe(after.exposures.totalFeedings);
    expect(before.exposures.offDiet).toBe(0);
    // The clip is what is holding the window at the trial's own length.
    expect(before.range?.closedByOverrun).toBe(true);
    expect(after.range?.closedByOverrun).toBe(false);
  });

  it('the denominator swells to the silence, and the claim is taken away', () => {
    expect(after.coverage).toEqual({
      daysLogged: 28,
      daysElapsed: SILENT_SINCE_TODAY,
      fraction: 28 / SILENT_SINCE_TODAY,
    });
    expect((before.coverage as { fraction: number }).fraction).toBeGreaterThanOrEqual(
      COVERAGE_SUPPORTS,
    );
    expect((after.coverage as { fraction: number }).fraction).toBeLessThan(COVERAGE_FLOOR);
    expect(before.interpretability).toBe('supports');
    expect(after.interpretability).toBe('does_not_support');
    // The mirror image of the first case, same mechanism, opposite sign.
    expect(before.belowCoverageFloor).toBe(false);
    expect(after.belowCoverageFloor).toBe(true);
    expect(mayStateRecordClean(before)).toBe(true);
    expect(mayStateRecordClean(after)).toBe(false);
  });

  expectedFailure(
    'TE-6 — the rule has no direction: this move is forbidden too [CUL-1038]',
    () => {
      expect(after.belowCoverageFloor).toBe(before.belowCoverageFloor);
      expect(mayStateRecordClean(after)).toBe(mayStateRecordClean(before));
      // `interpretability` is NOT a third way of saying the same thing. At 18 of 28
      // logged it moves `partially_supports` → `supports` while BOTH booleans hold
      // — and it renders verbatim on the vet report as `interpretabilityStatement`
      // (`render.ts:3026`). A requirement stated over the booleans alone can be
      // satisfied by a repair that still violates TE-6.
      expect(after.interpretability).toBe(before.interpretability);
    },
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// EXPECTED FAILURE 3 — §5.4's REAL ceiling: the head clip carries it to `supports`
// ════════════════════════════════════════════════════════════════════════════════
//
// The two cases above stop two rungs short of the worst instance, and recording a
// hazard at less than its ceiling is the under-statement this PR exists to prevent.
//
// EXECUTED. An owner who logs nothing during the prescribed window and then every
// day past it. Before the tap: 0 of 28, `does_not_support`, the record correctly
// unreadable. After ONE tap:
//
//     22 of 22 · fraction 1.0 · `supports` · mayStateRecordClean TRUE
//
// A perfect coverage ratio, the strongest interpretability verdict the module can
// return, and the affirmative claim unlocked — over a trial whose entire prescribed
// window has no meal logged in it at all.
//
// HOW IT GETS THERE, and why this one is worse than a denominator moving. The head
// clip resolves INSIDE the coverage window: `startDayIndex` is the first logged day
// when the range opens at the trial's start. While the tail clip holds the window at
// day 28 the head cannot move (no log is inside it). Extending removes the tail
// clip, the first logged day becomes day 29, and the head clip follows it — so the
// window becomes [29, 50], which is 22 days with 22 of them logged.
//
// `untrackedDaysBeforeFirstLog` goes 0 → 28 in the same move. The app now asserts
// that the first 28 days of the trial PRE-DATE ANY LOGGING. They do not. They are
// ordinary un-logged trial days, and the distinction is the whole reason that field
// exists: days the owner could not have logged are not a gap in their record, and
// days they simply did not log are.
//
// That is the head clip's own documented forbidden direction, re-entered through the
// target. `lib/dietTrial.ts` on the head clip: it "moves the denominator toward the
// record looking complete … the one direction it must never move on a claim it
// cannot support." Nothing in that module is wrong; the target is reaching a clip
// that was reasoned about on the assumption the target does not move.
//
// CUL-1038's scope was the tail clip alone, which is why this case was recorded
// separately: the repair has to hold the head clip too, or the same tap reaches a
// strictly better-looking number by a second route.
//
// ⚠️ D7(c) CLOSES IT, AND THAT IS STRUCTURAL RATHER THAN LUCKY. With the denominator
// pinned at the ORIGINAL target the coverage window never leaves [day 1, day 28], so
// the head clip has no logged day inside it to follow and 0 of 28 stays 0 of 28.
// Verified by executing the freeze against this marker. Under D7(a) — the first
// ruling, superseded — this route would have stayed open AND undisclosed, since a
// disclosure about the tail clip says nothing about the head one.

describe('§5.4 — the ceiling: nothing logged in the window, everything after it', () => {
  const LOGGED_AFTER = daysRange(GATE_TARGET + 1, GATE_TODAY);
  const FEEDINGS = LOGGED_AFTER.map(onDiet);

  const before = factsAtTarget(GATE_TARGET, FEEDINGS);
  const after = factsAtTarget(GATE_TARGET_AFTER, FEEDINGS);

  it('the record is identical across the tap, and empty inside the prescribed window', () => {
    expect(FEEDINGS).toHaveLength(GATE_TODAY - GATE_TARGET);
    expect(before.coverage).toEqual({ daysLogged: 0, daysElapsed: GATE_TARGET, fraction: 0 });
    expect(before.exposures.totalFeedings).toBe(after.exposures.totalFeedings);
    expect(before.range?.closedByOverrun).toBe(true);
    expect(after.range?.closedByOverrun).toBe(false);
  });

  it('one tap takes an empty window to a PERFECT ratio and the strongest verdict', () => {
    expect(after.coverage).toEqual({
      daysLogged: LOGGED_AFTER.length,
      daysElapsed: LOGGED_AFTER.length,
      fraction: 1,
    });
    expect((after.coverage as { fraction: number }).fraction).toBeGreaterThanOrEqual(
      COVERAGE_SUPPORTS,
    );
    expect(before.interpretability).toBe('does_not_support');
    expect(after.interpretability).toBe('supports');
    expect(before.belowCoverageFloor).toBe(true);
    expect(after.belowCoverageFloor).toBe(false);
    expect(mayStateRecordClean(before)).toBe(false);
    expect(mayStateRecordClean(after)).toBe(true);
  });

  it('and the app starts asserting the first 28 days pre-date any logging', () => {
    expect(before.untrackedDaysBeforeFirstLog).toBe(0);
    expect(after.untrackedDaysBeforeFirstLog).toBe(GATE_TARGET);
  });

  expectedFailure(
    'TE-6 — the head clip may not follow the target either [CUL-1038]',
    () => {
      expect(after.belowCoverageFloor).toBe(before.belowCoverageFloor);
      expect(mayStateRecordClean(after)).toBe(mayStateRecordClean(before));
      expect(after.interpretability).toBe(before.interpretability);
      // The second route, stated separately because a repair could close the tail
      // clip and leave this one open — which would still hand the report a
      // fabricated 28-day "before any logging" span.
      expect(after.untrackedDaysBeforeFirstLog).toBe(before.untrackedDaysBeforeFirstLog);
    },
  );
});
