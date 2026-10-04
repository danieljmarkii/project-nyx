// The month's symptom lens (CUL-1553 · GC-7 item 1, the trial's sign). Pure: which
// symptoms are on offer, which one the month opens on, and what it counts.

import { lensEpisodeDays, resolveLens, symptomLenses, VOMIT_LENS } from './monthLens';

const SEPT = { firstKey: '2026-09-01', lastDrawnKey: '2026-09-21' };

describe('symptomLenses', () => {
  it('a vomit-only record (or an empty one) offers vomiting alone, so the month draws no lens row', () => {
    expect(symptomLenses({ ...SEPT, episodeDays: ['2026-09-02', '2026-09-02'] })).toEqual([{ type: 'vomit', days: 1 }]);
    expect(symptomLenses({ ...SEPT, episodeDays: [] })).toEqual([{ type: 'vomit', days: 0 }]);
  });

  it('the itchy trial dog opens on itching: the most days in the shown month wins (PM, 2026-10-04)', () => {
    const lenses = symptomLenses({
      ...SEPT,
      episodeDays: ['2026-09-03', '2026-09-10'],
      symptomEntryDays: { itch: ['2026-09-01', '2026-09-01', '2026-09-04', '2026-09-06'], diarrhea: ['2026-09-08'] },
    });
    expect(lenses.map((l) => l.type)).toEqual(['itch', 'vomit', 'diarrhea']);
    // Days, not entries: two itch rows on Sep 1 are one day.
    expect(lenses[0]).toEqual({ type: 'itch', days: 3 });
  });

  it('a tie goes to vomiting, then to the symptom list\'s own order — a total order', () => {
    const lenses = symptomLenses({
      ...SEPT,
      episodeDays: ['2026-09-03'],
      symptomEntryDays: { cough: ['2026-09-05'], itch: ['2026-09-04'] },
    });
    expect(lenses.map((l) => l.type)).toEqual(['vomit', 'itch', 'cough']);
  });

  it('vomiting\'s days are its rose days: the days a bout continues into count, once each', () => {
    const lenses = symptomLenses({
      ...SEPT,
      episodeDays: ['2026-09-03'],
      continuationDays: [{ day: '2026-09-04', from: '2026-09-03' }],
      symptomEntryDays: { itch: ['2026-09-07'] },
    });
    expect(lenses[0]).toEqual({ type: 'vomit', days: 2 });
  });

  it('only the shown month\'s arrived days are counted; a symptom read on the bars outside them is still offered', () => {
    const lenses = symptomLenses({
      ...SEPT,
      episodeDays: [],
      // Aug 20 is on the bars, Sep 25 is after today: neither is a day of the shown month so far.
      symptomEntryDays: { itch: ['2026-08-20', '2026-09-25'] },
    });
    expect(lenses).toEqual([{ type: 'itch', days: 0 }]);
  });

  it('an itch-only dog is never offered vomiting; vomiting stands in only for an empty read (the product read)', () => {
    expect(symptomLenses({ ...SEPT, episodeDays: [], symptomEntryDays: { itch: ['2026-09-04'] } })).toEqual([{ type: 'itch', days: 1 }]);
    // A bout continuing in from before the read still puts vomiting on offer.
    expect(
      symptomLenses({ ...SEPT, episodeDays: [], continuationDays: [{ day: '2026-09-02', from: '2026-09-01' }], symptomEntryDays: { itch: ['2026-09-04'] } }).map((l) => l.type),
    ).toEqual(['vomit', 'itch']);
  });

  it('an empty entry list is no lens; vomit in the entries map is ignored (it has its own rule)', () => {
    const lenses = symptomLenses({ ...SEPT, episodeDays: [], symptomEntryDays: { itch: [], vomit: ['2026-09-02'] } });
    expect(lenses).toEqual([{ type: 'vomit', days: 0 }]);
  });
});

describe('resolveLens', () => {
  const lenses = [
    { type: 'itch', days: 3 },
    { type: 'vomit', days: 1 },
  ];
  it('the owner\'s choice holds while it is on offer; otherwise the default', () => {
    expect(resolveLens(lenses, null)).toBe('itch');
    expect(resolveLens(lenses, 'vomit')).toBe('vomit');
    expect(resolveLens(lenses, 'cough')).toBe('itch');
    expect(resolveLens([], null)).toBe(VOMIT_LENS);
  });
});

describe('lensEpisodeDays', () => {
  it('vomiting counts episodes; every other symptom counts entries; an absent symptom counts nothing', () => {
    const facts = { episodeDays: ['2026-09-02'], symptomEntryDays: { itch: ['2026-09-01', '2026-09-01'] } };
    expect(lensEpisodeDays('vomit', facts)).toEqual(['2026-09-02']);
    expect(lensEpisodeDays('itch', facts)).toEqual(['2026-09-01', '2026-09-01']);
    expect(lensEpisodeDays('cough', facts)).toEqual([]);
  });
});
