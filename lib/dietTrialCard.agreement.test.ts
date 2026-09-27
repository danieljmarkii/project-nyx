// The trial card's count-agreement (CUL-1335) and unnamed-feeding disclosure
// (CUL-1338), pinned as LITERAL strings. A file of its own so the pins read as one
// review; the cross-state oracle stays `lib/dietTrialCard.test.ts`.
//
// `lib/analytics` pulls `lib/sync` → `lib/supabase` through the feeding-arrangements
// module; the resolver is pure and touches neither (same stub as the oracle file).
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import {
  resolveTrialCard,
  type TrialCardInput,
  type TrialCardLineRole,
  type TrialCardModel,
} from './dietTrialCard';

const FOOD = 'Zignature Kangaroo Formula';

function localNoon(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function textOf(model: TrialCardModel, role: TrialCardLineRole): string[] {
  return model.lines.filter((l) => l.role === role).map((l) => l.text);
}

function allText(model: TrialCardModel): string {
  return model.lines.map((l) => l.text).join(' ');
}

/** Day 23 of 56 (the design lock's worked example). */
function activeInput(over: Partial<TrialCardInput> = {}): TrialCardInput {
  return {
    trial: { status: 'active', startedAt: '2026-07-03', targetDurationDays: 56, foodLabel: FOOD },
    nowMs: localNoon(2026, 7, 25),
    petName: 'Biscuit',
    species: 'dog',
    coverage: { daysLogged: 22, daysElapsed: 23 },
    exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 0 },
    ...over,
  };
}

const MILESTONE_NOW = localNoon(2026, 8, 27);

function abandonedForRefusal(over: Partial<TrialCardInput> = {}): TrialCardInput {
  return activeInput({
    trial: {
      status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-21',
      targetDurationDays: 56, foodLabel: FOOD,
      stoppedReason: 'Biscuit wouldn’t eat it', stoppedForRefusal: true,
    },
    coverage: { daysLogged: 18, daysElapsed: 19 },
    ...over,
  });
}

// ── CUL-1335 — the verb agrees with the count ────────────────────────────────

describe('CUL-1335: the off-diet floor sentence agrees with its count', () => {
  it('plain, singular: "1 logged feeding was"', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: MILESTONE_NOW,
      exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 1 },
    }));
    expect(m.state).toBe('milestone');
    expect(textOf(m, 'fact')).toContain(
      '1 logged feeding was outside the trial diet. That 1 is what’s been logged, not a total.',
    );
  });

  it('plain, plural: "2 logged feedings were"', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: MILESTONE_NOW,
      exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 2 },
    }));
    expect(textOf(m, 'fact')).toContain(
      '2 logged feedings were outside the trial diet. The 2 are what’s been logged, not a total.',
    );
  });

  it('separately, singular: "Separately, 1 logged feeding was"', () => {
    const m = resolveTrialCard(activeInput({
      species: 'cat',
      petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
      exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet: 1 },
    }));
    expect(m.state).toBe('intake_decline');
    expect(textOf(m, 'fact')).toContain(
      'Separately, 1 logged feeding was outside the trial diet. That 1 is what’s been ' +
        'logged, not a total.',
    );
  });

  it('never "feeding were" or "feedings was", anywhere, at 1 or at 2', () => {
    for (const offDiet of [1, 2]) {
      const m = resolveTrialCard(activeInput({
        nowMs: MILESTONE_NOW,
        exposures: { mayStateRecordClean: true, totalFeedings: 68, offDiet },
      }));
      expect(allText(m)).not.toMatch(/\bfeeding were\b|\bfeedings was\b/);
    }
  });
});

