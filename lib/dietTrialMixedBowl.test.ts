// Mixed meals row 3 (CUL-2052) — the trial predicate reads a BOWL.
//
// Spec docs/nyx-mixed-meals-requirements.md §5.2 (one bowl, worst component, counted
// once), §6 (the transition, derived at read) and §10 "Clinical readers". Every test
// in the "pass 1" block was committed failing before the code that turns it green:
// each one is a break the spec-stage adversarial pass found (break N in the spec).
//
// Same fixture world as `dietTrial.test.ts`: a duck trial started 1 July 2026.
import {
  buildTrialContext,
  classifyFeeding,
  computeTrialFacts,
  deriveTrialTransition,
  mayClaimAllMatched,
  newFoodsIntroduced,
  type AllowedFood,
  type TrialFeeding,
  type TrialFeedingComponent,
  type TrialSpec,
} from './dietTrial';
import { localDayIndexOf } from './utils';

const TRIAL: TrialSpec = {
  id: 'trial-1',
  startedAt: '2026-07-01',
  targetDurationDays: 56,
  species: 'dog',
};

/** Local noon on a local day: never a UTC literal (C-29). */
function at(day: string, hour = 12, minute = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0).toISOString();
}

function food(over: Partial<AllowedFood> & Pick<AllowedFood, 'foodItemId'>): AllowedFood {
  return {
    foodKey: null,
    label: 'Food',
    role: 'primary_diet',
    allowedFrom: '2026-07-01',
    allowedUntil: null,
    primaryProtein: null,
    proteins: [],
    ...over,
  };
}

const DUCK = food({
  foodItemId: 'duck',
  foodKey: 'rcduck dry',
  label: 'RC Duck Dry',
  primaryProtein: 'duck',
  proteins: ['duck'],
});
const RABBIT_ON_LIST = food({
  foodItemId: 'rabbit-a',
  foodKey: 'brand arabbit',
  label: 'Brand A Rabbit',
  primaryProtein: 'rabbit',
  proteins: ['rabbit'],
});
const ALLOWED = [DUCK];
const ctx = (allowed: readonly AllowedFood[] = ALLOWED, trial: TrialSpec = TRIAL) =>
  buildTrialContext(trial, allowed);

/** A component as the server adapter hands it over. */
function part(over: Partial<TrialFeedingComponent> & Pick<TrialFeedingComponent, 'foodItemId'>): TrialFeedingComponent {
  return {
    foodKey: null,
    label: 'Food',
    foodType: 'meal',
    proteins: [],
    share: null,
    ...over,
  };
}

const DUCK_PART = part({ foodItemId: 'duck', foodKey: 'rcduck dry', label: 'RC Duck Dry', proteins: ['duck'] });
const CHICKEN_PART = part({ foodItemId: 'chicken', foodKey: 'pate chicken', label: 'Chicken Pâté', proteins: ['chicken'] });

/** A mixed bowl: the parent names no food (T2), the components carry identity. */
function bowl(eventId: string, occurredAt: string, parts: TrialFeedingComponent[], intakeRating?: string): TrialFeeding {
  return {
    eventId,
    occurredAt,
    foodItemId: null,
    foodKey: null,
    label: parts.map((p) => p.label).join(' + '),
    foodType: 'meal',
    proteins: [],
    intakeRating,
    components: parts,
  };
}

function plain(eventId: string, occurredAt: string, f: TrialFeedingComponent, intakeRating?: string): TrialFeeding {
  return {
    eventId,
    occurredAt,
    foodItemId: f.foodItemId,
    foodKey: f.foodKey,
    label: f.label,
    foodType: f.foodType,
    proteins: [...f.proteins],
    intakeRating,
  };
}

const day = (iso: string) => localDayIndexOf(iso) as number;

// ── Pass 1 fixtures (each landed failing first) ───────────────────────────────

