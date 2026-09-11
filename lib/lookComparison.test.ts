// The two-half compare (CUL-874 / N-5) — §6.4–§6.7, §6.10.
//
// Every fixture is anchored to `Date.now()` and built from LOCAL day components (C-29 /
// CUL-831): both halves are rolling windows judged against the real clock, and the CI
// matrix runs this at UTC+14 / +12:45 / −10. A fixture pinned to a calendar literal would
// fail on a month boundary rather than on a change.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));

import {
  compareHalves,
  compareWord,
  comparisonClause,
  halfClearsFloor,
  LOOK_COMPARE_HALF_DAYS,
  LOOK_COMPARE_MIN_ANSWERED_DAYS,
  LOOK_COMPARE_MIN_WEEKS,
} from './lookComparison';
import { LOOK_VOCAB_VERSION } from '../constants/lookWords';
import { localDayIndex, dayKeyFromIndex } from './utils';
import type { LookDayRow } from './lookDayCounts';

const NOW = Date.now();
const TODAY = localDayIndex(NOW);

function day(daysAgo: number): string {
  return dayKeyFromIndex(TODAY - daysAgo);
}

/** A look row `daysAgo` days back. `seq` orders rows within one day. */
function look(daysAgo: number, words: string[] = [], over: Partial<LookDayRow> = {}): LookDayRow {
  return {
    eventId: `e-${daysAgo}-${words.join('_')}-${over.createdAt ?? ''}`,
    localDay: day(daysAgo),
    createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
    vocabVersion: LOOK_VOCAB_VERSION,
    ...over,
  };
}

/**
 * A half's worth of answered days, spread over all four weeks by construction.
 *
 * `offset` is the half's first day-ago (0 for the current half, 28 for the earlier one).
 * `perWeek` days are taken from each of the four weeks, so every record built this way
 * clears the spread rule and a test that wants to BREAK the spread rule builds its own.
 */
function spreadHalf(offset: number, perWeek: number, words: (dayIndex: number) => string[] = () => []): LookDayRow[] {
  const rows: LookDayRow[] = [];
  for (let week = 0; week < 4; week += 1) {
    for (let i = 0; i < perWeek; i += 1) {
      const daysAgo = offset + week * 7 + i;
      rows.push(look(daysAgo, words(daysAgo)));
    }
  }
  return rows;
}

const CAT = { species: 'cat' as const, nowMs: NOW };

describe('the halves', () => {
  it('are contiguous and never overlap — no day is on both sides of its own comparison', () => {
    const { current, earlier } = compareHalves(NOW);
    expect(current.lastIndex).toBe(TODAY);
    expect(current.lastIndex - current.firstIndex + 1).toBe(LOOK_COMPARE_HALF_DAYS);
    expect(earlier.lastIndex).toBe(current.firstIndex - 1);
    expect(earlier.lastIndex - earlier.firstIndex + 1).toBe(LOOK_COMPARE_HALF_DAYS);
  });
});

