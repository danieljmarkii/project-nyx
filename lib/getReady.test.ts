// The env boundary: `lib/rundown` reaches `lib/supabase` through the analytics chain,
// and that module throws at IMPORT when the anon key is unset. Nothing under test
// calls it — `buildWorthRaising` is pure and takes every input — so a bare stub is
// enough. Declared before the imports because `jest.mock` is hoisted anyway, and
// writing it here keeps the reason next to the thing it explains.
jest.mock('./supabase', () => ({ supabase: {} }));

import * as fs from 'fs';
import * as path from 'path';

import {
  buildWorthRaising,
  INTAKE_TRIGGER_ORDER,
  localIntakeDeclines,
  WORTH_RAISING_CAP,
} from './getReady';
import { detectIntakeDecline } from './analytics';
import { intakeDeclineFacts } from './dietTrialFacts';
import { medHistoryCutoffMs } from './rundown';
import { visibleFindings } from './signalVisible';
import type { AnalyticsMeal, IntakeDeclineFlag } from './analytics';
import type { WorthRaisingInput } from './getReady';
import type { CachedFinding, SignalFinding } from './signal';
import type { Rundown, RundownTile } from './rundown';
import type { MedicationCourse, MedicationCourseEnd } from './medicationHistory';
import type { TrialStripModel } from './dietTrialCard';

// "Worth raising" — the quoting rules, the cap, and the two never-say invariants
// (CUL-903 VV-5; spec §7 AC 5).
//
// The subject here is not "does it render a list". It is the four things AC 5 makes
// this module answerable for: every row is a VERBATIM quote of a sentence the app
// already states, a safety finding leads and is never capped away, a quiet record
// gets no section at all, and no row turns a decline into a taste.

const DAY = 86_400_000;
// C-29 on the TIME axis: anchored to the clock rather than to an absolute date, so
// the 12-month course window is measured from the run rather than from a literal that
// ages into a different answer on a calendar boundary.
const NOW = Date.now();

/** The drug-name cache, so a dose-derived course can be named (`resolveCourseName`). */
const NAMES = new Map([['item-x', { generic: null, brand: 'Cerenia' }]]);

const weighIn = (daysAgo: number) => ({
  weightKg: 4.1,
  occurredAt: new Date(NOW - daysAgo * DAY).toISOString(),
});

function tile(over: Partial<RundownTile> = {}): RundownTile {
  return { key: 'weight', label: 'Weight', value: '4.0–4.2 kg', tap: null, ...over };
}

/**
 * The QUIET default, and it is shaped the way `buildRundown` actually produces one
 * (C-35: a fixture production cannot create is green over nothing).
 *
 * Specifically the weight half: a tile whose value is a RANGE always comes with
 * readings behind it, and `empty` is set on exactly the branch that reads "No
 * weigh-ins logged". The first cut of this file paired a range with `weighIns: []`,
 * a combination the builder cannot emit — and it silently added a weight row to
 * every case in the file, which is how the module's own gate turned out to be
 * asking the readings while printing the tile.
 */
function rundown(over: Partial<Rundown> = {}): Rundown {
  return {
    petName: 'Mochi',
    generatedAtMs: NOW,
    tiles: [tile()],
    pastMedications: [],
    facts: {
      courses: [],
      medItemNames: NAMES,
      lastVisitAt: null,
      weighIns: [{ weightKg: 4.1, occurredAt: new Date(NOW - 5 * DAY).toISOString() }],
    },
    ...over,
  };
}

function finding(over: Partial<CachedFinding> & { text: string; rank: number }): CachedFinding {
  return {
    rank: over.rank,
    text: over.text,
    finding:
      over.finding ??
      ({
        type: 'reflection',
        priorityClass: 'insight',
        symptomType: 'vomit',
        currentCount: 2,
        priorCount: 5,
        direction: 'improving',
        windowDays: 30,
      } satisfies SignalFinding),
  };
}

const SAFETY = {
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  // 1, never 3: `daysBelowBaseline` is the species constant on both the phone and the
  // server (cat 1, dog 2). This fixture said 3 until CUL-950 — a shape the detector
  // cannot emit for a cat, which is what C-35 forbids.
  daysBelowBaseline: 1,
  refusedFoodLabel: null,
  ratedMealsConsidered: 8,
} satisfies SignalFinding;

// ── Intake fixtures built by the REAL detector (CUL-950) ──────────────────────────
//
// C-35: a fixture shaped unlike production is green over nothing. So the device's
// declines are not hand-written here — they are what `detectIntakeDecline` returns
// over a meal record, turned into facts by the loader's own `intakeDeclineFacts`.
// The Signal's side is the SAME detector run at an EARLIER clock over an EARLIER
// record, which is exactly how the two come apart in production: Get ready reads a
// cache written before the owner's latest logs (AC 4 never refreshes it).
//
// The detector buckets days by UTC date, so the clock is pinned to UTC noon of the
// run's own day (C-29: anchored to the clock, never to a literal) and every meal sits
// between 08:00 and 11:00 UTC — the same answer in every CI timezone.
const HOUR = 3_600_000;
const DETECT_NOW = Math.floor(NOW / DAY) * DAY + 12 * HOUR;
const CACHE_NOW = DETECT_NOW - DAY; // the cache was written yesterday at noon

const CHICKEN = { id: 'f-chicken', label: 'Purina Chicken Pâté' };
const SALMON = { id: 'f-salmon', label: 'Purina Salmon Loaf' };

function meal(
  daysAgo: number,
  hourUtc: number,
  food: { id: string; label: string | null },
  intakeRating: 'all' | 'most' | 'some' | 'picked' | 'refused',
): AnalyticsMeal {
  return {
    ms: DETECT_NOW - 12 * HOUR - daysAgo * DAY + hourUtc * HOUR,
    foodItemId: food.id,
    foodLabel: food.label,
    foodType: 'meal',
    primaryProtein: null,
    intakeRating,
  };
}

/**
 * Ten days of a cat finishing both of her foods — the baseline a decline departs from.
 * `chicken` lets one record carry the food under a different label on the device,
 * the way a stale food cache or a rename leaves it.
 */
function baseline(chicken: { id: string; label: string | null } = CHICKEN): AnalyticsMeal[] {
  return Array.from({ length: 10 }, (_, i) => [
    meal(i + 3, 8, chicken, 'all'),
    meal(i + 3, 10, SALMON, 'all'),
  ]).flat();
}

function detect(meals: AnalyticsMeal[], nowMs: number): IntakeDeclineFlag[] {
  const result = detectIntakeDecline({
    species: 'cat',
    nowMs,
    meals,
    freeFedFoodIds: new Set(),
  });
  return result.status === 'watch' ? result.flags : [];
}

