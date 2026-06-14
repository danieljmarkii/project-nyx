// dashboardCards imports `isNotEnoughData` from ./analytics, which transitively
// imports ./db (expo-sqlite). Nothing here touches the DB — stub it so the native
// module isn't loaded under jest (the analytics.test.ts / meals.test.ts pattern).
jest.mock('./db', () => ({ getDb: () => ({}) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  resolveDeltaTone,
  isEstablishedCount,
  MIN_SAMPLES_FOR_VERDICT,
  selectCardState,
  calibrationLine,
  describeCountDelta,
  deltaDirection,
  pluralize,
  intakeNotObservedNote,
  type Polarity,
} from './dashboardCards';
import { notEnoughData } from './analytics';

// ── resolveDeltaTone — the §13 #6 colour-as-wellness ruling ──────────────────────
//
// This is the load-bearing safety mapping: a verdict colour attaches ONLY to an
// established multi-sample metric, adverse inverts, and a single observation is
// always neutral. Each block below pins one clause of the ruling so a regression
// can't quietly re-introduce a false-reassurance (or false-alarm) colour.

describe('resolveDeltaTone — §13 #6 ruling', () => {
  describe('not established (single observation / below floor) → always neutral (§11 #2)', () => {
    const polarities: Polarity[] = ['adverse', 'neutral', 'positive'];
    for (const polarity of polarities) {
      it(`${polarity}: a rising delta with established=false is neutral (n=1 never alarms)`, () => {
        expect(resolveDeltaTone({ polarity, delta: +3, established: false })).toBe('neutral');
      });
      it(`${polarity}: a falling delta with established=false is neutral (n=1 never reassures)`, () => {
        expect(resolveDeltaTone({ polarity, delta: -3, established: false })).toBe('neutral');
      });
    }
  });

  describe('a non-finite delta never earns a verdict (guards a future ratio metric)', () => {
    it('NaN delta → neutral on an adverse card (never a false-reassuring "calm")', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: NaN, established: true })).toBe('neutral');
    });
    it('±Infinity delta → neutral', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: Infinity, established: true })).toBe('neutral');
      expect(resolveDeltaTone({ polarity: 'positive', delta: -Infinity, established: true })).toBe('neutral');
    });
  });

  describe('adverse metric — inverted, gated on established (§11 #3)', () => {
    it('rising = concern (vomits up is a concern, never green)', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: +2, established: true })).toBe('concern');
    });
    it('falling = calm, NOT positive — a falling vomit count is never a green "win"', () => {
      const tone = resolveDeltaTone({ polarity: 'adverse', delta: -2, established: true });
      expect(tone).toBe('calm');
      expect(tone).not.toBe('positive');
    });
    it('flat = neutral (no change, no verdict)', () => {
      expect(resolveDeltaTone({ polarity: 'adverse', delta: 0, established: true })).toBe('neutral');
    });
  });

  describe('positive metric — rising is a quiet win; a drop is not alarmed here', () => {
    it('rising = positive (the one multi-sample win colour)', () => {
      expect(resolveDeltaTone({ polarity: 'positive', delta: +0.2, established: true })).toBe('positive');
    });
    it('falling = neutral — the floored decline detector owns concern, not a crude rate drop', () => {
      const tone = resolveDeltaTone({ polarity: 'positive', delta: -0.2, established: true });
      expect(tone).toBe('neutral');
      expect(tone).not.toBe('concern');
    });
  });

  describe('neutral metric — descriptive, never a verdict colour', () => {
    it('rising = neutral', () => {
      expect(resolveDeltaTone({ polarity: 'neutral', delta: +5, established: true })).toBe('neutral');
    });
    it('falling = neutral', () => {
      expect(resolveDeltaTone({ polarity: 'neutral', delta: -5, established: true })).toBe('neutral');
    });
  });
});

describe('isEstablishedCount — the n=1 verdict gate', () => {
  it(`requires the larger window to hold ≥ ${MIN_SAMPLES_FOR_VERDICT} events`, () => {
    expect(MIN_SAMPLES_FOR_VERDICT).toBe(2);
  });
  it('a single observation (1 vs 0) is NOT established → its delta stays neutral', () => {
    expect(isEstablishedCount(1, 0)).toBe(false);
    expect(resolveDeltaTone({ polarity: 'adverse', delta: +1, established: isEstablishedCount(1, 0) })).toBe('neutral');
  });
  it('0 vs 1 (a single prior observation) is NOT established', () => {
    expect(isEstablishedCount(0, 1)).toBe(false);
  });
  it('2 or more in either window is established', () => {
    expect(isEstablishedCount(2, 0)).toBe(true);
    expect(isEstablishedCount(0, 2)).toBe(true);
    expect(isEstablishedCount(3, 1)).toBe(true);
  });
});