describe('§6.5 — the floors, count AND spread', () => {
  it('eight answered days over three of four weeks clears it', () => {
    expect(
      halfClearsFloor({ days: 0, answered: 8, weekly: [3, 3, 2, 0], firstDay: 'x', lastDay: 'y' }),
    ).toBe(true);
  });

  it('seven answered days do not, however well spread', () => {
    expect(
      halfClearsFloor({ days: 0, answered: 7, weekly: [2, 2, 2, 1], firstDay: 'x', lastDay: 'y' }),
    ).toBe(false);
  });

  it('EIGHT answered days in two weeks do not — the spread rule, the point of §6.5', () => {
    // Eight days she was already worried, bunched. The count alone would have let this
    // through, and a count-anchored sentence built on it launders a selected sample.
    expect(
      halfClearsFloor({ days: 0, answered: 8, weekly: [4, 4, 0, 0], firstDay: 'x', lastDay: 'y' }),
    ).toBe(false);
  });

  it('a BURST cannot reach the floor on its own — five looks in two days are two answered days', () => {
    // R9 / T-14: the day is the unit. Five rows on each of two days is a two-day record.
    const burst: LookDayRow[] = [];
    for (let d = 0; d < 2; d += 1) {
      for (let n = 0; n < 5; n += 1) {
        burst.push(look(d, ['subdued'], { eventId: `burst-${d}-${n}`, createdAt: new Date(NOW - d * 86_400_000 + n * 3_600_000).toISOString() }));
      }
    }
    const result = compareWord('subdued', [...burst, ...spreadHalf(28, 3)], CAT);
    expect(result).toMatchObject({ kind: 'withheld', reason: 'notEnoughData' });
  });

  it('below the floor the reason is notEnoughData and it carries NO sentence of its own', () => {
    const result = compareWord('subdued', spreadHalf(0, 3), CAT);
    expect(result).toMatchObject({ kind: 'withheld', reason: 'notEnoughData', text: null });
  });

  it('the shipped floors are the spec’s numbers', () => {
    expect(LOOK_COMPARE_MIN_ANSWERED_DAYS).toBe(8);
    expect(LOOK_COMPARE_MIN_WEEKS).toBe(3);
  });
});

describe('the pair, when both halves clear', () => {
  it('renders both sides with their OWN denominators', () => {
    // Current: 3 of a week, all four weeks = 12 answered; *subdued* on 3 of them.
    // Earlier: likewise 12 answered; *subdued* on 1.
    const record = [
      ...spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : [])),
      ...spreadHalf(28, 3, (d) => (d === 28 ? ['subdued'] : [])),
    ];
    const result = compareWord('subdued', record, CAT);
    expect(result).toMatchObject({
      kind: 'pair',
      current: { days: 3, answered: 12 },
      earlier: { days: 1, answered: 12 },
    });
  });

  it('the clause names ONLY the earlier half — the row’s own count is not restated', () => {
    const record = [
      ...spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : [])),
      ...spreadHalf(28, 3, (d) => (d === 28 ? ['subdued'] : [])),
    ];
    const clause = comparisonClause(compareWord('subdued', record, CAT));
    expect(clause).toBe('4 weeks before: 1 of 12');
    expect(clause).not.toContain('3 of 12');
  });

  it('carries per-week placement, OLDEST FIRST', () => {
    const result = compareWord('subdued', [
      ...spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : [])),
      ...spreadHalf(28, 3),
    ], CAT);
    expect(result.kind).toBe('pair');
    if (result.kind !== 'pair') return;
    expect(result.current.weekly).toHaveLength(4);
    expect(result.current.weekly.reduce((a, b) => a + b, 0)).toBe(result.current.answered);
    // Week 0 is the half's FIRST seven days, which for the current half is the OLDEST
    // week — days 21–27 ago. `spreadHalf` puts three in each, so it is flat.
    expect(result.current.weekly).toEqual([3, 3, 3, 3]);
  });

  it('never contains an arrow, a delta, a percentage or a verdict word', () => {
    const clause =
      comparisonClause(
        compareWord('subdued', [
          ...spreadHalf(0, 3, (d) => (d < 6 ? ['subdued'] : [])),
          ...spreadHalf(28, 3, (d) => (d === 28 ? ['subdued'] : [])),
        ], CAT),
      ) ?? '';
    expect(clause).not.toMatch(/[↑↓→%]|more|less|worse|better|improv|up |down /i);
  });
});