/**
 * The server's cached findings for these flags: the engine's rank order (an outright
 * refusal leads a consecutive-low — `rankFindings`), and the template's sentence
 * (`generate-signal/phrasing.ts` `templateIntakeDecline`, mirrored — the app's
 * type-check does not reach `supabase/functions`). The merge never reads this text;
 * it is here so the verbatim assertions quote a real Signal sentence.
 */
function signalFrom(flags: IntakeDeclineFlag[], pet = 'Mochi'): CachedFinding[] {
  const serverOrder = [...flags].sort(
    (a, b) => (a.trigger === 'refused_normal_food' ? 0 : 1) - (b.trigger === 'refused_normal_food' ? 0 : 1),
  );
  return serverOrder.map((f, i) => ({
    rank: i,
    text:
      f.trigger === 'refused_normal_food'
        ? `${pet} just turned down ${f.refusedFoodLabel ?? 'a food they usually finish'}, which ${pet} normally eats — worth keeping an eye on, and a word with your vet if it carries on.`
        : `${pet} has eaten less than usual today — worth keeping an eye on, and a word with your vet if it carries on.`,
    finding: {
      type: 'intake_decline',
      priorityClass: 'safety',
      trigger: f.trigger,
      species: 'cat',
      daysBelowBaseline: f.daysBelowBaseline,
      refusedFoodLabel: f.refusedFoodLabel,
      ratedMealsConsidered: f.ratedMealsConsidered,
    },
  }));
}

/** A cat that ate little today, and nothing else: `[consecutive_low]`. */
function catLowFlag(): IntakeDeclineFlag {
  const flags = detect(
    [...baseline(), meal(0, 8, SALMON, 'picked'), meal(0, 10, SALMON, 'picked')],
    DETECT_NOW,
  );
  expect(flags.map((f) => f.trigger)).toEqual(['consecutive_low']);
  return flags[0];
}

function input(over: Partial<WorthRaisingInput> = {}): WorthRaisingInput {
  return {
    findings: [],
    suppressTrialResponse: false,
    trialStrip: null,
    intakeDecline: [],
    rundown: rundown(),
    nowMs: NOW,
    ...over,
  };
}

/**
 * A course the way `deriveMedicationCourses` can actually emit one INTO
 * `splitPastCourses().shown` — which is narrower than it looks, and the narrowness is
 * the whole of the course row's design (C-35).
 *
 * `shown` excludes active courses, and for a REGIMEN `end.kind === 'ended'` ⟺
 * `status ∈ {completed, stopped}` ⟺ `!isActive`. So a shown regimen ALWAYS carries an
 * owner-recorded end, and the first cut's fixture — `source: 'regimen'`, `isActive:
 * false`, `end: {kind:'none'}` — is a combination the derivation cannot produce. Two
 * tests were green over it while the production row rendered for nobody.
 *
 * A dose-derived course is the only thing the H1 register can ever show as "No end
 * recorded", so that is what this builds.
 */
function course(over: Partial<MedicationCourse> = {}): MedicationCourse {
  const lastDose = new Date(NOW - 7 * DAY).toISOString();
  return {
    key: 'item:item-x',
    source: 'doses',
    regimenId: null,
    medicationItemId: 'item-x',
    drugName: null,
    isActive: false,
    tally: { given: 9, partial: 0, missed: 0, refused: 0, unrated: 0 },
    dosesLogged: 9,
    firstDoseIso: new Date(NOW - 40 * DAY).toISOString(),
    lastDoseIso: lastDose,
    firstDoseDay: new Date(NOW - 40 * DAY).toISOString().slice(0, 10),
    lastDoseDay: lastDose.slice(0, 10),
    startedAt: new Date(NOW - 40 * DAY).toISOString().slice(0, 10),
    dosesPerDay: null,
    scheduleNotes: null,
    route: null,
    doseAmount: null,
    plannedDoses: null,
    targetDurationDays: null,
    runDays: null,
    // The REAL union member. The first cut wrote `{ kind: 'no_end_recorded' }` behind
    // an `as`, which is not a member at all — `end.kind !== 'ended'` happened to be
    // true for it, so the test passed over a shape `deriveMedicationCourses` cannot
    // produce. The cast is what hid it; `satisfies` is what would not have.
    end: { kind: 'none', lastDoseIso: lastDose } satisfies MedicationCourseEnd,
    ...over,
  };
}

describe('a row is a QUOTE, never a new claim', () => {
  it("renders the Signal's phrased sentence character-for-character", () => {
    const text = 'Mochi has finished 2 of 8 meals since Sunday.';
    const { rows } = buildWorthRaising(input({ findings: [finding({ text, rank: 1 })] }));
    expect(rows).toHaveLength(1);
    // Not `toContain`, not a regex: the Change Contract's count-anchored sentence is
    // the unit, and re-wrapping it — "The overnight pattern — …" — would be this
    // module making a claim the engine did not.
    expect(rows[0].text).toBe(text);
    expect(rows[0].sourceLabel).toBe('from the Signal');
  });

  it("quotes the trial strip's own header and line, not a re-phrasing", () => {
    const strip: TrialStripModel = {
      header: 'Diet trial · day 23 of 56',
      line: 'Hydrolyzed · ends Oct 12 · 41 of 48 meals finished',
      progressFraction: 0.41,
      trialResponseLine: null,
    };
    const { rows } = buildWorthRaising(input({ trialStrip: strip }));
    expect(rows[0].text).toBe(strip.header);
    expect(rows[0].detail).toBe(strip.line);
  });

  it("quotes the course's H1 register — silence reads 'No end recorded', never 'completed'", () => {
    const { rows } = buildWorthRaising(
      input({ rundown: rundown({ facts: { courses: [course()], medItemNames: NAMES, lastVisitAt: null, weighIns: [weighIn(5)] } }) }),
    );
    expect(rows[0].text).toContain('Cerenia');
    expect(rows[0].text).toContain('9 doses');
    expect(rows[0].detail).toBe('No end recorded');
    expect(rows[0].sourceLabel).toBe('from the course');
  });

  it('never raises a course the owner DID end — that question is answered', () => {
    // A REGIMEN, because only a regimen can carry an ending: `end.kind === 'ended'` is
    // constructed from `status ∈ {completed, stopped}`, and a dose-derived course has no
    // status at all. This is the shape `splitPastCourses().shown` is mostly full of.
    const ended = course({
      key: 'r1',
      source: 'regimen',
      regimenId: 'r1',
      drugName: 'Prednisolone',
      medicationItemId: null,
      end: {
        kind: 'ended',
        status: 'completed',
        endedAt: new Date(NOW - 5 * DAY).toISOString().slice(0, 10),
      } satisfies MedicationCourseEnd,
    });
    const { rows } = buildWorthRaising(
      input({ rundown: rundown({ facts: { courses: [ended], medItemNames: NAMES, lastVisitAt: null, weighIns: [weighIn(5)] } }) }),
    );
    expect(rows).toHaveLength(0);
  });
});