describe('pass 1 — the breaks the spec-stage adversarial pass found', () => {
  // Break 1. The bowl verdict is off-diet (chicken), so a lane fed only by
  // `role === 'primary_diet'` never sees these bowls; the two plain bowls eaten
  // then make the narrow population look healthy.
  it('refused mixed trial bowls on days 1–14 with two eaten plain bowls fire the refusal lane', () => {
    const feedings: TrialFeeding[] = [];
    for (let d = 1; d <= 14; d++) {
      const dd = `2026-07-${String(d).padStart(2, '0')}`;
      feedings.push(bowl(`b${d}`, at(dd, 8), [{ ...DUCK_PART, share: 0.75 }, { ...CHICKEN_PART, share: 0.25 }], 'refused'));
    }
    // The two plain bowls come FIRST, so they are the trial diet's first match and no
    // pre-match record can hold the lane on the meal record (CUL-1993's hold).
    feedings.push(plain('p1', at('2026-07-01', 6), DUCK_PART, 'all'));
    feedings.push(plain('p2', at('2026-07-01', 7), DUCK_PART, 'all'));
    const facts = computeTrialFacts({
      trial: { ...TRIAL, species: 'cat' },
      allowedFoods: ALLOWED,
      feedings,
      nowMs: new Date(2026, 6, 14, 22).getTime(),
    });
    expect(facts.trialDietRefusal).not.toBeNull();
    expect(facts.trialDietRefusal?.population).toBe('trial_diet');
  });

  // Break 4. An installed older build reads a mix as a meal naming no food (T2).
  it('an older-build reader over a mix discloses unclassifiable, never "all matched"', () => {
    const asOldBuildSeesIt: TrialFeeding = {
      eventId: 'm', occurredAt: at('2026-07-05'), foodItemId: null, foodKey: null,
      label: null, foodType: null, proteins: [],
    };
    expect(classifyFeeding(ctx(), asOldBuildSeesIt).verdict).toBe('unclassifiable');
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        asOldBuildSeesIt,
        ...Array.from({ length: 10 }, (_, i) => plain(`p${i}`, at(`2026-07-${String(i + 1).padStart(2, '0')}`), DUCK_PART)),
      ],
      nowMs: new Date(2026, 6, 10, 22).getTime(),
    });
    expect(facts.exposures.unclassifiable).toBe(1);
    expect(mayClaimAllMatched(facts)).toBe(false);
  });

  // Break 5. An unchecked component must not sit under an all-clear.
  it('a bowl with one unchecked component is not attribution-checked', () => {
    const KIBBLE = food({ foodItemId: 'f-kib', foodKey: 'rcduck kibble', label: 'RC Duck kibble', primaryProtein: 'duck', proteins: ['duck'] });
    const WET = food({ foodItemId: 'f-wet', foodKey: 'rcduck wet', label: 'RC Duck wet', primaryProtein: null, proteins: ['duck', 'duck liver'] });
    const c = classifyFeeding(
      buildTrialContext(TRIAL, [KIBBLE, WET]),
      bowl('b', at('2026-07-10'), [
        part({ foodItemId: 'f-kib', foodKey: 'rcduck kibble', label: 'RC Duck kibble', proteins: ['duck'] }),
        part({ foodItemId: 'f-other', foodKey: 'x lamb', label: 'X Lamb', proteins: ['lamb'] }),
      ]),
    );
    expect(c.offDiet).toBe(true);
    expect(c.attributionChecked).toBe(false);
  });

  // Break 6a. §6.1: an unlogged or treat-only day breaks the run.
  it('a treat-only day never starts the exclusive run', () => {
    const TREAT = food({ foodItemId: 'tr', foodKey: 'b treat', label: 'Duck treat', role: 'permitted_treat', primaryProtein: 'duck', proteins: ['duck'] });
    const treatPart = part({ foodItemId: 'tr', foodKey: 'b treat', label: 'Duck treat', foodType: 'treat', proteins: ['duck'] });
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: [DUCK, TREAT],
      feedings: [
        bowl('m1', at('2026-06-27'), [{ ...DUCK_PART, share: 0.5 }, { ...CHICKEN_PART, share: 0.5 }]),
        plain('t1', at('2026-06-28'), treatPart),
        plain('p1', at('2026-06-29'), DUCK_PART),
        plain('p2', at('2026-06-30'), DUCK_PART),
        plain('p3', at('2026-07-01'), DUCK_PART),
      ],
      nowMs: new Date(2026, 6, 1, 22).getTime(),
    });
    expect(t.firstExclusive).toEqual({ kind: 'by_day1', dayIndex: day('2026-06-29') });
  });

  // Break 7. A window anchored only at first fed misses the flare after the ramp.
  it('a day-11 flare after a ramp ending on day 10 appears beside the food', () => {
    const ended: TrialSpec = { ...TRIAL, species: 'cat', endedAt: '2026-08-01' };
    const feedings: TrialFeeding[] = [];
    const ramp = [0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75];
    ramp.forEach((share, i) => {
      const dd = `2026-08-${String(i + 2).padStart(2, '0')}`;
      feedings.push(bowl(`r${i}`, at(dd), [{ ...DUCK_PART, share: 1 - share }, { ...CHICKEN_PART, share }]));
    });
    feedings.push(plain('full', at('2026-08-11'), CHICKEN_PART));
    const foods = newFoodsIntroduced({
      trial: ended,
      allowedFoods: ALLOWED,
      feedings,
      symptoms: [{ occurredAt: at('2026-08-12'), eventType: 'vomit' }],
      nowMs: new Date(2026, 7, 20, 22).getTime(),
    });
    const chicken = foods.find((f) => f.label === 'Chicken Pâté');
    expect(chicken).toBeDefined();
    expect(chicken!.firstFedDayIndex).toBe(day('2026-08-02'));
    expect(chicken!.lastFedDayIndex).toBe(day('2026-08-11'));
    expect(chicken!.symptomsInWindow.map((s) => s.eventType)).toEqual(['vomit']);
  });
});

