// The coverage footer's three forms (CUL-873 / N-4b) — T-16, L-15, Q-13.
//
// The acceptance criteria's boundary walk (13 · 14 · 27 · 28 answered days), day 1, a
// no-look day, the Undo of the only look, and the withheld suppression until the window
// clears. Every fixture is anchored to `Date.now()` and built from LOCAL day components,
// never a calendar literal (C-29 / CUL-831): the window under test is rolling, judged
// against the real clock, and the CI matrix runs this at UTC+14 / +12:45 / −10.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));

import { lookCoverage, lookCoverageText, LOOK_COVERAGE_WINDOW_DAYS } from './lookCoverage';
import { localDayIndex, dayKeyFromIndex } from './utils';
import type { LookDayRow } from './looks';
import { LOOK_VOCAB_VERSION } from '../constants/lookWords';

const NOW = Date.now();
const TODAY_INDEX = localDayIndex(NOW);

/** A look row on the local day `daysAgo` days back — keyed exactly as the writer keys it. */
function row(daysAgo: number, over: Partial<LookDayRow> = {}): LookDayRow {
  return {
    eventId: `e-${daysAgo}`,
    localDay: dayKeyFromIndex(TODAY_INDEX - daysAgo),
    createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    outcome: 'nothing_unusual',
    words: [],
    vocabVersion: LOOK_VOCAB_VERSION,
    ...over,
  };
}

/** `n` answered days ending TODAY, one look each. */
function answered(n: number): LookDayRow[] {
  return Array.from({ length: n }, (_, i) => row(i));
}

function coverage(record: LookDayRow[], over: Partial<Parameters<typeof lookCoverage>[1]> = {}) {
  return lookCoverage(record, { nowMs: NOW, withheldNow: false, lastWithheldDay: null, ...over });
}

describe('the three forms, walked across the floor and the saturation point', () => {
  it('13 answered days → nothing (below the floor)', () => {
    const c = coverage(answered(13));
    expect(c).toEqual({ form: 'absent', reason: 'below_floor' });
    expect(lookCoverageText(c)).toBeNull();
  });

  it('14 answered days → the ratio, the first day it renders', () => {
    expect(lookCoverageText(coverage(answered(14)))).toBe('Answered 14 of the last 28 days');
  });

  it('27 answered days → the ratio', () => {
    expect(lookCoverageText(coverage(answered(27)))).toBe('Answered 27 of the last 28 days');
  });

  it('28 answered days → the WINDOW ALONE, never "28 of 28"', () => {
    const text = lookCoverageText(coverage(answered(28)));
    expect(text).toBe('Counted across the last 28 days');
    expect(text).not.toMatch(/28 of/);
  });

  it('the window cannot accrue — day 200 reads like day 40', () => {
    // 24 of the last 28 answered, on a record 200 days deep. The denominator is the
    // window, never the record's age, and the numerator counts only inside it.
    const deep = [...Array.from({ length: 24 }, (_, i) => row(i)), ...Array.from({ length: 170 }, (_, i) => row(i + 30))];
    expect(lookCoverageText(coverage(deep))).toBe('Answered 24 of the last 28 days');
  });

  it('a day answered several times is still one answered day', () => {
    const record = [...answered(14), row(0, { eventId: 'e-again', outcome: 'observed', words: ['subdued'] })];
    expect(lookCoverageText(coverage(record))).toBe('Answered 14 of the last 28 days');
  });
});