describe('§6.6 — the direction rules', () => {
  /** A record whose word RISES: 1 day in the earlier half, 6 in the current. */
  function rising(currentAnsweredPerWeek = 3, earlierAnsweredPerWeek = 3): LookDayRow[] {
    return [
      ...spreadHalf(0, currentAnsweredPerWeek, (d) => (d % 7 < 2 ? ['subdued'] : [])),
      ...spreadHalf(28, earlierAnsweredPerWeek, (d) => (d === 28 ? ['subdued'] : [])),
    ];
  }
  /** A record whose word FALLS: 6 days in the earlier half, 1 in the current. */
  function falling(currentAnsweredPerWeek = 3, earlierAnsweredPerWeek = 3): LookDayRow[] {
    return [
      ...spreadHalf(0, currentAnsweredPerWeek, (d) => (d === 0 ? ['subdued'] : [])),
      ...spreadHalf(28, earlierAnsweredPerWeek, (d) => (d % 7 < 2 ? ['subdued'] : [])),
      // A look before the earlier half, so the RTM guard (first month of looks) is inert
      // and this test measures the density rule alone.
      look(70, ['lively']),
    ];
  }

  it('a RISING pair renders even when the answered-day density fell', () => {
    // The onset R1 exists to catch: she is looking LESS and seeing MORE. Withholding this
    // is the one direction the feature cannot afford.
    const result = compareWord('subdued', rising(2, 4), CAT);
    expect(result.kind).toBe('pair');
  });

  it('a FALLING pair is withheld when the density fell, and says why', () => {
    const result = compareWord('subdued', falling(2, 4), CAT);
    expect(result).toMatchObject({ kind: 'withheld', reason: 'densityFell' });
    if (result.kind !== 'withheld') return;
    expect(result.text).toBe(
      'You also answered on fewer days this month, so we can’t tell yet whether there was less to see.',
    );
  });

  it('a FALLING pair renders when the density held or ROSE — the fall is real', () => {
    const result = compareWord('subdued', falling(4, 3), CAT);
    expect(result.kind).toBe('pair');
  });

  it('an EQUAL count is not falling — the pair renders and reassures nobody', () => {
    const record = [
      ...spreadHalf(0, 3, (d) => (d % 7 === 0 ? ['subdued'] : [])),
      ...spreadHalf(28, 3, (d) => ((d - 28) % 7 === 0 ? ['subdued'] : [])),
      look(70, ['lively']),
    ];
    expect(compareWord('subdued', record, CAT).kind).toBe('pair');
  });

  // ── THE GATE'S PREDICATE IS THE COUNT, NOT THE RATE ───────────────────────
  // Both of these broke the first cut, which classified direction by the rate. The gate
  // exists to stop a pair being READ as improvement, and the reader reads two numerators.

  it('a count that FELL while the rate ROSE is still withheld when density fell', () => {
    // *6 of 24* then *3 of 8*: she stopped answering except when worried. Rate 25% → 37.5%,
    // so a rate-gated version published this bare — six becoming three, on a third of the
    // days, with the caption written for exactly this unable to fire.
    const onCurrent = new Set([0, 1, 7]);
    const onEarlier = new Set([28, 29, 30, 35, 36, 37]);
    const record = [
      // 8 answered, 3 marked → 37.5%.
      ...spreadHalf(0, 2, (d) => (onCurrent.has(d) ? ['subdued'] : [])),
      // 24 answered, 6 marked → 25%.
      ...spreadHalf(28, 6, (d) => (onEarlier.has(d) ? ['subdued'] : [])),
      look(90, ['lively']), // predates both halves, so the RTM guard is inert here
    ];
    expect(compareWord('subdued', record, CAT)).toMatchObject({
      kind: 'withheld',
      reason: 'densityFell',
    });

    // THE FIXTURE REALLY IS THE CASE, not a mis-built one — pinned off the shipped
    // function rather than re-derived. `restless` is marked on every answered day of both
    // halves, so its pair exposes the skeleton's own denominators: 8 and 24. With 3 and 6
    // marked above, that is 37.5% against 25% — the rate ROSE while the count fell.
    const skeleton = [
      ...spreadHalf(0, 2, (d) => (d === 0 ? ['restless'] : [])),
      ...spreadHalf(28, 6, (d) => (d === 28 ? ['restless'] : [])),
      look(90, ['lively']),
    ];
    const shape = compareWord('restless', skeleton, CAT);
    expect(shape.kind).toBe('pair');
    if (shape.kind !== 'pair') return;
    expect(shape.current.answered).toBe(8);
    expect(shape.earlier.answered).toBe(24);
    expect(3 / shape.current.answered).toBeGreaterThan(6 / shape.earlier.answered);
  });

  it('a count that ROSE while the rate fell is NEVER withheld — §6.7’s rising clause', () => {
    // *4 of 10* then *5 of 28*, the earlier half a true first month. Rate fell, so a
    // rate-gated RTM guard withheld it; §6.7 says a rising pair is never subject to that.
    const onEarlier = new Set([28, 29, 35, 36]);
    const record = [
      // 28 answered, 5 marked → 17.9%.
      ...spreadHalf(0, 7, (d) => (d < 5 ? ['subdued'] : [])),
      // 12 answered, 4 marked → 33.3%. No look predates this half, so it IS the first
      // month of looks and the RTM guard is armed.
      ...spreadHalf(28, 3, (d) => (onEarlier.has(d) ? ['subdued'] : [])),
    ];
    const result = compareWord('subdued', record, CAT);
    expect(result.kind).toBe('pair');
    if (result.kind !== 'pair') return;
    expect(result.current.days).toBeGreaterThan(result.earlier.days);
    // And the rate really did fall — this is the case, not a mis-built fixture.
    expect(result.current.days * result.earlier.answered).toBeLessThan(
      result.earlier.days * result.current.answered,
    );
  });

  it('an ACTIVITY POSITIVE is refused structurally, whatever the counts say', () => {
    const record = [
      ...spreadHalf(0, 3, () => ['played']),
      ...spreadHalf(28, 3, () => ['played']),
    ];
    expect(compareWord('played', record, CAT)).toMatchObject({
      kind: 'withheld',
      reason: 'notApplicable',
      text: null,
    });
  });

  it('a key this build cannot name is refused the same way — never compared as a concern', () => {
    const record = [
      ...spreadHalf(0, 3, () => ['a_word_from_the_future']),
      ...spreadHalf(28, 3, () => ['a_word_from_the_future']),
    ];
    expect(compareWord('a_word_from_the_future', record, CAT)).toMatchObject({
      reason: 'notApplicable',
    });
  });
});