describe('a safety finding leads, and is never capped away', () => {
  it('puts a safety finding above a benign one the engine ranked higher', () => {
    // The engine already ranks safety first, so this only diverges if it ever did
    // not — and AC 5's "a safety finding leads" is the requirement that wins there.
    const { rows } = buildWorthRaising(
      input({
        findings: [
          finding({ text: 'A benign observation.', rank: 1 }),
          finding({ text: 'Mochi has finished 2 of 8 meals since Sunday.', rank: 2, finding: SAFETY }),
        ],
      }),
    );
    expect(rows[0].text).toBe('Mochi has finished 2 of 8 meals since Sunday.');
    expect(rows[0].isSafety).toBe(true);
  });

  it('renders SIX safety findings even though the cap is four', () => {
    // Principle 3: safety insights "always lead and are never dropped to honor a
    // layout cap". The Signal's findings are unbounded server-side, so this is
    // reachable rather than theoretical.
    const six = Array.from({ length: 6 }, (_, i) =>
      finding({ text: `Safety ${i}.`, rank: i + 1, finding: SAFETY }),
    );
    const { rows } = buildWorthRaising(input({ findings: six }));
    expect(rows.filter((r) => r.isSafety)).toHaveLength(6);
    expect(rows.length).toBeGreaterThan(WORTH_RAISING_CAP);
  });

  it('caps the OPTIONAL rows at four', () => {
    const benign = Array.from({ length: 9 }, (_, i) => finding({ text: `Benign ${i}.`, rank: i + 1 }));
    const { rows } = buildWorthRaising(input({ findings: benign }));
    expect(rows).toHaveLength(WORTH_RAISING_CAP);
  });

  it('keeps the trial above a crowd of benign Signal findings', () => {
    // The case this ordering exists for: a wedge owner at a RECHECK for the trial,
    // whose Signal happens to carry four benign findings. Signal-first would render
    // four symptom sentences and never mention the trial — at the appointment the
    // trial is the subject of.
    const benign = Array.from({ length: 4 }, (_, i) => finding({ text: `Benign ${i}.`, rank: i + 1 }));
    const strip: TrialStripModel = {
      header: 'Diet trial · day 23 of 56',
      line: null,
      progressFraction: 0.41,
      trialResponseLine: null,
    };
    const { rows } = buildWorthRaising(input({ findings: benign, trialStrip: strip }));
    expect(rows.map((r) => r.source)).toContain('trial');
    expect(rows[0].source).toBe('trial');
  });
});

describe('the adversarial counterexample the issue names', () => {
  // "a record with a stood-down chronicity card AND a fresh intake decline → the
  // decline leads, the stood-down card is quoted in its own stand-down wording, no
  // count is re-derived, no row says picky."
  const STOOD_DOWN = {
    type: 'stood_down',
    priorityClass: 'insight',
    symptomType: 'vomit',
    recencyDays: 14,
    tier: 'standard',
    lastEpisodeIso: new Date(NOW - 20 * DAY).toISOString(),
    // Minted YESTERDAY, so `stoodDownExpired` (seven days) cannot quietly remove this
    // row and make the assertion below true for the wrong reason.
    stoodDownAt: new Date(NOW - 1 * DAY).toISOString(),
    formerRank: 2,
  } satisfies SignalFinding;

  const standDownText = 'No vomiting logged for Mochi in 14 days.';
  const declineText = 'Mochi has finished 2 of 8 meals since Sunday.';

  const built = () =>
    buildWorthRaising(
      input({
        findings: [
          finding({ text: standDownText, rank: 1, finding: STOOD_DOWN }),
          finding({ text: declineText, rank: 2, finding: SAFETY }),
        ],
      }),
    );

  it('the decline leads', () => {
    expect(built().rows[0].text).toBe(declineText);
  });

  it("the stood-down card is quoted in its own stand-down wording", () => {
    const standDown = built().rows.find((r) => r.text === standDownText);
    expect(standDown).toBeDefined();
    expect(standDown?.text).toBe(standDownText);
  });

  it('no row says picky, fussy or preference', () => {
    for (const row of built().rows) {
      expect(row.text).not.toMatch(/picky|fussy|preference/i);
    }
  });
});