describe('CUL-1335: the free-fed body agrees with its count', () => {
  it('singular: "; 1 was not the trial diet."', () => {
    const m = resolveTrialCard(activeInput({
      petName: 'Mochi',
      freeFed: { loggedFeedings: 22 },
      exposures: { mayStateRecordClean: false, totalFeedings: 22, offDiet: 1 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      '22 bowl top-ups and wet meals logged so far; 1 was not the trial diet.',
    ]);
  });

  it('plural: "; 4 were not the trial diet."', () => {
    const m = resolveTrialCard(activeInput({
      petName: 'Mochi',
      freeFed: { loggedFeedings: 22 },
      exposures: { mayStateRecordClean: false, totalFeedings: 22, offDiet: 4 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      '22 bowl top-ups and wet meals logged so far; 4 were not the trial diet.',
    ]);
  });
});

describe('CUL-1335 (found alongside): the terminal refusal sentence at a count of one', () => {
  it('"this day was" and "1 feeding in total", never "these 1 day were" / "1 feedings"', () => {
    const m = resolveTrialCard(abandonedForRefusal({
      trial: {
        status: 'abandoned', startedAt: '2026-07-03', endedAt: '2026-07-03',
        targetDurationDays: 56, foodLabel: FOOD,
        stoppedReason: 'Biscuit wouldn’t eat it', stoppedForRefusal: true,
      },
      coverage: { daysLogged: 1, daysElapsed: 1 },
      exposures: { mayStateRecordClean: false, totalFeedings: 1, offDiet: 0 },
    }));
    expect(m.state).toBe('abandoned');
    expect(textOf(m, 'fact')).toContain(
      'Culprit isn’t showing how clean this day was. A diet that wasn’t eaten can’t be read ' +
        'as one that was followed — the record is meals offered on 1 of 1 days, 1 feeding in ' +
        'total, and what your vet needs from it is the refusal.',
    );
  });

  it('plural is unchanged: "these 19 days were", "54 feedings in total"', () => {
    const m = resolveTrialCard(abandonedForRefusal({
      exposures: { mayStateRecordClean: false, totalFeedings: 54, offDiet: 0 },
    }));
    expect(textOf(m, 'fact')).toContain(
      'Culprit isn’t showing how clean these 19 days were. A diet that wasn’t eaten can’t be ' +
        'read as one that was followed — the record is meals offered on 18 of 19 days, 54 ' +
        'feedings in total, and what your vet needs from it is the refusal.',
    );
  });
});

// ── CUL-1338 — feedings that name no food are disclosed, not read as nothing ──

const UNNAMED_20 = '20 logged feedings don’t name a food, so they can’t be checked against the trial diet.';

describe('CUL-1338: the record register', () => {
  it('replaces "Nothing logged against the trial yet." when every feeding names no food', () => {
    const m = resolveTrialCard(activeInput({
      coverage: { daysLogged: 20, daysElapsed: 20 },
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable: 20 },
    }));
    expect(textOf(m, 'fact')).toEqual(['Meals logged on 20 of 20 days.', UNNAMED_20]);
    expect(allText(m)).not.toContain('Nothing logged against the trial yet.');
  });

  it('singular: "1 logged feeding doesn’t name a food, so it can’t…"', () => {
    const m = resolveTrialCard(activeInput({
      coverage: { daysLogged: 1, daysElapsed: 20 },
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable: 1 },
    }));
    expect(textOf(m, 'fact')).toContain(
      '1 logged feeding doesn’t name a food, so it can’t be checked against the trial diet.',
    );
  });

  it('mixed, with exposures: the unnamed feedings follow the total as "more"', () => {
    const m = resolveTrialCard(activeInput({
      exposures: { mayStateRecordClean: false, totalFeedings: 30, offDiet: 3, unclassifiable: 2 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      'Meals logged on 22 of 23 days.',
      '30 feedings in total — 27 matched, 3 did not.',
      '2 more logged feedings don’t name a food, so they can’t be checked against the trial diet.',
    ]);
  });

  it('mixed, claim withheld: the disclosure is the withholding’s missing reason', () => {
    const m = resolveTrialCard(activeInput({
      exposures: { mayStateRecordClean: false, totalFeedings: 30, offDiet: 0, unclassifiable: 1 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      'Meals logged on 22 of 23 days.',
      '30 feedings in total. Culprit isn’t saying how many matched the trial diet on this record.',
      '1 more logged feeding doesn’t name a food, so it can’t be checked against the trial diet.',
    ]);
  });

  it('unchanged when nothing is unnamed (0, or the field absent)', () => {
    for (const unclassifiable of [0, undefined]) {
      const m = resolveTrialCard(activeInput({
        coverage: { daysLogged: 0, daysElapsed: 20 },
        exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable },
      }));
      expect(textOf(m, 'fact')).toContain('Nothing logged against the trial yet.');
      expect(allText(m)).not.toMatch(/name a food/);
    }
  });
});

describe('CUL-1338: the "so far" paragraph (below the floor)', () => {
  it('drops "0 feedings in total" for the disclosure', () => {
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable: 6 },
    }));
    expect(m.state).toBe('below_floor');
    expect(textOf(m, 'fact')).toEqual([
      'Of what’s on the record so far: meals on 6 of 23 days. 6 logged feedings don’t name a ' +
        'food, so they can’t be checked against the trial diet.',
    ]);
  });

  it('mixed: the total stays, the unnamed follow as "more"', () => {
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: { daysLogged: 6, daysElapsed: 23 },
      exposures: { mayStateRecordClean: false, totalFeedings: 9, offDiet: 0, unclassifiable: 2 },
    }));
    expect(textOf(m, 'fact')).toEqual([
      'Of what’s on the record so far: meals on 6 of 23 days, and 9 feedings in total. 2 more ' +
        'logged feedings don’t name a food, so they can’t be checked against the trial diet.',
    ]);
  });

  it('never "Nothing is on the record" over unnamed feedings when coverage is absent', () => {
    // The trial screen's projection (coverage null over a pet that may not be eating).
    const m = resolveTrialCard(activeInput({
      belowCoverageFloor: true,
      coverage: null,
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable: 6 },
    }));
    expect(allText(m)).not.toContain('Nothing is on the record for this trial yet.');
    expect(allText(m)).toContain(
      '6 logged feedings don’t name a food, so they can’t be checked against the trial diet.',
    );
  });
});