// ── §10 Clinical readers (the trial predicate's half) ─────────────────────────

describe('§5.2 — one bowl, the worst component, counted once', () => {
  it('a trial-food + chicken bowl in window: one feeding, one off-diet exposure, antigens include chicken', () => {
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [bowl('b', at('2026-07-05'), [{ ...DUCK_PART, share: 0.75 }, { ...CHICKEN_PART, share: 0.25 }])],
      nowMs: new Date(2026, 6, 5, 22).getTime(),
    });
    expect(facts.exposures.totalFeedings).toBe(1);
    expect(facts.exposures.offDiet).toBe(1);
    expect(facts.exposures.antigenTally.map((a) => a.protein)).toContain('chicken');
    const c = classifyFeeding(ctx(), bowl('b', at('2026-07-05'), [DUCK_PART, CHICKEN_PART]));
    expect(c.verdict).toBe('off_diet_protein');
    // Appendix C names the offending component, never the dominant one.
    expect(c.components?.map((x) => x.verdict)).toEqual(['permitted', 'off_diet_protein']);
  });

  it('on-list rabbit + off-list rabbit of another brand: one off_diet_unrecognised, no new antigen', () => {
    const c = classifyFeeding(
      ctx([DUCK, RABBIT_ON_LIST]),
      bowl('b', at('2026-07-05'), [
        part({ foodItemId: 'rabbit-a', foodKey: 'brand arabbit', label: 'Brand A Rabbit', proteins: ['rabbit'] }),
        part({ foodItemId: 'rabbit-b', foodKey: 'brand brabbit', label: 'Brand B Rabbit', proteins: ['rabbit'] }),
      ]),
    );
    expect(c.verdict).toBe('off_diet_unrecognised');
    expect(c.antigens).toEqual([]);
  });

  it('two components with the same food key collapse to one', () => {
    const c = classifyFeeding(ctx(), bowl('b', at('2026-07-05'), [DUCK_PART, { ...DUCK_PART, share: 0.5 }]));
    expect(c.verdict).toBe('permitted');
    expect(c.components).toHaveLength(1);
  });

  it('a bowl with any non-treat component counts toward coverage; an all-treat bowl does not', () => {
    const treatA = part({ foodItemId: 'ta', foodKey: 'a t', label: 'Treat A', foodType: 'treat', proteins: ['duck'] });
    const treatB = part({ foodItemId: 'tb', foodKey: 'b t', label: 'Treat B', foodType: 'treat', proteins: ['duck'] });
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        { ...bowl('b1', at('2026-07-02'), [treatA, treatB]), foodType: 'treat' },
        { ...bowl('b2', at('2026-07-03'), [treatA, DUCK_PART]), foodType: 'treat' },
      ],
      nowMs: new Date(2026, 6, 3, 22).getTime(),
    });
    expect(facts.coverage?.daysLogged).toBe(1);
  });

  it('a purged component resolves through its label; a component with no identity makes the bowl unclassifiable', () => {
    const purgedDuck = part({ foodItemId: null, foodKey: 'rcduck dry', label: 'RC Duck Dry', proteins: [] });
    expect(classifyFeeding(ctx(), bowl('b', at('2026-07-05'), [purgedDuck, DUCK_PART])).verdict).toBe('permitted');
    const anonymous = part({ foodItemId: null, foodKey: null, label: 'Something', proteins: [] });
    const c = classifyFeeding(ctx(), bowl('b', at('2026-07-05'), [anonymous, DUCK_PART]));
    expect(c.verdict).toBe('unclassifiable');
    expect(c.countsAsFeeding).toBe(false);
  });

  it('an incomplete bowl is unclassifiable, never one food', () => {
    const c = classifyFeeding(ctx(), { ...bowl('b', at('2026-07-05'), [DUCK_PART]), incompleteBowl: true });
    expect(c.verdict).toBe('unclassifiable');
  });

  it('a permitted component keeps its fromPermitted credit inside an off-diet bowl', () => {
    const JERKY = food({ foodItemId: 'jerky', foodKey: 'b jerky', label: 'Rabbit Jerky', role: 'permitted_treat', primaryProtein: 'rabbit', proteins: ['rabbit', 'beef'] });
    const facts = computeTrialFacts({
      trial: TRIAL,
      allowedFoods: [DUCK, JERKY],
      feedings: [bowl('b', at('2026-07-05'), [
        part({ foodItemId: 'jerky', foodKey: 'b jerky', label: 'Rabbit Jerky', foodType: 'treat', proteins: ['rabbit', 'beef'] }),
        CHICKEN_PART,
      ])],
      nowMs: new Date(2026, 6, 5, 22).getTime(),
    });
    const beef = facts.exposures.antigenTally.find((a) => a.protein === 'beef');
    const chicken = facts.exposures.antigenTally.find((a) => a.protein === 'chicken');
    expect(beef).toMatchObject({ feedings: 1, fromPermitted: 1 });
    expect(chicken).toMatchObject({ feedings: 1, fromPermitted: 0 });
  });

  // §10: verdict, counts and antigens do not move when the dominant-food choice does.
  it('property: verdict, counts and antigens are unchanged under every component order and share', () => {
    const pool = [
      DUCK_PART,
      CHICKEN_PART,
      part({ foodItemId: 'x', foodKey: 'x lamb', label: 'X Lamb', proteins: ['lamb'] }),
      part({ foodItemId: null, foodKey: null, label: 'Nameless', proteins: [] }),
      part({ foodItemId: 'jt', foodKey: 'j t', label: 'Treat', foodType: 'treat', proteins: [] }),
    ];
    const perms = <T,>(xs: T[]): T[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    for (let a = 0; a < pool.length; a++) {
      for (let b = a + 1; b < pool.length; b++) {
        const signatures = new Set<string>();
        for (const order of perms([pool[a], pool[b]])) {
          for (const shares of [[0.9, 0.1], [0.1, 0.9], [0.5, 0.5]]) {
            const parts = order.map((p, i) => ({ ...p, share: shares[i] }));
            const c = classifyFeeding(ctx(), bowl('b', at('2026-07-05'), parts));
            const facts = computeTrialFacts({
              trial: TRIAL, allowedFoods: ALLOWED,
              feedings: [bowl('b', at('2026-07-05'), parts)],
              nowMs: new Date(2026, 6, 5, 22).getTime(),
            });
            signatures.add(JSON.stringify([
              c.verdict, c.offDiet, c.countsAsFeeding, [...c.antigens].sort(), c.attributionChecked,
              { ...facts.exposures, items: facts.exposures.items.length, mostRecent: null }, facts.exposures.antigenTally.map((x) => [x.protein, x.feedings, x.fromPermitted]).sort(),
              facts.coverage?.daysLogged,
            ]));
          }
        }
        expect(signatures.size).toBe(1);
      }
    }
  });
});

