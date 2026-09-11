// The receipts (CUL-873 / N-4b) — §3.3 part 1, §6.9, T-18, and the PM's two rulings of
// 2026-09-10 (the label frame; one receipt per entry).
//
// Every fixture is anchored to `Date.now()` and built from LOCAL day components (C-29 /
// CUL-831): the four-week window is rolling and judged against the real clock, and the CI
// matrix runs this at UTC+14 / +12:45 / −10.

jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));

import { receiptsFor, leadReceipt, LOOK_RECEIPT_COUNT_FLOOR_DAYS } from './lookReceipts';
import { lookCoverage } from './lookCoverage';
import { localDayIndex, dayKeyFromIndex } from './utils';
import type { LookDayRow } from './looks';
import { LOOK_VOCAB_VERSION } from '../constants/lookWords';

const NOW = Date.now();
const TODAY = localDayIndex(NOW);
const PET = { petName: 'Mochi', pet: { species: 'dog', sex: 'male' as const }, nowMs: NOW, withheld: false };

function day(daysAgo: number): string {
  return dayKeyFromIndex(TODAY - daysAgo);
}

/** A look row `daysAgo` days back. `seq` orders rows within one day. */
function look(daysAgo: number, words: string[] = [], seq = 0): LookDayRow {
  return {
    eventId: `e-${daysAgo}-${seq}`,
    localDay: day(daysAgo),
    createdAt: new Date(NOW - daysAgo * 86_400_000 + seq * 3_600_000).toISOString(),
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
    vocabVersion: LOOK_VOCAB_VERSION,
  };
}

/** `n` quiet answered days, oldest first, ending `endingDaysAgo` days back. */
function quiet(n: number, endingDaysAgo = 1): LookDayRow[] {
  return Array.from({ length: n }, (_, i) => look(endingDaysAgo + i));
}

function entryOf(row: LookDayRow) {
  return { eventId: row.eventId, localDay: row.localDay, words: row.words };
}

describe('the first-day form', () => {
  it('renders at 14+ prior answered days, in the ruled label frame', () => {
    const today = look(0, ['subdued']);
    const record = [today, ...quiet(20)];
    const receipts = receiptsFor(entryOf(today), record, PET);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].form).toBe('first_day');
    expect(receipts[0].text).toMatch(/^First day you’ve marked off for Mochi — in the 20 days you’d answered before it, since /);
    // The denominator carries its year — the date stands in no band (C-19).
    expect(receipts[0].text).toMatch(/\d{4}\.$/);
  });

  it('is grammatical for the heads the ruled-out frame broke on', () => {
    for (const [word, head] of [
      ['outside_box', 'accident indoors'],
      ['eating_grass', 'eating grass'],
      ['walk_refused', 'didn’t want the walk'],
      ['not_greeting', 'not greeting at the door'],
    ] as const) {
      const today = look(0, [word]);
      const receipts = receiptsFor(entryOf(today), [today, ...quiet(20)], PET);
      expect(receipts[0].text).toContain(`First day you’ve marked ${head} for Mochi`);
    }
  });

  it('is ABSENT below the floor — a naked novelty claim is reassurance by implication', () => {
    const today = look(0, ['subdued']);
    const receipts = receiptsFor(entryOf(today), [today, ...quiet(13)], PET);
    expect(receipts.some((r) => r.form === 'first_day')).toBe(false);
  });

  it('a worried owner on answered-day 4 reads no receipt at all', () => {
    // Below BOTH floors: the novelty claim has no warrant and the window has no
    // denominator worth speaking. The entry stands alone.
    const today = look(0, ['subdued']);
    expect(receiptsFor(entryOf(today), [today, ...quiet(3)], PET)).toEqual([]);
  });

  it('a backdated first Off BEFORE the record’s first answered day renders nothing', () => {
    // Zero denominator — the naked receipt by another route (T-18).
    const backdated = look(40, ['subdued']);
    const record = [...quiet(20), backdated];
    expect(receiptsFor(entryOf(backdated), record, PET)).toEqual([]);
  });

  it('a backdated EARLIER Off moves the first day off today’s entry', () => {
    const today = look(0, ['subdued']);
    const earlier = look(5, ['subdued']);
    const record = [today, earlier, ...quiet(20, 6)];
    // Today's entry is no longer the first day, so it takes the count form instead.
    const receipts = receiptsFor(entryOf(today), record, PET);
    expect(receipts.map((r) => r.form)).toEqual(['count']);
    // …and the earlier entry now owns the first-day line.
    expect(receiptsFor(entryOf(earlier), record, PET)[0].form).toBe('first_day');
  });

  it('Undo of the first Off re-arms the form on the next', () => {
    const first = look(5, ['subdued']);
    const second = look(0, ['subdued']);
    const before = [second, first, ...quiet(20, 6)];
    expect(receiptsFor(entryOf(second), before, PET)[0].form).toBe('count');
    // `loadLookDays` drops the reversed row through the parent, so an Undo reaches this
    // function as the row simply not being in the record — nothing is latched.
    const after = before.filter((r) => r.eventId !== first.eventId);
    expect(receiptsFor(entryOf(second), after, PET)[0].form).toBe('first_day');
  });
});