describe('when it is absent', () => {
  it('day 1 — one answered day is below the floor', () => {
    expect(coverage(answered(1)).form).toBe('absent');
  });

  it('a day with no look — the resting card never grows (Q-16)', () => {
    // Twenty answered days, none of them today.
    const record = Array.from({ length: 20 }, (_, i) => row(i + 1));
    expect(coverage(record)).toEqual({ form: 'absent', reason: 'no_look_today' });
  });

  it('Undo of the day’s only look removes it', () => {
    const withToday = answered(20);
    expect(coverage(withToday).form).toBe('ratio');
    // `loadLookDays` drops the reversed row through the parent's `deleted_at`, so the
    // Undo reaches this function as the row simply not being there.
    const afterUndo = withToday.filter((r) => r.localDay !== dayKeyFromIndex(TODAY_INDEX));
    expect(coverage(afterUndo)).toEqual({ form: 'absent', reason: 'no_look_today' });
  });

  it('a second look the same day survives an Undo of the first', () => {
    const record = [...answered(20), row(0, { eventId: 'e-second' })];
    const afterUndo = record.filter((r) => r.eventId !== 'e-0');
    expect(coverage(afterUndo).form).toBe('ratio');
  });
});

describe('withholding', () => {
  it('withheld right now → absent, at every coverage', () => {
    expect(coverage(answered(28), { withheldNow: true })).toEqual({ form: 'absent', reason: 'withheld' });
    expect(coverage(answered(20), { withheldNow: true }).form).toBe('absent');
  });

  it('a withheld day INSIDE the window keeps it absent after the state clears', () => {
    const mark = dayKeyFromIndex(TODAY_INDEX - 10);
    expect(coverage(answered(28), { lastWithheldDay: mark })).toEqual({
      form: 'absent',
      reason: 'withheld',
    });
  });

  it('it returns only once the window has moved PAST the withheld day', () => {
    const justInside = dayKeyFromIndex(TODAY_INDEX - (LOOK_COVERAGE_WINDOW_DAYS - 1));
    const justOutside = dayKeyFromIndex(TODAY_INDEX - LOOK_COVERAGE_WINDOW_DAYS);
    expect(coverage(answered(28), { lastWithheldDay: justInside }).form).toBe('absent');
    expect(coverage(answered(28), { lastWithheldDay: justOutside }).form).toBe('window');
  });

  it('a hospitalisation never comes back as a lower score', () => {
    // The shape the fourth pass named: a fortnight withheld, then the owner resumes. What
    // she must NOT read on the far side is a number that fell.
    const record = [...Array.from({ length: 8 }, (_, i) => row(i)), ...Array.from({ length: 6 }, (_, i) => row(i + 22))];
    const mark = dayKeyFromIndex(TODAY_INDEX - 9);
    expect(coverage(record, { lastWithheldDay: mark }).form).toBe('absent');
  });

  // ── The adversarial pass's measured break, walked in time ──────────────────
  //
  // At 28 of 28 she withholds on day −20 (the last day she opened the app), the clinic has
  // the cat from −19 to −13 with the app never opened, and she resumes on −12. The first
  // cut suppressed only until the MARKED DAY left the window — at which point the clinic's
  // unanswered days were still inside it, and the footer returned reading a number that had
  // fallen because her cat was ill.
  describe('the window must clear the whole illness, not just the mark', () => {
    /** Answered every day from `fromDaysAgo` back to `toDaysAgo`, inclusive. */
    function answeredRange(fromDaysAgo: number, toDaysAgo: number): LookDayRow[] {
      const out: LookDayRow[] = [];
      for (let d = fromDaysAgo; d <= toDaysAgo; d += 1) out.push(row(d));
      return out;
    }

    /** Answered daily up to the withheld day, nothing while the cat was in the clinic,
     *  answered daily since she came home. */
    function illnessRecord(markDaysAgo: number, resumedDaysAgo: number): LookDayRow[] {
      return [
        ...answeredRange(0, resumedDaysAgo),
        ...answeredRange(markDaysAgo, markDaysAgo + 40),
      ];
    }

    it('is ABSENT while the unanswered clinic days are still in the window', () => {
      // Withheld on day −20 (the last day she opened the app), clinic −19…−13 with the app
      // never opened, home and answering again from −12. The MARK has left the 28-day
      // window's reach as a suppression trigger on its own; the GAP it caused has not.
      const record = illnessRecord(20, 12);
      const mark = dayKeyFromIndex(TODAY_INDEX - 20);
      expect(coverage(record, { lastWithheldDay: mark })).toEqual({
        form: 'absent',
        reason: 'withheld',
      });
      // And this is what it would otherwise have printed — a number that fell because her
      // cat was ill, which is the reading T-16 exists to refuse.
      expect(lookCoverageText(coverage(record, { lastWithheldDay: null }))).toMatch(
        /^Answered 21 of the last 28 days$/,
      );
    });

    it('returns only once the window starts at or after the day she came back', () => {
      const mark = dayKeyFromIndex(TODAY_INDEX - 40);
      // Resumed exactly 27 days ago: the window opens on her first answered day back, so
      // no part of the illness is inside the span the number speaks for.
      expect(coverage(illnessRecord(40, 27), { lastWithheldDay: mark }).form).toBe('window');
      // One day short and the gap is back in range.
      expect(coverage(illnessRecord(40, 26), { lastWithheldDay: mark }).form).toBe('absent');
    });

    it('a mark with NO answered day after it suppresses — she has not come back', () => {
      const record = answeredRange(30, 60);
      const mark = dayKeyFromIndex(TODAY_INDEX - 20);
      expect(coverage(record, { lastWithheldDay: mark }).form).toBe('absent');
    });
  });

  it('a mark that could not be READ suppresses — the safe direction', () => {
    expect(coverage(answered(28), { lastWithheldDay: undefined })).toEqual({
      form: 'absent',
      reason: 'withheld',
    });
  });

  it('a malformed mark suppresses rather than being ignored', () => {
    expect(coverage(answered(28), { lastWithheldDay: 'yesterday' }).form).toBe('absent');
  });

  it('never the saturation form on the way back from a withheld period', () => {
    // T-16's own sentence: the saturation form would make one line mean both "you
    // answered every day" and "your cat was ill".
    const mark = dayKeyFromIndex(TODAY_INDEX - 3);
    const c = coverage(answered(28), { lastWithheldDay: mark });
    expect(c.form).not.toBe('window');
    expect(lookCoverageText(c)).toBeNull();
  });
});

