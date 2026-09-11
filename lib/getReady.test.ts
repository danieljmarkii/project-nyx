// The env boundary: `lib/rundown` reaches `lib/supabase` through the analytics chain,
// and that module throws at IMPORT when the anon key is unset. Nothing under test
// calls it — `buildWorthRaising` is pure and takes every input — so a bare stub is
// enough. Declared before the imports because `jest.mock` is hoisted anyway, and
// writing it here keeps the reason next to the thing it explains.
jest.mock('./supabase', () => ({ supabase: {} }));

import { buildWorthRaising, WORTH_RAISING_CAP } from './getReady';
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
      medItemNames: new Map(),
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
  daysBelowBaseline: 3,
  refusedFoodLabel: null,
  ratedMealsConsidered: 8,
} satisfies SignalFinding;

function input(over: Partial<WorthRaisingInput> = {}): WorthRaisingInput {
  return {
    findings: [],
    suppressTrialResponse: false,
    trialStrip: null,
    rundown: rundown(),
    nowMs: NOW,
    ...over,
  };
}

function course(over: Partial<MedicationCourse> = {}): MedicationCourse {
  const lastDose = new Date(NOW - 7 * DAY).toISOString();
  return {
    key: 'c1',
    source: 'regimen',
    regimenId: 'r1',
    medicationItemId: null,
    drugName: 'Cerenia',
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
      input({ rundown: rundown({ facts: { courses: [course()], medItemNames: new Map(), lastVisitAt: null, weighIns: [weighIn(5)] } }) }),
    );
    expect(rows[0].text).toContain('Cerenia');
    expect(rows[0].text).toContain('9 doses');
    expect(rows[0].detail).toBe('No end recorded');
    expect(rows[0].sourceLabel).toBe('from the course');
  });

  it('never raises a course the owner DID end — that question is answered', () => {
    const ended = course({
      end: {
        kind: 'ended',
        status: 'completed',
        endedAt: new Date(NOW - 5 * DAY).toISOString().slice(0, 10),
      } satisfies MedicationCourseEnd,
    });
    const { rows } = buildWorthRaising(
      input({ rundown: rundown({ facts: { courses: [ended], medItemNames: new Map(), lastVisitAt: null, weighIns: [weighIn(5)] } }) }),
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
      input({ rundown: rundown({ facts: { courses: [named], medItemNames: new Map(), lastVisitAt: null, weighIns: [weighIn(5)] } }) }),
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
          facts: { courses: [], medItemNames: new Map(), lastVisitAt, weighIns: [weighIn(60)] },
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('weight');
    expect(rows[0].detail).toContain('Last weighed');
    expect(rows[0].detail).toContain('before the last visit');
  });

  it('stays silent when the pet HAS been weighed since the last visit', () => {
    const lastVisitAt = new Date(NOW - 30 * DAY).toISOString().slice(0, 10);
    const { rows } = buildWorthRaising(
      input({
        rundown: rundown({
          facts: { courses: [], medItemNames: new Map(), lastVisitAt, weighIns: [weighIn(10)] },
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
          facts: { courses: [], medItemNames: new Map(), lastVisitAt, weighIns: [weighIn(94)] },
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
          facts: { courses: [], medItemNames: new Map(), lastVisitAt: null, weighIns: [weighIn(400)] },
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