describe('the preference screen — and its deliberate asymmetry', () => {
  it('refuses a COMPOSED row that turns a decline into a taste', () => {
    // Owner free-text reaches a composed row through the drug name. Dropping it is
    // safe here and only here: an assembled row is never a safety statement.
    const named = course({ drugName: 'Picky-Chew' });
    const { rows } = buildWorthRaising(
      input({ rundown: rundown({ facts: { courses: [named], medItemNames: NAMES, lastVisitAt: null, weighIns: [weighIn(5)] } }) }),
    );
    expect(rows).toHaveLength(0);
  });

  it('does NOT edit or drop a QUOTED Signal sentence, even one carrying the word', () => {
    // The asymmetry is the whole design. AC 5 requires the Signal verbatim, and a
    // silent drop here could remove a SAFETY statement from the list — the one
    // outcome this module may not cause. A bad Signal string is a bug in
    // `generate-signal/phrasing.ts`, and that is where it gets fixed.
    const text = 'Mochi has been picky about 3 of 8 meals.';
    const { rows } = buildWorthRaising(
      input({ findings: [finding({ text, rank: 1, finding: SAFETY })] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe(text);
  });
});

describe('a quiet record gets NO section — and a failed read is not a quiet record', () => {
  it('renders no rows at all when nothing is standing', () => {
    const { rows, signalUnavailable } = buildWorthRaising(input({ findings: [] }));
    expect(rows).toEqual([]);
    expect(signalUnavailable).toBe(false);
  });

  it('flags an unreadable Signal cache rather than reporting an empty one', () => {
    // `null` is "we could not look"; `[]` is "nothing standing". An owner who cannot
    // tell them apart reads the first as the second and walks into the room reassured.
    const { signalUnavailable } = buildWorthRaising(input({ findings: null }));
    expect(signalUnavailable).toBe(true);
  });

  it('still builds the LOCAL rows when the Signal could not be read', () => {
    // Offline, everything but the Signal came from SQLite and is complete.
    const strip: TrialStripModel = {
      header: 'Diet trial · day 23 of 56',
      line: null,
      progressFraction: 0.41,
      trialResponseLine: null,
    };
    const { rows, signalUnavailable } = buildWorthRaising(input({ findings: null, trialStrip: strip }));
    expect(signalUnavailable).toBe(true);
    expect(rows.map((r) => r.source)).toEqual(['trial']);
  });
});

describe('the weight gap — a DATE, never an invented duration', () => {
  it("raises 'No weigh-ins logged' — the rundown's own sentence — when there are none", () => {
    const { rows } = buildWorthRaising(
      input({ rundown: rundown({ tiles: [tile({ value: 'No weigh-ins logged', empty: true })] }) }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('No weigh-ins logged');
    expect(rows[0].detail).toBeNull();
  });

  it('raises the gap when the vet’s own number is still the newest one', () => {
    const lastVisitAt = new Date(NOW - 30 * DAY).toISOString().slice(0, 10);
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: { courses: [], medItemNames: NAMES, lastVisitAt, weighIns: [weighIn(60)] },
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('weight');
    // THE CLAIM leads and the range supports it: read aloud, item four of *Worth
    // raising* used to be "4.0–4.2 kg", a range over up to sixty readings, with the
    // actual thing worth raising in fine print underneath.
    expect(rows[0].text).toContain('Last weighed');
    expect(rows[0].text).toContain('before the last visit');
    expect(rows[0].detail).toContain('4.0–4.2 kg');
  });

  it('stays silent when the pet HAS been weighed since the last visit', () => {
    const lastVisitAt = new Date(NOW - 30 * DAY).toISOString().slice(0, 10);
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: { courses: [], medItemNames: NAMES, lastVisitAt, weighIns: [weighIn(10)] },
        }),
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it('states no DURATION anywhere — a duration would inherit a window this page never opened', () => {
    const lastVisitAt = new Date(NOW - 30 * DAY).toISOString().slice(0, 10);
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: { courses: [], medItemNames: NAMES, lastVisitAt, weighIns: [weighIn(94)] },
        }),
      }),
    );
    const printed = `${rows[0].text} ${rows[0].detail ?? ''}`;
    // C-19: a record-anchored date is free; "no weigh-in in 94 days" is a duration,
    // and there is no constant in this app that says how long is too long.
    expect(printed).not.toMatch(/\b\d+\s*(days?|weeks?|months?)\b/i);
  });

  it('under-fires rather than over-claiming when there is no prior visit', () => {
    // Gate 2 is answered against the record, and a first-time owner has no visit for
    // it to be answered against. Silence is the direction this page may be wrong in.
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: { courses: [], medItemNames: NAMES, lastVisitAt: null, weighIns: [weighIn(400)] },
        }),
      }),
    );
    expect(rows).toHaveLength(0);
  });
});

describe('the B-789 suppression is inherited, not re-derived', () => {
  // Only the three fields the suppression switches on are asserted; the rest of
  // `TrialResponseFinding` is carried as the real shape requires it.
  const TRIAL_RESPONSE = {
    type: 'trial_response',
    priorityClass: 'insight',
    comparisonDirection: 'fewer_during_trial',
  } as unknown as SignalFinding;

  const reassuring = finding({ text: 'Vomiting: 0 in the trial’s 20 days · 20 in the 7 weeks before.', rank: 1, finding: TRIAL_RESPONSE });

  it('withholds the reassuring trial card over a not-eating record, exactly as Home does', () => {
    // The hazard: a cat refusing the prescribed diet from day 1 has uniform-low
    // intake, so the relative-decline detector never fires. Home withholds this
    // sentence; re-deriving "the leading findings" here would bring it back as a
    // thing to RAISE WITH A VET, over a starving cat.
    const { rows } = buildWorthRaising(input({ findings: [reassuring], suppressTrialResponse: true }));
    expect(rows).toHaveLength(0);
  });

  it('lets it through when the record shows no refusal', () => {
    const { rows } = buildWorthRaising(input({ findings: [reassuring], suppressTrialResponse: false }));
    expect(rows).toHaveLength(1);
  });
});

// ── The adversarial pass's findings, each pinned (CUL-903, 2026-09-11) ────────────

describe('the ordering keeps the Signal band above the two weakest rows', () => {
  it('does not cap an Established correlation off the page to make room for a weight date', () => {
    // The measured case: a wedge owner's record with a trial, an unterminated course
    // and a weight gap. The first ordering gave three of four optional slots to the
    // trial, the course and the weight, leaving ONE for the whole insight band — and a
    // stand-down marker ranks at the top of that band, so the app's single most
    // actionable sentence did not reach the page read aloud in the exam room.
    const standDown = finding({
      text: 'No vomiting logged for Mochi in 14 days.',
      rank: 1,
      finding: {
        type: 'stood_down',
        priorityClass: 'insight',
        symptomType: 'vomit',
        recencyDays: 14,
        tier: 'standard',
        lastEpisodeIso: new Date(NOW - 20 * DAY).toISOString(),
        stoodDownAt: new Date(NOW - 1 * DAY).toISOString(),
        formerRank: 1,
      } satisfies SignalFinding,
    });
    const correlation = finding({
      text: 'Chicken shows up before Mochi’s vomiting — 7 of 9 episodes.',
      rank: 2,
    });
    const lastVisitAt = new Date(NOW - 40 * DAY).toISOString().slice(0, 10);

    const { rows } = buildWorthRaising(
      input({
        findings: [
          finding({ text: 'Mochi has finished 2 of 6 meals rated since Tuesday.', rank: 0, finding: SAFETY }),
          standDown,
          correlation,
        ],
        trialStrip: {
          header: 'Hydrolyzed trial · day 23 of 56',
          line: 'Royal Canin HP · ends Oct 12 · meals logged on 20 of 23 days',
          progressFraction: 0.41,
          trialResponseLine: null,
        },
        rundown: rundown({
          facts: {
            courses: [course()],
            medItemNames: NAMES,
            lastVisitAt,
            weighIns: [weighIn(200)],
          },
        }),
      }),
    );

    const texts = rows.map((r) => r.text);
    expect(texts[0]).toContain('2 of 6 meals'); // safety still leads, above the cap
    expect(texts).toContain(correlation.text);
    // The stand-down stays too — the issue's own counterexample expects it, and its
    // copy refuses to reassure. It is the WEIGHT row that yields.
    expect(texts).toContain(standDown.text);
    expect(rows.some((r) => r.source === 'weight')).toBe(false);
  });
});

