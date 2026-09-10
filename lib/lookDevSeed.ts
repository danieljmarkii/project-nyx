// A dev-only seed for Noticed (CUL-868 / N-2).
//
// WHY IT EXISTS. Every floor this feature has is measured in ANSWERED DAYS: the
// coverage footer needs fourteen (Q-13), the first-marked-date receipt needs its own
// denominator behind it, and the same-day pairing needs vomit days that were answered
// (§6.11). None of that can be looked at on a device without two weeks of honest
// tapping — so the device pass (CUL-872) would otherwise only ever see the day-one
// states, which are exactly the states that are already easy to reason about.
//
// WHAT IT WRITES. Twenty-one days of looks for one pet, shaped so the interesting
// states are all reachable at once:
//   • 18 answered days out of the last 21 — past the fourteen-day floor, and NOT
//     saturated, so the coverage line reads as a ratio rather than "28 of 28".
//   • a mix of observed-absence days and word days, with the poles both present, so
//     the positives are visible rather than theoretical.
//   • a FIRST *Off* placed 9 days back, so the first-marked-date receipt has a real
//     date with real coverage behind it.
//   • lip-licking marked on two of three vomit days — a same-day pairing with both
//     sides answered, which is the receipt the third adversarial pass caught the spec
//     computing wrongly. Seeded WITH the vomit rows so the pairing is real, not
//     asserted.
//
// WHAT IT REFUSES. It never runs outside `__DEV__` (a release binary reaches the
// guard and returns), and it writes only through `insertLook`, so every row it makes
// is a row the app could have made — same validation, same day key, same NULL parent
// note. A seed that writes rows the write path could not produce is a seed that tests
// a record the product cannot create.
//
// It is NOT wired to a button. `app/_layout.tsx` hangs it on `globalThis` under
// `__DEV__`, so it is called once from the Metro / debugger console:
//
//     await __seedNoticed('<petId>')
//
// which keeps a shipped, designed screen (the beta shelf, Home) free of a control
// that would have to be hidden from real owners on every one of them.

import { getDb } from './db';
import { insertLook } from './looks';
import { uuid } from './utils';
import { LOOK_WORDS, lookSpeciesOf, type LookSpecies } from '../constants/lookWords';

/** One seeded day: how many days back it sits, its outcome, and its words. */
export interface SeedDay {
  daysAgo: number;
  outcome: 'observed' | 'nothing_unusual';
  words: string[];
  /** Seed a vomit row on this day too, so a pairing has both of its sides. */
  vomit?: boolean;
}

/**
 * The seed's shape, per species — pure, so its arithmetic can be asserted without a
 * database. The word keys are the species' own (a cat never gets `full_walk`), which
 * `insertLook` would refuse anyway; building it here means the refusal never fires.
 */
export function buildLookSeed(species: LookSpecies): SeedDay[] {
  const low = species === 'cat' ? 'hiding' : 'walk_refused';
  const positive = species === 'cat' ? 'played' : 'full_walk';

  const days: SeedDay[] = [
    // The three skipped days (3, 12, 17) are the point of the ratio: an owner who
    // answers most days, not every day, is the one the coverage line is written for.
    { daysAgo: 0, outcome: 'observed', words: ['subdued', 'lip_licking'], vomit: true },
    { daysAgo: 1, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 2, outcome: 'observed', words: [positive] },
    { daysAgo: 4, outcome: 'observed', words: ['lip_licking'], vomit: true },
    { daysAgo: 5, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 6, outcome: 'observed', words: ['sleeping_more'] },
    { daysAgo: 7, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 8, outcome: 'observed', words: [positive, 'lively'] },
    // The first *Off* — nine days back, with a fortnight of answered days behind it.
    { daysAgo: 9, outcome: 'observed', words: ['subdued'] },
    { daysAgo: 10, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 11, outcome: 'observed', words: [low] },
    { daysAgo: 13, outcome: 'nothing_unusual', words: [] },
    // A vomit day the owner did NOT mark lip-licking on: the pairing's other cell,
    // without which the receipt is a numerator with nothing to compare against.
    { daysAgo: 14, outcome: 'observed', words: ['sleeping_more'], vomit: true },
    { daysAgo: 15, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 16, outcome: 'observed', words: [positive] },
    { daysAgo: 18, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 19, outcome: 'observed', words: ['lively'] },
    { daysAgo: 20, outcome: 'nothing_unusual', words: [] },
  ];

  // Every word must be in this species' list — the seed's own version of the check
  // insertLook makes, run here so a typo fails a test rather than a device session.
  const known = new Set(LOOK_WORDS[species].map((w) => w.key));
  for (const day of days) {
    for (const word of day.words) {
      if (!known.has(word)) throw new Error(`buildLookSeed: "${word}" is not a ${species} word`);
    }
  }
  return days;
}

/** Written into the seeded vomit rows' notes so a seeded record is never mistaken
 *  for a real one when the device pass finds something odd. */
export const SEED_MARKER = 'dev seed (CUL-868)';

/**
 * Seed one pet's Noticed record. Dev-only, and it says so by returning rather than
 * throwing: a release binary that somehow reaches this has nothing useful to do, and
 * a throw on a screen an owner is looking at would be worse than a no-op.
 */
export async function seedNoticedLooks(petId: string, species: string): Promise<number> {
  if (!__DEV__) {
    console.warn('[lookDevSeed] refused: dev-only');
    return 0;
  }
  const resolved = lookSpeciesOf(species);
  if (!resolved) {
    console.warn(`[lookDevSeed] refused: no look vocabulary for species "${species}"`);
    return 0;
  }

  const db = getDb();
  const now = Date.now();
  let written = 0;

  for (const day of buildLookSeed(resolved)) {
    // 7:04 PM local, the same hour every day — the hour prints on every entry (§5.4),
    // and a constant one makes a seeded day obvious at a glance.
    const at = new Date(now - day.daysAgo * 86_400_000);
    at.setHours(19, 4, 0, 0);

    await insertLook({
      petId,
      species: resolved,
      outcome: day.outcome,
      words: day.words,
      occurredAt: at,
      // 'manual': the point was chosen, not seeded from the clock (C-10 — a defaulted
      // timestamp is the app's claim, and this one is not the app's).
      occurredAtSource: 'manual',
    });
    written += 1;

    if (day.vomit) {
      const vomitAt = new Date(at.getTime() - 3 * 60 * 60 * 1000);
      const iso = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO events
           (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
            occurred_at_confidence, created_at, updated_at, synced)
         VALUES (?, ?, 'vomit', ?, NULL, ?, 'manual', 'manual', 'witnessed', ?, ?, 0)`,
        [uuid(), petId, vomitAt.toISOString(), SEED_MARKER, iso, iso],
      );
    }
  }

  console.log(`[lookDevSeed] wrote ${written} looks for ${petId}`);
  return written;
}