describe('the count form', () => {
  it('renders at the floor, with its date clause', () => {
    const today = look(0, ['subdued']);
    const record = [today, look(3, ['subdued']), look(6, ['subdued']), ...quiet(16, 8)];
    const receipts = receiptsFor(entryOf(today), record, PET);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].form).toBe('count');
    expect(receipts[0].text).toMatch(/^Off on 3 of the \d+ days you’ve answered in the last four weeks · first /);
  });

  it('is absent below its own floor — a month’s first day never reads "1 of the 1"', () => {
    const today = look(0, ['subdued']);
    const record = [today, ...quiet(LOOK_RECEIPT_COUNT_FLOOR_DAYS - 2)];
    expect(receiptsFor(entryOf(today), record, PET)).toEqual([]);
  });

  it('the count form and the FOOTER share one floor — the card never prints a denominator it also refuses', () => {
    // The product review's finding: at nine answered days the first draft rendered *Off on
    // 1 of the 9 days you've answered* with no coverage line two rows below it. The two
    // numbers are now one number, and this is what keeps them one.
    const today = look(0, ['subdued']);
    const nine = [today, ...quiet(8)];
    expect(receiptsFor(entryOf(today), nine, PET)).toEqual([]);
    expect(
      lookCoverage(nine, { nowMs: NOW, withheldNow: false, lastWithheldDay: null }).form,
    ).toBe('absent');
    // …and they arrive together.
    const fourteen = [today, ...quiet(13)];
    expect(receiptsFor(entryOf(today), fourteen, PET)).toHaveLength(1);
    expect(
      lookCoverage(fourteen, { nowMs: NOW, withheldNow: false, lastWithheldDay: null }).form,
    ).toBe('ratio');
  });

  it('the denominator is the WINDOW’s answered days, never the record’s age', () => {
    const today = look(0, ['subdued']);
    const record = [today, look(5, ['subdued']), ...quiet(20, 6), ...quiet(120, 40)];
    const text = receiptsFor(entryOf(today), record, PET)[0].text;
    // 28-day window: today + day 5 + the quiet days 6..25 = 22 answered inside it.
    expect(text).toContain('of the 22 days you’ve answered in the last four weeks');
  });

  it('the numerator counts DAYS, not looks — a word marked twice in a day counts once', () => {
    const morning = look(0, ['subdued'], 0);
    const evening = look(0, ['subdued'], 1);
    const record = [morning, evening, look(4, ['subdued']), ...quiet(16, 6)];
    expect(receiptsFor(entryOf(morning), record, PET)[0].text).toMatch(/^Off on 2 of the/);
  });

  it('a five-week-old first date is DROPPED, never carried into a four-week count', () => {
    const today = look(0, ['subdued']);
    const record = [today, look(35, ['subdued']), ...quiet(20, 1)];
    const text = receiptsFor(entryOf(today), record, PET)[0].text;
    expect(text).not.toContain('· first');
    expect(text).toMatch(/four weeks\.$/);
  });

  it('the date clause is dropped when the first day is TODAY — it would repeat the hour', () => {
    // Reachable in exactly ONE configuration now that the two floors meet: thirteen
    // answered days before today floors out the first-day form (13 < 14) while today makes
    // the window's fourteenth, so the count form speaks and its date clause has nowhere to
    // point but the hour on the entry above it.
    const today = look(0, ['subdued']);
    const record = [today, ...quiet(13)];
    const receipts = receiptsFor(entryOf(today), record, PET);
    expect(receipts.map((r) => r.form)).toEqual(['count']);
    expect(receipts[0].text).toMatch(
      /^Off on 1 of the 14 days you’ve answered in the last four weeks\.$/,
    );
  });
});

describe('what earns nothing', () => {
  it('the observed absence earns none — a run of quiet days is never counted aloud', () => {
    const today = look(0, []);
    expect(receiptsFor(entryOf(today), [today, ...quiet(30)], PET)).toEqual([]);
  });

  it('an activity word earns none — "first day Mochi has seemed lively" is a wellness receipt', () => {
    const today = look(0, ['lively']);
    expect(receiptsFor(entryOf(today), [today, ...quiet(30)], PET)).toEqual([]);
    const played = look(0, ['played']);
    expect(receiptsFor(entryOf(played), [played, ...quiet(30)], PET)).toEqual([]);
  });

  it('a concern word beside an activity word earns exactly the concern’s line', () => {
    const today = look(0, ['lively', 'subdued']);
    const receipts = receiptsFor(entryOf(today), [today, ...quiet(20)], PET);
    expect(receipts.map((r) => r.word)).toEqual(['subdued']);
  });

  it('the opening chip IS a concern — the chief complaint earns its first day', () => {
    const today = look(0, ['not_herself']);
    const receipts = receiptsFor(entryOf(today), [today, ...quiet(20)], PET);
    expect(receipts[0].form).toBe('first_day');
    expect(receipts[0].text).toContain('First day you’ve marked not himself for Mochi');
  });

  it('a key this build cannot name earns nothing rather than a placeholder', () => {
    const today = look(0, ['from_a_future_vocabulary']);
    expect(receiptsFor(entryOf(today), [today, ...quiet(30)], PET)).toEqual([]);
  });
});