describe('the course row asks a question the record can actually answer', () => {
  it('ignores a ONE-OFF PRN dose — the row’s question is fabricated about it', () => {
    // One tablet given yesterday is a PRN dose, and *is she still meant to be on this?*
    // is not a question the record is posing about it. The boundary is the course's own
    // count, not a threshold over a window.
    const oneOff = course({ dosesLogged: 1 });
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: { courses: [oneOff], medItemNames: NAMES, lastVisitAt: null, weighIns: [weighIn(5)] },
        }),
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it('does not let a one-off dose suppress the repeated run behind it', () => {
    // An earlier cut took the FIRST match of any kind and returned null when it could
    // not name it, so the row in front masked the one behind — while the rundown's
    // past-meds block, printed directly below, named them both.
    const oneOff = course({
      key: 'item:unspecified',
      medicationItemId: null,
      dosesLogged: 1,
      lastDoseIso: new Date(NOW - 1 * DAY).toISOString(),
    });
    const repeated = course({ dosesLogged: 9 });
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: {
            courses: [oneOff, repeated],
            medItemNames: NAMES,
            lastVisitAt: null,
            weighIns: [weighIn(5)],
          },
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain('Cerenia');
    expect(rows[0].text).toContain('9 doses');
  });
});

describe('the weight gate refuses a future "last visit"', () => {
  it('stays silent when the last visit has not happened yet', () => {
    // `facts.lastVisitAt` is `readLastVisitDate`'s unbounded MAX(visited_at), which
    // CLAUDE.md names as undefended — and CUL-946 puts a tomorrow-dated row there for
    // every visit logged after ~5pm PDT. Without the bound this printed
    // "Last weighed <today> — before the last visit" over a pet weighed an hour ago.
    const tomorrow = new Date(NOW + DAY).toISOString().slice(0, 10);
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: {
            courses: [],
            medItemNames: NAMES,
            lastVisitAt: tomorrow,
            weighIns: [weighIn(0)],
          },
        }),
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it('still fires for a visit strictly before today', () => {
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: {
            courses: [],
            medItemNames: NAMES,
            lastVisitAt: new Date(NOW - 2 * DAY).toISOString().slice(0, 10),
            weighIns: [weighIn(30)],
          },
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('weight');
  });
});

describe('the screen no longer deletes a denominator', () => {
  it('keeps the trial’s coverage line when the FOOD is named "the kibble she prefers"', () => {
    // The blanket screen nulled the detail of any tripping row, so a real coverage
    // denominator vanished over a word in a food name — silently, with no test.
    const line = 'The kibble she prefers · ends Oct 12 · meals logged on 20 of 23 days';
    const { rows } = buildWorthRaising(
      input({
        trialStrip: {
          header: 'Hydrolyzed trial · day 23 of 56',
          line,
          progressFraction: 0.41,
          trialResponseLine: null,
        },
      }),
    );
    expect(rows[0].detail).toBe(line);
  });
});

describe('the course window runs on the RUNDOWN’s clock, not a fresh one', () => {
  it('shows the same courses the block below it shows', () => {
    // `splitPastCourses` windows at 12 months. Reading `Date.now()` here opened a SECOND
    // window over the population the rundown block had already split, so Worth raising
    // could disagree with the rows printed directly under it about which courses exist.
    //
    // The first version of this test could not see it: both clocks were `NOW` in every
    // fixture, so the mutation that swapped them changed nothing. The two are separated
    // here, and the course is placed in the gap between the two cutoffs — shown under
    // the rundown's clock, folded under a fresh one.
    const generatedAtMs = NOW - 30 * DAY;
    const cutoffRundown = medHistoryCutoffMs(generatedAtMs);
    const cutoffFresh = medHistoryCutoffMs(NOW);
    expect(cutoffRundown).toBeLessThan(cutoffFresh); // the premise

    const inTheGap = new Date((cutoffRundown + cutoffFresh) / 2).toISOString();
    const borderline = course({ drugName: 'Prednisolone', lastDoseIso: inTheGap });

    const { rows } = buildWorthRaising(
      input({
        nowMs: NOW,
        rundown: rundown({
          generatedAtMs,
          facts: {
            courses: [borderline],
            medItemNames: NAMES,
            lastVisitAt: null,
            weighIns: [weighIn(5)],
          },
        }),
      }),
    );
    expect(rows.map((r) => r.text)).toEqual([
      expect.stringContaining('Prednisolone'),
    ]);
  });
});

// ── The RE-RUN's findings (CUL-903, 2026-09-11 — C-19's re-falsification) ─────────

describe('the device’s OWN intake decline is a row, and survives with no network', () => {
  // What `loadDietTrialFacts` hands over for a cat whose device holds a single-day
  // decline: the flag's identity and the sentence `declineHeadline` wrote for it. The
  // headline was "left most of their food for 3 days" until CUL-950 — a sentence the
  // detector cannot produce for a cat (its count is 1, "today").
  const LOCAL = intakeDeclineFacts([catLowFlag()], 'Mochi');
  const HEADLINE = LOCAL[0].headline;

  it('renders it as a SAFETY row even when the Signal cache is unreachable', () => {
    // The measured failure: a cat on day 12 of a hydrolyzed trial whose device holds
    // `consecutive_low` (recorded then as `daysBelowBaseline: 3`; it is 1) — the 48-hour feline hepatic-lipidosis
    // window — with the cache offline. Worth raising rendered ONE row, the trial's day
    // count, under a gap line asserting the local half of this page was complete.
    //
    // `resolveTrialStrip` discards the headline on purpose (on Home the Signal card
    // above owns it). Get ready has no Signal card above it.
    const { rows, signalUnavailable } = buildWorthRaising(
      input({
        findings: null,
        intakeDecline: LOCAL,
        trialStrip: {
          header: 'Diet trial · day 12 of 42',
          line: null,
          progressFraction: 0.28,
          trialResponseLine: null,
        },
      }),
    );
    expect(signalUnavailable).toBe(true);
    expect(rows[0].text).toBe(HEADLINE);
    expect(rows[0].isSafety).toBe(true);
    expect(rows[0].source).toBe('intake');
    // CUL-953 item 5. This read "from this device's record", which carried an
    // implementation fact — this row comes from SQLite, the Signal's from a network
    // cache — into the label on the page most likely to be read aloud in a
    // consulting room. The local-vs-cached split is real and stays argued in the
    // source; it is not a distinction the owner has, and "this device's" reads as a
    // hedge about whether the record is the whole record. Plain, and identical to
    // its siblings, because the owner meets one record.
    expect(rows[0].sourceLabel).toBe('from the record');
  });

  it('never labels the row in implementation language', () => {
    // The defect was one WORD of provenance vocabulary on a safety row, so the
    // assertion is about the register rather than the exact string: no label on this
    // page may name a device, a cache, a table or a sync state.
    const { rows } = buildWorthRaising(input({ intakeDecline: LOCAL }));
    for (const row of rows) {
      expect(row.sourceLabel).not.toMatch(/device|cache|local|sync|database|table/i);
    }
  });

  it('keeps it above the cap, like any other safety row', () => {
    const benign = Array.from({ length: 9 }, (_, i) => finding({ text: `Benign ${i}.`, rank: i + 1 }));
    const { rows } = buildWorthRaising(input({ findings: benign, intakeDecline: LOCAL }));
    expect(rows[0].text).toBe(HEADLINE);
    expect(rows.length).toBeGreaterThan(WORTH_RAISING_CAP);
  });

  it('is absent when the device holds no decline', () => {
    const { rows } = buildWorthRaising(input({ intakeDecline: [] }));
    expect(rows.some((r) => r.source === 'intake')).toBe(false);
  });
});