describe('§6.7 — the regression-to-the-mean guard, direction-scoped', () => {
  /** A record whose FIRST look is inside the earlier half — she started at a bad stretch. */
  function firstMonth(wordsCurrent: (d: number) => string[], wordsEarlier: (d: number) => string[]): LookDayRow[] {
    return [...spreadHalf(0, 3, wordsCurrent), ...spreadHalf(28, 3, wordsEarlier)];
  }

  it('withholds a FALLING pair whose earlier half is the first month of looks', () => {
    const result = compareWord(
      'subdued',
      firstMonth((d) => (d === 0 ? ['subdued'] : []), (d) => (d % 7 < 2 ? ['subdued'] : [])),
      CAT,
    );
    expect(result).toMatchObject({ kind: 'withheld', reason: 'firstMonth' });
    if (result.kind !== 'withheld') return;
    expect(result.text).toBe('Comparisons start from the second month of looks.');
  });

  it('never withholds a RISING pair for it — a first month of nothing then a month of Off is the onset', () => {
    const result = compareWord(
      'subdued',
      firstMonth((d) => (d % 7 < 2 ? ['subdued'] : []), () => []),
      CAT,
    );
    expect(result.kind).toBe('pair');
  });

  it('is NOT a tautology on a long record — a two-year history’s falling pair still publishes', () => {
    // THE DEFECT THIS PINS. The screen used to read 56 days, which starts on the SAME
    // index as the earlier half's first day — so `earliest >= earlierBounds.firstIndex`
    // was true for every record Patterns could build, every falling pair was withheld
    // with a sentence that was false about the owner's own record, and §6.6's density
    // rule was unreachable behind it. The screen now reads the record unbounded
    // (asserted in app/insights/noticed.test.tsx); this is the shape that proves the
    // guard discriminates.
    const twoYears: LookDayRow[] = [];
    for (let d = 0; d < 700; d += 2) twoYears.push(look(d, d < 60 && d % 14 === 0 ? ['subdued'] : []));
    const result = compareWord('subdued', twoYears, CAT);
    expect(result.kind).toBe('pair');
  });

  it('is inert once a look predates the earlier half — one day earlier is enough', () => {
    const record = [
      ...spreadHalf(0, 4, (d) => (d === 0 ? ['subdued'] : [])),
      ...spreadHalf(28, 3, (d) => (d % 7 < 2 ? ['subdued'] : [])),
      look(2 * LOOK_COMPARE_HALF_DAYS, ['lively']),
    ];
    expect(compareWord('subdued', record, CAT).kind).toBe('pair');
  });
});

