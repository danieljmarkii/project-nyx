// The dev seed's arithmetic (CUL-868 / N-2).
//
// The seed exists so the device pass can SEE the floors, which means its shape has to
// actually clear them — a seed that lands on 13 answered days would send the PM
// looking for a bug in the coverage footer that is only a bug in the fixture. So the
// numbers that matter are asserted here rather than discovered on a phone.

// `buildLookSeed` is pure, but its module imports the write path, which imports the
// sync layer and therefore the Supabase client. Mocked so this stays a unit test of
// the seed's ARITHMETIC — nothing here writes a row.
jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(), syncPendingLooks: jest.fn() }));
jest.mock('./db', () => ({ getDb: () => ({}) }));

import { buildLookSeed } from './lookDevSeed';
import { LOOK_WORDS } from '../constants/lookWords';
import { answeredDays, absenceDays, wordDays, answeredVomitDays, type LookDayRow } from './looks';

/** The seed's days as the day-count module would see them, so the assertions below
 *  run through the SHIPPED counters rather than re-implementing them here. */
function asRecord(species: 'cat' | 'dog'): LookDayRow[] {
  return buildLookSeed(species).map((d, i) => ({
    // The counters key on the day string only; a stable synthetic key is enough and
    // keeps this test off the clock (C-29: no calendar literal is being judged). The
    // row identity fields are likewise synthetic: nothing in the DAY COUNTS reads them
    // (they are the receipts' attachment tie-break, CUL-873), and inventing a plausible
    // uuid here would suggest otherwise.
    eventId: `e-${i}`,
    localDay: `d-${String(d.daysAgo).padStart(2, '0')}`,
    createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
    outcome: d.outcome,
    words: d.words,
  }));
}

describe.each(['cat', 'dog'] as const)('the Noticed dev seed — %s', (species) => {
  const seed = buildLookSeed(species);
  const record = asRecord(species);

  it('clears the fourteen-answered-day floor without saturating the window', () => {
    expect(answeredDays(record)).toBe(18);
    // Not 21: the skipped days are what make the coverage line a RATIO. A saturated
    // seed would hide the only state the footer has three forms for.
    expect(answeredDays(record)).toBeLessThan(21);
    expect(answeredDays(record)).toBeGreaterThanOrEqual(14);
  });

  it('carries observed-absence days AND word days, so both marks are visible', () => {
    expect(absenceDays(record)).toBeGreaterThan(0);
    expect(absenceDays(record)).toBeLessThan(answeredDays(record));
  });

  it('places a first Off with a fortnight of answered days behind it', () => {
    const offDays = seed.filter((d) => d.words.includes('subdued')).map((d) => d.daysAgo);
    expect(offDays.length).toBeGreaterThan(0);
    const first = Math.max(...offDays);
    // Days OLDER than the first Off are the coverage behind it; the receipt's floor is
    // its own denominator (Q-13), so there must be enough of them to print one.
    expect(seed.filter((d) => d.daysAgo > first).length).toBeGreaterThanOrEqual(9);
  });

  it('seeds a same-day pairing with BOTH sides answered (§6.11)', () => {
    const vomitDays = seed.filter((d) => d.vomit).map((d) => `d-${String(d.daysAgo).padStart(2, '0')}`);
    // Every seeded vomit day is an answered day — otherwise the pairing's two
    // denominators would differ, which is the defect the receipt exists to avoid.
    expect(answeredVomitDays(record, vomitDays)).toBe(vomitDays.length);
    // And the margin has both cells: lip-licking on some vomit days, not all.
    const marked = vomitDays.filter((day) => wordDays(record.filter((r) => r.localDay === day), 'lip_licking') > 0);
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.length).toBeLessThan(vomitDays.length);
  });

  it('carries both poles — the good direction is in the seed, not just the bad', () => {
    const words = new Set(seed.flatMap((d) => d.words));
    const positives = LOOK_WORDS[species].filter((w) => w.kind === 'positive').map((w) => w.key);
    expect(positives.some((k) => words.has(k))).toBe(true);
  });

  it('every seeded word is a word of this species', () => {
    const known = new Set(LOOK_WORDS[species].map((w) => w.key));
    const strangers = seed.flatMap((d) => d.words).filter((w) => !known.has(w));
    expect(strangers).toEqual([]);
  });

  it('an absence day carries no words, and an observed day carries some', () => {
    for (const day of seed) {
      if (day.outcome === 'nothing_unusual') expect(day.words).toEqual([]);
      else expect(day.words.length).toBeGreaterThan(0);
    }
  });

  it('no day is seeded twice', () => {
    const daysAgo = seed.map((d) => d.daysAgo);
    expect(new Set(daysAgo).size).toBe(daysAgo.length);
  });
});