describe('at most ONE stand-down marker', () => {
  it('does not spend two capped slots saying nothing happened', () => {
    // `mergeStandDowns` ranks every marker at the TOP of the insight band, so a GI pet
    // whose chronic vomiting AND chronic loose stool both quieted during the trial — the
    // wedge case — pushed an Established correlation off a page where it has no second
    // home. The rundown block has a tile for timing and none for a correlation.
    const marker = (symptom: 'vomit' | 'diarrhea', rank: number) =>
      finding({
        text: `${symptom} has been quiet for 14 days. That isn't an all-clear.`,
        rank,
        finding: {
          type: 'stood_down',
          priorityClass: 'insight',
          symptomType: symptom,
          recencyDays: 14,
          tier: 'standard',
          lastEpisodeIso: new Date(NOW - 20 * DAY).toISOString(),
          stoodDownAt: new Date(NOW - 1 * DAY).toISOString(),
          formerRank: rank,
        } satisfies SignalFinding,
      });
    const correlation = finding({
      text: 'Vomiting has followed chicken on 5 of 7 days it was eaten.',
      rank: 3,
    });

    const { rows } = buildWorthRaising(
      input({
        findings: [marker('vomit', 0), marker('diarrhea', 1), correlation],
        trialStrip: {
          header: 'Rabbit trial · day 23 of 56',
          line: null,
          progressFraction: 0.41,
          trialResponseLine: null,
        },
      }),
    );
    expect(rows.filter((r) => r.text.includes("isn't an all-clear"))).toHaveLength(1);
    expect(rows.map((r) => r.text)).toContain(correlation.text);
  });
});

describe('one clock, everywhere in this module', () => {
  it('judges "today" for the weight gate on the RUNDOWN’s clock, not the wall clock', () => {
    // A third clock: the gate read `new Date()` while the sentence printed off
    // `generatedAtMs`, so the CUL-946 bound could not be pinned by a fixture at all.
    const generatedAtMs = NOW - 10 * DAY;
    // Five days AFTER the rundown was built — the CUL-946 shape relative to the row's
    // own clock — but still in the past on the wall clock.
    const lastVisitAt = new Date(NOW - 5 * DAY).toISOString().slice(0, 10);
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          generatedAtMs,
          facts: {
            courses: [],
            medItemNames: NAMES,
            lastVisitAt,
            weighIns: [weighIn(300)],
          },
        }),
      }),
    );
    expect(rows.some((r) => r.source === 'weight')).toBe(false);
  });
});

// ── CUL-950: one decline, one row — and never a suppression ───────────────────────
//
// The device and the Signal run the same intake detector, so on a reachable cache
// they usually say the same thing, and the list printed one hunger strike twice. The
// fix drops a device decline ONLY when a Signal row on this list states the same
// decline (the trigger; for a refusal, the food too). Every case below is a record
// run through the real detector, with the Signal's side computed at an earlier clock
// over an earlier record — the way a cache Get ready never refreshes goes stale.
//
// Proven by mutation, each rule red on the case named for it: no dedupe, dedupe on
// "the cache answered", dedupe on any intake decline, trigger-only identity, a
// nameless refusal never matching, no case fold, an unknown decline matching, both
// placement shortcuts, and a swapped engine order.
//
// STATED BLIND SPOT (C-36): the merge reads the Signal rows this list RETURNS, not
// `input.findings`. Today the two are the same set of intake declines —
// `visibleFindings` removes only a suppressed trial response and an expired stand-down
// — so a mutant reading the raw findings survives every case here, and no fixture a
// caller can produce tells them apart. The tripwire at the end of this block reds if
// that premise ever changes, which is the moment the difference starts to matter.