describe('§5.2 — a bowl the day before Day 1 is out of window (C-29, pinned zones)', () => {
  it.each([
    ['America/Phoenix', '2026-07-01T06:50:00Z', '2026-07-01T07:10:00Z'], // UTC−7
    ['Pacific/Noumea', '2026-06-30T12:50:00Z', '2026-06-30T13:10:00Z'], // UTC+11
  ])('%s: 23:50 the day before Day 1 is out, 00:10 on Day 1 is in', (timeZone, before, after) => {
    const c = buildTrialContext(TRIAL, ALLOWED, { timeZone });
    expect(classifyFeeding(c, bowl('a', before, [DUCK_PART, CHICKEN_PART])).verdict).toBe('out_of_window');
    expect(classifyFeeding(c, bowl('b', after, [DUCK_PART, CHICKEN_PART])).verdict).toBe('off_diet_protein');
  });
});

describe('§6.1 — the transition in, derived at read', () => {
  it('matches on identity in force on started_at, so "first fed" before Day 1 is found', () => {
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        plain('old', at('2026-06-20'), CHICKEN_PART),
        bowl('m1', at('2026-06-25'), [{ ...CHICKEN_PART, share: 0.75 }, { ...DUCK_PART, share: 0.25 }]),
        bowl('m2', at('2026-06-27'), [{ ...CHICKEN_PART, share: 0.5 }, { ...DUCK_PART, share: 0.5 }]),
        bowl('m3', at('2026-06-29'), [{ ...CHICKEN_PART, share: 0.25 }, { ...DUCK_PART, share: 0.75 }]),
        plain('p', at('2026-07-01'), DUCK_PART),
      ],
      nowMs: new Date(2026, 6, 1, 22).getTime(),
    });
    expect(t.firstFed).toMatchObject({ dayIndex: day('2026-06-25'), mixed: true, share: 0.25 });
    expect(t.mixedDaysBeforeDay1).toBe(3);
    expect(t.otherFoodLabels).toEqual(['Chicken Pâté']);
  });

  // The spec's falsification: run out of chicken on day 3, rabbit-only for a day, back to mixing.
  it('the unbroken-run rule does not land on a lone trial-only day mid-transition', () => {
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        bowl('m1', at('2026-06-26'), [DUCK_PART, CHICKEN_PART]),
        plain('p1', at('2026-06-27'), DUCK_PART),
        bowl('m2', at('2026-06-28'), [DUCK_PART, CHICKEN_PART]),
        plain('p2', at('2026-06-29'), DUCK_PART),
        plain('p3', at('2026-06-30'), DUCK_PART),
        plain('p4', at('2026-07-01'), DUCK_PART),
      ],
      nowMs: new Date(2026, 6, 1, 22).getTime(),
    });
    expect(t.firstExclusive).toEqual({ kind: 'by_day1', dayIndex: day('2026-06-29') });
  });

  it('an unlogged day breaks the run, so mixing past Day 1 then a gap reads Unknown', () => {
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        bowl('m1', at('2026-07-01'), [DUCK_PART, CHICKEN_PART]),
        plain('p1', at('2026-07-02'), DUCK_PART),
        // Jul 3 unlogged
        plain('p2', at('2026-07-04'), DUCK_PART),
      ],
      nowMs: new Date(2026, 6, 5, 22).getTime(),
    });
    expect(t.firstExclusive).toEqual({ kind: 'unknown' });
  });

  it('mixing past Day 1, then trial-only to today, gives a first exclusive day after Day 1', () => {
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        bowl('m1', at('2026-07-01'), [DUCK_PART, CHICKEN_PART]),
        bowl('m2', at('2026-07-02'), [DUCK_PART, CHICKEN_PART]),
        plain('p1', at('2026-07-03'), DUCK_PART),
        plain('p2', at('2026-07-04'), DUCK_PART),
      ],
      nowMs: new Date(2026, 6, 4, 22).getTime(),
    });
    expect(t.firstExclusive).toEqual({ kind: 'after_day1', dayIndex: day('2026-07-03') });
  });

  it('a free-choice bowl of a non-allowed food keeps the day from qualifying', () => {
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [
        plain('p1', at('2026-06-29'), DUCK_PART),
        plain('p2', at('2026-06-30'), DUCK_PART),
        plain('p3', at('2026-07-01'), DUCK_PART),
      ],
      arrangements: [{ foodItemId: 'kibble', foodKey: null, label: 'Old kibble', startedAt: '2026-06-01', endedAt: '2026-06-29' }],
      nowMs: new Date(2026, 6, 1, 22).getTime(),
    });
    expect(t.firstExclusive).toEqual({ kind: 'by_day1', dayIndex: day('2026-06-30') });
  });

  it('with no trial food before Day 1, first fed is null and nothing is counted', () => {
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [plain('p', at('2026-07-01'), DUCK_PART)],
      nowMs: new Date(2026, 6, 1, 22).getTime(),
    });
    expect(t.firstFed).toBeNull();
    expect(t.mixedDaysBeforeDay1).toBe(0);
  });
});