// ── selectCardState — calibration / empty / populated (§10) ───────────────────────

describe('selectCardState — §10 state selection', () => {
  it('the notEnoughData sentinel → calibrating, carrying the honest "N more" remaining', () => {
    const state = selectCardState(notEnoughData(1, 4));
    expect(state).toEqual({ kind: 'calibrating', samples: 1, needed: 4, remaining: 3 });
  });

  it('remaining never goes negative (over-floor sentinel is clamped)', () => {
    const state = selectCardState(notEnoughData(5, 4));
    expect(state.kind).toBe('calibrating');
    if (state.kind === 'calibrating') expect(state.remaining).toBe(0);
  });

  it('real data + isEmpty → empty (a warm "none logged", not calibration)', () => {
    expect(selectCardState([], { isEmpty: true })).toEqual({ kind: 'empty' });
  });

  it('real non-empty data → populated', () => {
    expect(selectCardState([{ foo: 1 }], { isEmpty: false })).toEqual({ kind: 'populated' });
    expect(selectCardState({ rate: 0.8 })).toEqual({ kind: 'populated' });
  });

  it('calibration takes priority over isEmpty (a below-floor read is never shown as empty data)', () => {
    const state = selectCardState(notEnoughData(0, 4), { isEmpty: true });
    expect(state.kind).toBe('calibrating');
  });
});

// ── Copy helpers — numbers honest, voice warm/forward-looking ─────────────────────

describe('pluralize', () => {
  it('singular only for exactly 1', () => {
    expect(pluralize(1, 'meal')).toBe('meal');
    expect(pluralize(0, 'meal')).toBe('meals');
    expect(pluralize(3, 'meal')).toBe('meals');
  });
  it('honours an irregular plural', () => {
    expect(pluralize(2, 'day', 'days')).toBe('days');
  });
});

describe('calibrationLine — §10 "still learning the baseline — N more"', () => {
  it('states the honest remaining count and unit, with the pet name', () => {
    expect(calibrationLine(3, 'meal', 'Nyx')).toBe(
      "Still learning Nyx's baseline — 3 more meals to log.",
    );
  });
  it('pluralizes the unit by the remaining count', () => {
    expect(calibrationLine(1, 'meal', 'Nyx')).toBe(
      "Still learning Nyx's baseline — 1 more meal to log.",
    );
  });
  it('falls back to the second-person "your pet\'s" when no pet name is given', () => {
    expect(calibrationLine(2, 'day')).toBe("Still learning your pet's baseline — 2 more days to log.");
  });
  it('stays warm (no exclamation mark, forward-looking) even at the boundary', () => {
    const line = calibrationLine(0, 'meal', 'Nyx');
    expect(line).toBe("Still learning Nyx's baseline — almost there.");
    expect(line).not.toContain('!');
  });
});

describe('describeCountDelta — honest direction, no verdict word', () => {
  it('more this period', () => {
    expect(describeCountDelta(5, 3, 'week')).toBe('2 more than last week');
  });
  it('fewer this period (calm wording, never "improving")', () => {
    const line = describeCountDelta(3, 5, 'month');
    expect(line).toBe('2 fewer than last month');
    expect(line).not.toMatch(/improv|better|worse|win/i);
  });
  it('same as the prior period', () => {
    expect(describeCountDelta(4, 4, 'week')).toBe('Same as last week');
  });
  it('up from a zero prior', () => {
    expect(describeCountDelta(3, 0, 'week')).toBe('Up from none last week');
  });
  it('down to zero this period', () => {
    expect(describeCountDelta(0, 3, '3month')).toBe('None in the last 3 months, down from 3');
  });
});

describe('deltaDirection', () => {
  it('maps the sign of the delta', () => {
    expect(deltaDirection(2)).toBe('up');
    expect(deltaDirection(-2)).toBe('down');
    expect(deltaDirection(0)).toBe('flat');
  });
});

describe('intakeNotObservedNote — §11 #6 free-feeding honesty', () => {
  it('never reads a free-fed absence as "didn\'t eat", and stays warm', () => {
    const note = intakeNotObservedNote();
    expect(note).toMatch(/free-fed/i);
    expect(note).not.toContain('!');
    expect(note).not.toMatch(/didn't eat|did not eat/i);
  });
});