describe('attachment — the entry that earned it (rule 4)', () => {
  it('the EARLIEST look of the day owns the line; a later look never takes it over', () => {
    const morning = look(0, ['subdued'], 0);
    const afternoon = look(0, ['subdued'], 1);
    const record = [morning, afternoon, ...quiet(20)];
    expect(receiptsFor(entryOf(morning), record, PET)).toHaveLength(1);
    expect(receiptsFor(entryOf(afternoon), record, PET)).toEqual([]);
  });

  it('a good afternoon never removes the morning’s concern', () => {
    const morning = look(0, ['subdued'], 0);
    const afternoon = look(0, ['lively'], 1);
    const record = [morning, afternoon, ...quiet(20)];
    expect(receiptsFor(entryOf(morning), record, PET)[0].form).toBe('first_day');
    expect(receiptsFor(entryOf(afternoon), record, PET)).toEqual([]);
  });

  it('an Undo of the owning look re-derives the line onto the next-earliest', () => {
    const morning = look(0, ['subdued'], 0);
    const afternoon = look(0, ['subdued'], 1);
    const record = [morning, afternoon, ...quiet(20)];
    expect(receiptsFor(entryOf(afternoon), record, PET)).toEqual([]);
    const afterUndo = record.filter((r) => r.eventId !== morning.eventId);
    expect(receiptsFor(entryOf(afternoon), afterUndo, PET)[0].form).toBe('first_day');
  });

  it('ties on created_at break by row id, deterministically', () => {
    const a = { ...look(0, ['subdued'], 0), eventId: 'e-bbb' };
    const b = { ...look(0, ['subdued'], 0), eventId: 'e-aaa' };
    const record = [a, b, ...quiet(20)];
    expect(receiptsFor(entryOf(b), record, PET)).toHaveLength(1);
    expect(receiptsFor(entryOf(a), record, PET)).toEqual([]);
  });
});

describe('under withholding (floor item 12)', () => {
  const withheld = { ...PET, withheld: true };

  it('a symptom word renders the BARE first date, never a rate', () => {
    const today = look(0, ['subdued']);
    const record = [today, look(8, ['subdued']), ...quiet(20)];
    const receipts = receiptsFor(entryOf(today), record, withheld);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].form).toBe('withheld_first');
    expect(receipts[0].text).toMatch(/^Off — first marked /);
    // No numerator, no denominator — nothing the withheld absence count could be read
    // back out of by subtraction.
    expect(receipts[0].text).not.toMatch(/\d+ of the \d+/);
    expect(receipts[0].text).not.toContain('answered');
  });

  it('never today’s own date — it would repeat the entry’s hour', () => {
    const today = look(0, ['subdued']);
    expect(receiptsFor(entryOf(today), [today, ...quiet(20)], withheld)).toEqual([]);
  });

  it('the absence still earns nothing', () => {
    const today = look(0, []);
    expect(receiptsFor(entryOf(today), [today, ...quiet(20)], withheld)).toEqual([]);
  });
});

describe('one receipt per entry (PM-ruled 2026-09-10)', () => {
  it('two first-marked words return two, and the card leads with the first chosen', () => {
    const today = look(0, ['limping', 'subdued']);
    const record = [today, ...quiet(20)];
    const receipts = receiptsFor(entryOf(today), record, PET);
    expect(receipts.map((r) => r.word)).toEqual(['limping', 'subdued']);
    expect(leadReceipt(receipts)?.word).toBe('limping');
  });

  it('the first-day form outranks the count form whatever the word order', () => {
    // `subdued` is old news; `limping` is new today. The novelty leads even though the
    // owner tapped it second.
    const today = look(0, ['subdued', 'limping']);
    const record = [today, look(9, ['subdued']), ...quiet(20)];
    const receipts = receiptsFor(entryOf(today), record, PET);
    expect(leadReceipt(receipts)?.form).toBe('first_day');
    expect(leadReceipt(receipts)?.word).toBe('limping');
  });

  it('leadReceipt of nothing is null', () => {
    expect(leadReceipt([])).toBeNull();
  });
});

describe('the pet’s own species reads first', () => {
  it('a shared key reads in HER copy — outside_box is the cat’s tray, the dog’s accident', () => {
    const today = look(0, ['outside_box']);
    const record = [today, ...quiet(20)];
    const cat = receiptsFor(entryOf(today), record, {
      ...PET,
      pet: { species: 'cat', sex: 'female' },
      petName: 'Pixel',
    });
    expect(cat[0].text).toContain('outside the box');
    const dog = receiptsFor(entryOf(today), record, PET);
    expect(dog[0].text).toContain('accident indoors');
  });
});