describe('CUL-950 — a decline the Signal already states is printed once, the Signal’s', () => {
  it('the reported bug: the same decline on both sides renders ONE row, the Signal’s sentence', () => {
    const record = [...baseline(), meal(0, 8, SALMON, 'picked'), meal(0, 10, SALMON, 'picked')];
    const flags = detect(record, DETECT_NOW);
    expect(flags.map((f) => f.trigger)).toEqual(['consecutive_low']); // the premise
    const findings = signalFrom(flags); // a fresh cache over the same record

    const { rows } = buildWorthRaising(
      input({ findings, intakeDecline: intakeDeclineFacts(flags, 'Mochi') }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe(findings[0].text);
    expect(rows[0].source).toBe('signal');
  });

  it('both triggers on both sides: the Signal’s two rows, and none of the device’s', () => {
    // A cat that refused her usual food yesterday AND ate little today. The server
    // emits the two as two findings; the device holds the same two.
    const record = [
      ...baseline(),
      meal(1, 8, CHICKEN, 'refused'),
      meal(1, 9, SALMON, 'all'),
      meal(1, 10, SALMON, 'all'),
      meal(0, 8, SALMON, 'picked'),
      meal(0, 10, SALMON, 'picked'),
    ];
    const flags = detect(record, DETECT_NOW);
    expect(flags.map((f) => f.trigger).sort()).toEqual(['consecutive_low', 'refused_normal_food']);
    const findings = signalFrom(flags);

    const { rows } = buildWorthRaising(
      input({ findings, intakeDecline: intakeDeclineFacts(flags, 'Mochi') }),
    );
    expect(rows.map((r) => r.text)).toEqual(findings.map((f) => f.text));
    expect(rows.every((r) => r.source === 'signal')).toBe(true);
  });
});

describe('CUL-950 — a decline the Signal does NOT state is never dropped', () => {
  // The panel's deciding case and the adversarial pass's counterexample. Yesterday
  // the cat refused her usual Chicken Pâté but finished the rest, and the cache was
  // written then. Today she ate little — logged offline, or rated after the fact,
  // neither of which regenerates the cache. For a cat, one low day is the first day
  // of the 48-hour window.
  const yesterday = [
    ...baseline(),
    meal(1, 8, CHICKEN, 'refused'),
    meal(1, 9, SALMON, 'all'),
    meal(1, 10, SALMON, 'all'),
  ];
  const today = [...yesterday, meal(0, 8, SALMON, 'picked'), meal(0, 10, SALMON, 'picked')];

  it('premise: the cache holds only the refusal, the device holds the refusal AND today’s decline', () => {
    expect(detect(yesterday, CACHE_NOW).map((f) => f.trigger)).toEqual(['refused_normal_food']);
    expect(detect(today, DETECT_NOW).map((f) => f.trigger)).toEqual([
      'consecutive_low',
      'refused_normal_food',
    ]);
  });

  it('keeps today’s decline beside the Signal’s refusal, and drops only the duplicate refusal', () => {
    const findings = signalFrom(detect(yesterday, CACHE_NOW));
    const local = intakeDeclineFacts(detect(today, DETECT_NOW), 'Mochi');
    const { rows } = buildWorthRaising(input({ findings, intakeDecline: local }));

    // The engine's order: the refusal, then the decline — as Home ranks them.
    expect(rows.map((r) => [r.source, r.text])).toEqual([
      ['signal', findings[0].text],
      ['intake', 'Mochi has eaten less than usual today.'],
    ]);
    expect(rows.every((r) => r.isSafety)).toBe(true);
  });

  it('keeps a refusal of a DIFFERENT food — two foods in two days is not one fact', () => {
    // Yesterday: Chicken Pâté refused (the cache). Today: the owner opened the Salmon
    // Loaf and she refused that too, while finishing her Chicken. Dr. Chen: the move
    // from one food to several is the move from aversion to anorexia.
    const record = [
      ...yesterday,
      meal(0, 8, SALMON, 'refused'),
      meal(0, 9, CHICKEN, 'all'),
      meal(0, 10, CHICKEN, 'all'),
    ];
    const cache = detect(yesterday, CACHE_NOW);
    const device = detect(record, DETECT_NOW);
    expect(device.map((f) => [f.trigger, f.refusedFoodLabel])).toEqual([
      ['refused_normal_food', SALMON.label],
    ]);

    const findings = signalFrom(cache);
    const { rows } = buildWorthRaising(
      input({ findings, intakeDecline: intakeDeclineFacts(device, 'Mochi') }),
    );
    expect(rows.map((r) => [r.source, r.text])).toEqual([
      ['signal', findings[0].text],
      ['intake', 'Mochi just turned down Purina Salmon Loaf, which Mochi normally eats.'],
    ]);
  });

  it('places a device refusal AHEAD of a Signal decline — the engine’s order, not the source’s', () => {
    // The reverse: the cache holds yesterday's low day, the device holds today's refusal.
    const lowYesterday = [
      ...baseline(),
      meal(1, 8, CHICKEN, 'picked'),
      meal(1, 10, SALMON, 'picked'),
    ];
    const record = [
      ...lowYesterday,
      meal(0, 8, SALMON, 'refused'),
      meal(0, 9, CHICKEN, 'all'),
      meal(0, 10, CHICKEN, 'all'),
    ];
    const cache = detect(lowYesterday, CACHE_NOW);
    const device = detect(record, DETECT_NOW);
    expect(cache.map((f) => f.trigger)).toEqual(['consecutive_low']);
    expect(device.map((f) => f.trigger)).toEqual(['refused_normal_food']);

    const findings = signalFrom(cache);
    const { rows } = buildWorthRaising(
      input({ findings, intakeDecline: intakeDeclineFacts(device, 'Mochi') }),
    );
    expect(rows.map((r) => [r.source, r.text])).toEqual([
      ['intake', 'Mochi just turned down Purina Salmon Loaf, which Mochi normally eats.'],
      ['signal', findings[0].text],
    ]);
  });

  it('still gives the optional rows all four slots when two intake rows lead', () => {
    const findings = [
      ...signalFrom(detect(yesterday, CACHE_NOW)),
      ...Array.from({ length: 9 }, (_, i) => finding({ text: `Benign ${i}.`, rank: 10 + i })),
    ];
    const { rows } = buildWorthRaising(
      input({ findings, intakeDecline: intakeDeclineFacts(detect(today, DETECT_NOW), 'Mochi') }),
    );
    expect(rows.filter((r) => r.isSafety)).toHaveLength(2);
    expect(rows.filter((r) => !r.isSafety)).toHaveLength(WORTH_RAISING_CAP);
  });
});

describe('CUL-950 — the device’s rows when the Signal has no intake row to state', () => {
  // The record: a cat that ate little today and refused her Chicken Pâté yesterday.
  const record = [
    ...baseline(),
    meal(1, 8, CHICKEN, 'refused'),
    meal(1, 9, SALMON, 'all'),
    meal(1, 10, SALMON, 'all'),
    meal(0, 8, SALMON, 'picked'),
    meal(0, 10, SALMON, 'picked'),
  ];
  const local = () => intakeDeclineFacts(detect(record, DETECT_NOW), 'Mochi');
  const DEVICE_ROWS = [
    'Mochi just turned down Purina Chicken Pâté, which Mochi normally eats.',
    'Mochi has eaten less than usual today.',
  ];

  it('cache unreachable: EVERY device decline renders, in the engine’s order', () => {
    // The (A) ruling: not `flags[0]` alone. Reading only the first flag printed "eaten
    // less than usual today" and never mentioned the refused food.
    const { rows, signalUnavailable } = buildWorthRaising(
      input({ findings: null, intakeDecline: local() }),
    );
    expect(signalUnavailable).toBe(true);
    expect(rows.map((r) => r.text)).toEqual(DEVICE_ROWS);
    expect(rows.every((r) => r.source === 'intake' && r.isSafety)).toBe(true);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length); // distinct React keys
  });

  it('cache answered with NOTHING (the evidence was not there yet): the device rows render', () => {
    // Written before either decline existed — the aged-out / not-yet-in shape. "The
    // cache answered" is not the test; a Signal row stating the decline is.
    const cache = detect(baseline(), CACHE_NOW);
    expect(cache).toEqual([]);
    const { rows, signalUnavailable } = buildWorthRaising(
      input({ findings: signalFrom(cache), intakeDecline: local() }),
    );
    expect(signalUnavailable).toBe(false);
    expect(rows.map((r) => r.text)).toEqual(DEVICE_ROWS);
  });

  it('cache answered with a DIFFERENT safety finding: the device rows still render, and lead', () => {
    const redFlag = finding({
      text: 'Mochi’s vomit on Tuesday had what looked like blood in it — worth a call to your vet.',
      rank: 0,
      finding: {
        type: 'incident_red_flag',
        priorityClass: 'safety',
        incidentType: 'vomit',
        flags: ['blood'],
        mostRecentFlaggedIso: new Date(DETECT_NOW - 2 * DAY).toISOString(),
        flaggedIncidentCount: 1,
        windowDays: 14,
      } satisfies SignalFinding,
    });
    const { rows } = buildWorthRaising(input({ findings: [redFlag], intakeDecline: local() }));
    expect(rows.map((r) => r.text)).toEqual([...DEVICE_ROWS, redFlag.text]);
  });

  it('neither side holds a decline: no intake row at all', () => {
    const quiet = detect(baseline(), DETECT_NOW);
    expect(quiet).toEqual([]);
    for (const findings of [signalFrom(detect(baseline(), CACHE_NOW)), null]) {
      const { rows } = buildWorthRaising(
        input({ findings, intakeDecline: intakeDeclineFacts(quiet, 'Mochi') }),
      );
      expect(rows.some((r) => r.source === 'intake')).toBe(false);
    }
  });
});

describe('CUL-950 — what counts as the SAME refused food', () => {
  const refusedYesterday = (chicken: { id: string; label: string | null }) => [
    ...baseline(chicken),
    meal(1, 8, chicken, 'refused'),
    meal(1, 9, SALMON, 'all'),
    meal(1, 10, SALMON, 'all'),
  ];
  // The server's side always names the food: `brand` and `product_name` are NOT NULL.
  const findings = () => signalFrom(detect(refusedYesterday(CHICKEN), CACHE_NOW));
  const deviceSeeing = (chicken: { id: string; label: string | null }) =>
    intakeDeclineFacts(detect(refusedYesterday(chicken), DETECT_NOW), 'Mochi');

  it('a device refusal with NO food name (its food cache lacks the item) matches the Signal’s refusal', () => {
    const local = deviceSeeing({ id: CHICKEN.id, label: null });
    expect(local.map((l) => [l.trigger, l.refusedFoodLabel])).toEqual([['refused_normal_food', null]]);
    const { rows } = buildWorthRaising(input({ findings: findings(), intakeDecline: local }));
    // One refusal, read once — not "Chicken Pâté" and "a food they usually finish".
    expect(rows.map((r) => r.source)).toEqual(['signal']);
  });

  it('a label that differs only in case is the same food', () => {
    const { rows } = buildWorthRaising(
      input({ findings: findings(), intakeDecline: deviceSeeing({ id: CHICKEN.id, label: 'purina chicken PÂTÉ' }) }),
    );
    expect(rows.map((r) => r.source)).toEqual(['signal']);
  });

  it('a RENAMED food shows both rows — the known leftover, and the safe direction', () => {
    // The device's cache has the new name, the Signal's sentence the old one. The
    // label is the only identity the Signal's finding carries, so the rename reads as
    // two foods: an extra row the owner can see, never a dropped one.
    const { rows } = buildWorthRaising(
      input({
        findings: findings(),
        intakeDecline: deviceSeeing({ id: CHICKEN.id, label: 'Purina Chicken Pâté Kitten' }),
      }),
    );
    expect(rows.map((r) => r.source)).toEqual(['signal', 'intake']);
  });
});

describe('CUL-950 — an input with no decline facts behind its sentence', () => {
  const headline = 'Mochi has eaten less than usual today.';

  it('adapts the trial input: facts when present, an UNKNOWN decline for a bare sentence, nothing for none', () => {
    const facts = intakeDeclineFacts([catLowFlag()], 'Mochi');
    expect(localIntakeDeclines({ intakeDeclineHeadline: headline, intakeDeclineFacts: facts })).toEqual(facts);
    expect(localIntakeDeclines({ intakeDeclineHeadline: headline })).toEqual([
      { trigger: null, refusedFoodLabel: null, headline },
    ]);
    expect(localIntakeDeclines({ intakeDeclineHeadline: null })).toEqual([]);
    expect(localIntakeDeclines(null)).toEqual([]);
  });

  it('an unknown decline is never dropped, even beside the same sentence from the Signal', () => {
    // The failure the missing field is allowed to cause is an EXTRA row. It may never
    // be a missing one.
    const findings = signalFrom([catLowFlag()]);
    const { rows } = buildWorthRaising(
      input({ findings, intakeDecline: localIntakeDeclines({ intakeDeclineHeadline: headline }) }),
    );
    expect(rows.map((r) => r.source)).toEqual(['intake', 'signal']);
  });
});

describe('CUL-950 — the intake order is the ENGINE’s, pinned to its source (C-34)', () => {
  it('matches `rankFindings`’ intake comparator in generate-signal/detection.ts', () => {
    // A mirrored constant answering the same question, so it is read off the source
    // rather than trusted to drift together. CUL-1084 proposes swapping the engine's
    // order; when it does, this reds until Get ready moves with it.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../supabase/functions/generate-signal/detection.ts'),
      'utf8',
    );
    const block = /x\.type === 'intake_decline' && y\.type === 'intake_decline'\)\s*\{\s*const order: Record<IntakeDeclineTrigger, number> = \{([^}]*)\}/.exec(
      src,
    );
    expect(block).not.toBeNull();
    const engine = Object.fromEntries(
      Array.from((block as RegExpExecArray)[1].matchAll(/(\w+):\s*(\d+)/g), (m) => [m[1], Number(m[2])]),
    );
    expect(engine).toEqual(INTAKE_TRIGGER_ORDER);
  });
});

describe('CUL-950 — the premise the blind spot above rests on', () => {
  it('`visibleFindings` never withholds an intake decline, under either suppression state', () => {
    // If this ever reds, the Signal's returned rows and its raw findings stop being the
    // same set of intake declines. The merge already reads the returned rows, so it
    // stays correct — but the survived mutant above starts to matter, and the case
    // that separates the two can finally be written. Write it then.
    const findings = signalFrom(
      detect(
        [
          ...baseline(),
          meal(1, 8, CHICKEN, 'refused'),
          meal(1, 9, SALMON, 'all'),
          meal(1, 10, SALMON, 'all'),
          meal(0, 8, SALMON, 'picked'),
          meal(0, 10, SALMON, 'picked'),
        ],
        DETECT_NOW,
      ),
    );
    expect(findings).toHaveLength(2);
    for (const suppress of [true, false]) {
      expect(visibleFindings(findings, suppress, DETECT_NOW)).toEqual(findings);
    }
  });
});