describe('timezone honesty (C-29)', () => {
  it.each(['Pacific/Kiritimati', 'Pacific/Chatham', 'Pacific/Honolulu', 'UTC'])(
    'counts the same rows in %s when the keys are that zone’s own',
    (timeZone) => {
      const index = localDayIndex(NOW, timeZone);
      const record = Array.from({ length: 20 }, (_, i) => ({
        eventId: `e-${i}`,
        localDay: dayKeyFromIndex(index - i),
        createdAt: new Date(NOW - i * 86_400_000).toISOString(),
        outcome: 'nothing_unusual' as const,
        words: [],
        vocabVersion: LOOK_VOCAB_VERSION,
      }));
      expect(
        lookCoverageText(
          lookCoverage(record, { nowMs: NOW, timeZone, withheldNow: false, lastWithheldDay: null }),
        ),
      ).toBe('Answered 20 of the last 28 days');
    },
  );

  it('a look at 11:58 PM local counts on that local day, not the UTC one', () => {
    // The boundary T-19 is written for: the stored key is the DEVICE's day, and this
    // function counts that key rather than re-deriving one.
    const timeZone = 'Pacific/Kiritimati'; // UTC+14 — its local day is ahead of UTC's
    const index = localDayIndex(NOW, timeZone);
    const record = Array.from({ length: 14 }, (_, i) => ({
      eventId: `e-${i}`,
      localDay: dayKeyFromIndex(index - i),
      createdAt: new Date(NOW - i * 86_400_000).toISOString(),
      outcome: 'nothing_unusual' as const,
      words: [],
      vocabVersion: LOOK_VOCAB_VERSION,
    }));
    expect(lookCoverage(record, { nowMs: NOW, timeZone, withheldNow: false, lastWithheldDay: null }).form).toBe('ratio');
  });
});
