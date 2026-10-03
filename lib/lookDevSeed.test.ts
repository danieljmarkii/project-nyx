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
jest.mock('./simpleEvent', () => ({ insertSimpleEvent: jest.fn() }));

import { buildLookSeed, seedLookInstant, seedRefusal, SEED_LOOK_HOUR, SEED_LOOK_MINUTE } from './lookDevSeed';
import { LOOK_WORDS, LOOK_VOCAB_VERSION } from '../constants/lookWords';
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
    vocabVersion: LOOK_VOCAB_VERSION,
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

describe('the Noticed dev seed — never today\'s vomit (CUL-1222)', () => {
  it.each(['cat', 'dog'] as const)('%s: no vomit is seeded on day 0, so no seeded vomit can be in the future', (species) => {
    expect(buildLookSeed(species).filter((d) => d.vomit && d.daysAgo === 0)).toEqual([]);
  });
});

describe('seedLookInstant — today is clamped to now (CUL-1222, BRK-48)', () => {
  // Local-component instants (C-29): the seed places looks in DEVICE-local time, so the
  // fixtures are built from local components and read back through local getters.
  const at = (h: number, m: number) => new Date(2026, 9, 5, h, m, 0, 0).getTime();

  it('a morning seed puts today\'s look a minute ago, never at 7:04 PM', () => {
    // The BRK-48 counterexample: run at 10 AM, the old seed wrote 7:04 PM today, which
    // outranked the PM's 10:05 tap and failed step 6 because of the seed.
    const now = at(10, 0);
    const look = seedLookInstant(0, now);
    expect(look.getTime()).toBe(now - 60_000);
    expect(look.getTime()).toBeLessThan(at(10, 5));
  });

  it('an evening seed keeps 7:04 PM today', () => {
    const look = seedLookInstant(0, at(21, 30));
    expect([look.getHours(), look.getMinutes(), look.getDate()]).toEqual([SEED_LOOK_HOUR, SEED_LOOK_MINUTE, 5]);
  });

  it('a seed just past midnight stays on today, never yesterday', () => {
    const now = at(0, 0) + 20_000;
    const look = seedLookInstant(0, now);
    expect(look.getDate()).toBe(5);
    expect(look.getTime()).toBeLessThanOrEqual(now);
  });

  it('every seeded day is in the past, at every hour of the day', () => {
    for (let h = 0; h < 24; h++) {
      const now = at(h, 30);
      for (const d of buildLookSeed('dog')) expect(seedLookInstant(d.daysAgo, now).getTime()).toBeLessThanOrEqual(now);
    }
  });

  it('a past day is 7:04 PM on that calendar day, by local components', () => {
    const look = seedLookInstant(9, at(10, 0));
    expect([look.getMonth(), look.getDate(), look.getHours(), look.getMinutes()]).toEqual([8, 26, SEED_LOOK_HOUR, SEED_LOOK_MINUTE]);
  });
});

describe('seedRefusal — the fixture account, its own pet, the record\'s species (CUL-1222)', () => {
  const fixture = 'owner+culprit-fixture@example.com';
  const dog = { id: 'p1', species: 'dog' };

  it('proceeds for the fixture account\'s own dog', () => {
    expect(seedRefusal({ isDev: true, email: fixture, pet: dog })).toBeNull();
  });

  it('refuses a release build', () => {
    expect(seedRefusal({ isDev: false, email: fixture, pet: dog })).toBe('dev-only');
  });

  it.each([['owner@example.com'], ['support@getculprit.app'], [null], [undefined]])('refuses %s (the PM\'s record, the demo account, no session)', (email) => {
    expect(seedRefusal({ isDev: true, email, pet: dog })).toMatch(/fixture account only/);
  });

  it('refuses a pet the signed-in account does not hold', () => {
    expect(seedRefusal({ isDev: true, email: fixture, pet: undefined })).toBe('no such pet on this account');
  });

  it('refuses a species with no look vocabulary', () => {
    expect(seedRefusal({ isDev: true, email: fixture, pet: { id: 'p2', species: 'other' } })).toMatch(/no look vocabulary/);
  });
});