describe('§6.3 — new foods introduced after a trial', () => {
  it('a zero count in the window is an empty list, and the food still appears', () => {
    const foods = newFoodsIntroduced({
      trial: { ...TRIAL, endedAt: '2026-08-01' },
      allowedFoods: ALLOWED,
      feedings: [bowl('r', at('2026-08-03'), [{ ...DUCK_PART, share: 0.75 }, { ...CHICKEN_PART, share: 0.25 }])],
      symptoms: [],
      nowMs: new Date(2026, 7, 20, 22).getTime(),
    });
    expect(foods).toHaveLength(1);
    expect(foods[0].symptomsInWindow).toEqual([]);
    expect(foods[0].ramp).toEqual([{ dayIndex: day('2026-08-03'), share: 0.25 }]);
  });

  it('a symptom on the day of first feeding is excluded (forward window only)', () => {
    const foods = newFoodsIntroduced({
      trial: { ...TRIAL, endedAt: '2026-08-01' },
      allowedFoods: ALLOWED,
      feedings: [plain('c', at('2026-08-03', 8), CHICKEN_PART)],
      symptoms: [{ occurredAt: at('2026-08-03', 20), eventType: 'vomit' }],
      nowMs: new Date(2026, 7, 20, 22).getTime(),
    });
    expect(foods[0].symptomsInWindow).toEqual([]);
  });

  it('is empty while the trial is still running', () => {
    expect(newFoodsIntroduced({
      trial: TRIAL,
      allowedFoods: ALLOWED,
      feedings: [plain('c', at('2026-07-03'), CHICKEN_PART)],
      symptoms: [],
      nowMs: new Date(2026, 6, 20, 22).getTime(),
    })).toEqual([]);
  });
});