describe('CUL-1338: the terminal refusal sentence', () => {
  it('drops "0 feedings in total" beside meals offered, and discloses why', () => {
    const m = resolveTrialCard(abandonedForRefusal({
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable: 18 },
    }));
    expect(textOf(m, 'fact')).toContain(
      'Culprit isn’t showing how clean these 19 days were. A diet that wasn’t eaten can’t be ' +
        'read as one that was followed — the record is meals offered on 18 of 19 days, and what ' +
        'your vet needs from it is the refusal. 18 logged feedings don’t name a food, so they ' +
        'can’t be checked against the trial diet.',
    );
  });
});

describe('CUL-1338: day 1', () => {
  it('does not say "Nothing logged yet today." over a feeding that names no food', () => {
    const m = resolveTrialCard(activeInput({
      nowMs: localNoon(2026, 7, 3),
      coverage: { daysLogged: 0, daysElapsed: 1 },
      exposures: { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable: 1 },
    }));
    expect(m.state).toBe('day_one');
    expect(allText(m)).not.toContain('Nothing logged yet today.');
  });
});

// ── The disclosure never reassures (§5.2; n=1 never reassures) ────────────────
//
// The counterexample the disclosure has to survive: a cat whose every logged bowl
// names no food and who may not be eating. Walked across the states that carry a
// record, with every feeding unnamed: no line may say anything matched, and none may
// read the record as empty.
describe('CUL-1338: no state turns unnamed feedings into a clean or empty record', () => {
  const unnamedOnly = { mayStateRecordClean: false, totalFeedings: 0, offDiet: 0, unclassifiable: 14 };
  const cases: Array<[string, TrialCardInput]> = [
    ['clean', activeInput({ exposures: unnamedOnly })],
    ['below floor', activeInput({ belowCoverageFloor: true, coverage: { daysLogged: 6, daysElapsed: 23 }, exposures: unnamedOnly })],
    ['below floor, coverage projected away', activeInput({ belowCoverageFloor: true, coverage: null, exposures: unnamedOnly })],
    ['overrun', activeInput({ nowMs: localNoon(2026, 9, 1), exposures: unnamedOnly })],
    ['milestone', activeInput({ nowMs: MILESTONE_NOW, exposures: unnamedOnly })],
    ['multi-pet', activeInput({ otherPetNames: ['Rex'], exposures: unnamedOnly })],
    ['intake decline (cat)', activeInput({
      species: 'cat', petName: 'Mochi',
      intakeDeclineHeadline: 'Mochi has left most of her food for 3 days.',
      exposures: unnamedOnly,
    })],
    ['completed', activeInput({
      trial: {
        status: 'completed', startedAt: '2026-07-03', endedAt: '2026-08-27',
        targetDurationDays: 56, foodLabel: FOOD,
      },
      coverage: { daysLogged: 54, daysElapsed: 56 },
      exposures: unnamedOnly,
    })],
    ['abandoned for refusal', abandonedForRefusal({ exposures: unnamedOnly })],
  ];

  // Non-vacuity: the registers that state a record DO speak the disclosure here, so the
  // absence checks below run over cards that carry it. The safety face (a decline) and
  // the milestone take no record reading at all, by their own rulings.
  const SILENT = new Set(['milestone', 'intake decline (cat)']);

  it.each(cases)('%s', (label, input) => {
    const text = allText(resolveTrialCard(input));
    if (SILENT.has(label)) expect(text).not.toMatch(/name a food/);
    else expect(text).toMatch(/14 logged feedings don’t name a food/);
    expect(text).not.toMatch(/\bmatched\b/);
    expect(text).not.toMatch(/Nothing (logged|is on the record)/);
    expect(text).not.toMatch(/\b0 feedings\b/);
  });
});