describe('§6.10 — the vocabulary version', () => {
  it('withholds a straddle and names the day the words changed', () => {
    const record = [
      ...spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : [])).map((r) => ({ ...r, vocabVersion: 2 })),
      ...spreadHalf(28, 3, (d) => (d === 28 ? ['subdued'] : [])),
    ];
    const result = compareWord('subdued', record, CAT);
    expect(result).toMatchObject({ kind: 'withheld', reason: 'vocabularyChanged' });
    if (result.kind !== 'withheld') return;
    // The date is the FIRST day of the newer version inside the two halves — the oldest
    // v2 row, which `spreadHalf(0, …)` places 21 days back.
    expect(result.text).toMatch(/^The words changed on .+, so the two months can’t be compared yet\.$/);
  });

  it('withholds when a SINGLE half straddles, not only when the two differ', () => {
    const current = spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : []));
    const record = [
      ...current.map((r, i) => (i < 6 ? { ...r, vocabVersion: 2 } : r)),
      ...spreadHalf(28, 3, (d) => (d === 28 ? ['subdued'] : [])).map((r) => ({ ...r, vocabVersion: 2 })),
    ];
    expect(compareWord('subdued', record, CAT)).toMatchObject({ reason: 'vocabularyChanged' });
  });

  it('does not fire when every row in both halves is on one version', () => {
    const record = [
      ...spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : [])),
      ...spreadHalf(28, 3, (d) => (d === 28 ? ['subdued'] : [])),
    ].map((r) => ({ ...r, vocabVersion: 7 }));
    expect(compareWord('subdued', record, CAT).kind).toBe('pair');
  });

  it('a version change OUTSIDE both halves does not withhold — the halves are the scope', () => {
    const record = [
      ...spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : [])),
      ...spreadHalf(28, 3, (d) => (d === 28 ? ['subdued'] : [])),
      { ...look(90, ['subdued']), vocabVersion: 0 },
    ];
    expect(compareWord('subdued', record, CAT).kind).toBe('pair');
  });
});

describe('the counting rules the halves share', () => {
  it('a word in two looks the same day counts ONCE (§6.2)', () => {
    const doubled = [
      look(0, ['subdued'], { eventId: 'a', createdAt: new Date(NOW).toISOString() }),
      look(0, ['subdued'], { eventId: 'b', createdAt: new Date(NOW + 1000).toISOString() }),
      ...spreadHalf(0, 3),
      ...spreadHalf(28, 3),
      look(70, ['lively']),
    ];
    const result = compareWord('subdued', doubled, CAT);
    expect(result.kind).toBe('pair');
    if (result.kind !== 'pair') return;
    expect(result.current.days).toBe(1);
  });

  it('a row outside both halves is ignored rather than counted into either', () => {
    const base = [...spreadHalf(0, 3, (d) => (d < 3 ? ['subdued'] : [])), ...spreadHalf(28, 3)];
    const withOld = [...base, look(200, ['subdued']), look(300, ['subdued'])];
    const a = compareWord('subdued', base, CAT);
    const b = compareWord('subdued', withOld, CAT);
    // Same halves either way; the old rows only turn the RTM guard off, which for a
    // rising word changes nothing.
    expect(a.kind).toBe(b.kind);
    if (a.kind !== 'pair' || b.kind !== 'pair') return;
    expect(b.current).toEqual(a.current);
    expect(b.earlier).toEqual(a.earlier);
  });
});