// ── Adversarial pass 2 (build time) ───────────────────────────────────────────

describe('adversarial pass 2', () => {
  it('break 3: an incomplete bowl with a visible off-list component is off-diet on it', () => {
    const c = classifyFeeding(ctx(), { ...bowl('b', at('2026-07-05'), [CHICKEN_PART]), incompleteBowl: true });
    expect(c.verdict).toBe('off_diet_protein');
    expect(c.antigens).toContain('chicken');
  });

  it('break 6: a food withdrawn after Day 1 never starts an "only foods on the list" run', () => {
    const LAMB = food({ foodItemId: 'lamb', foodKey: 'x lamb', label: 'Lamb', role: 'permitted_other', primaryProtein: 'lamb', proteins: ['lamb'], allowedUntil: '2026-07-03' });
    const lambPart = part({ foodItemId: 'lamb', foodKey: 'x lamb', label: 'Lamb', proteins: ['lamb'] });
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: [DUCK, LAMB],
      feedings: [
        bowl('m0', at('2026-07-01'), [DUCK_PART, CHICKEN_PART]),
        ...Array.from({ length: 8 }, (_, i) => bowl(`l${i}`, at(`2026-07-0${i + 2}`), [DUCK_PART, lambPart])),
      ],
      nowMs: new Date(2026, 6, 9, 22).getTime(),
    });
    expect(t.firstExclusive).toEqual({ kind: 'unknown' });
  });

  it('break 8: a treat-only day before the run leaves its start unknown', () => {
    const TREAT = food({ foodItemId: 'tr', foodKey: 'b treat', label: 'Duck treat', role: 'permitted_treat', primaryProtein: 'duck', proteins: ['duck'] });
    const treatPart = part({ foodItemId: 'tr', foodKey: 'b treat', label: 'Duck treat', foodType: 'treat', proteins: ['duck'] });
    const t = deriveTrialTransition({
      trial: TRIAL,
      allowedFoods: [DUCK, TREAT],
      feedings: [
        bowl('m1', at('2026-07-01'), [DUCK_PART, CHICKEN_PART]),
        plain('t', at('2026-07-02'), treatPart),
        plain('p1', at('2026-07-03'), DUCK_PART),
        plain('p2', at('2026-07-04'), DUCK_PART),
      ],
      nowMs: new Date(2026, 6, 4, 22).getTime(),
    });
    expect(t.firstExclusive).toEqual({ kind: 'unknown' });
  });
});
