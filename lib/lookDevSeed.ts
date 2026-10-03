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
// WHAT IT REFUSES (rebuilt at CUL-1222 after BRK-48). It never runs outside `__DEV__`,
// never on an account that is not the device-pass fixture account (lib/deviceFixture.ts),
// and never on a pet that account does not own; the species is read off the pet record.
// It writes only through the shipped write paths (`insertLook`, `insertSimpleEvent`), so
// every row it makes is a row the app could have made — same validation, same day key,
// same push and regen. A seed that writes rows the write path could not produce is a
// seed that tests a record the product cannot create.
//
// It is NOT wired to a button. `app/_layout.tsx` hangs it on `globalThis` under
// `__DEV__`, so it is called once from the Metro / debugger console:
//
//     await __seedNoticed('Pepper')     // a pet name or id
//
// against the fixture account's Pepper (scripts/fixture/fixtureStory.ts, whose Deno test
// certifies Pepper's Signal WITH the vomits this writes). Keeping it on the console keeps
// a shipped, designed screen (the beta shelf, Home) free of a control that would have to
// be hidden from real owners on every one of them.

import { getDb } from './db';
import { insertLook, loadLookDays, localDayForLook } from './looks';
import { insertSimpleEvent } from './simpleEvent';
import { FIXTURE_EMAIL_TAG, isFixtureEmail } from './deviceFixture';
import { useAuthStore } from '../store/authStore';
import { usePetStore } from '../store/petStore';
import { useSyncStore } from '../store/syncStore';
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
    // Today is answered but carries no vomit (CUL-1222): the seed's pet is the fixture
    // account's "quiet" Home, and a vomit today plus one four days back reads to the
    // engine as a week that doubled — a safety card on the one pet meant to have none.
    { daysAgo: 0, outcome: 'observed', words: ['subdued'] },
    { daysAgo: 1, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 2, outcome: 'observed', words: [positive] },
    { daysAgo: 4, outcome: 'observed', words: ['lip_licking'], vomit: true },
    { daysAgo: 5, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 6, outcome: 'observed', words: ['sleeping_more'] },
    { daysAgo: 7, outcome: 'nothing_unusual', words: [] },
    { daysAgo: 8, outcome: 'observed', words: ['lip_licking', 'lively'], vomit: true },
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

/** The hour the seeded looks sit at — constant, so a seeded day is obvious at a glance
 *  (the hour prints on every entry, §5.4). Vomits sit three hours before it. */
export const SEED_LOOK_HOUR = 19;
export const SEED_LOOK_MINUTE = 4;
export const SEED_VOMIT_LEAD_MS = 3 * 60 * 60 * 1000;

/**
 * Where one seeded look sits, in device-local time: 7:04 PM on its day, and TODAY never
 * later than a minute ago nor earlier than today's local midnight (CUL-1222, BRK-48). The
 * old seed set 7:04 PM on today too, so a morning seed wrote a FUTURE look that outranked
 * the PM's own 10:05 tap and failed the step it existed to feed. Built from local date
 * components rather than by subtracting 24h multiples, so a DST change inside the window
 * cannot move a seeded day onto its neighbour.
 */
export function seedLookInstant(daysAgo: number, nowMs: number): Date {
  const now = new Date(nowMs);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, SEED_LOOK_HOUR, SEED_LOOK_MINUTE, 0, 0);
  if (daysAgo > 0) return at;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return new Date(Math.max(midnight.getTime(), Math.min(at.getTime(), nowMs - 60_000)));
}

/** Why a seed run wrote nothing, or `null` when it may proceed. */
export function seedRefusal(args: {
  isDev: boolean;
  email: string | null | undefined;
  pet: { id: string; species: string } | undefined;
}): string | null {
  if (!args.isDev) return 'dev-only';
  // The fixture account and nothing else (CUL-1222, MFU-10): every row this writes is a
  // made-up health record, and on any other account it lands in a real pet's history.
  if (!isFixtureEmail(args.email)) return `fixture account only (an email ending ${FIXTURE_EMAIL_TAG}@…)`;
  // The pet is the signed-in account's own, and its species is the RECORD's, never a
  // caller's argument: the old seed took both on trust and would write dog words to a cat.
  if (!args.pet) return 'no such pet on this account';
  if (!lookSpeciesOf(args.pet.species)) return `no look vocabulary for species "${args.pet.species}"`;
  return null;
}

/**
 * Seed one fixture pet's Noticed record: `await __seedNoticed('Pepper')` (a name or an
 * id) from the Metro console, signed in as the fixture account (docs/device-pass-fixture-runbook.md).
 *
 * Every row goes through a write path the app ships — looks through `insertLook`, vomits
 * through `insertSimpleEvent` (which queues the push and the Signal regen the old raw
 * INSERT skipped). And it is IDEMPOTENT BY DAY rather than by id: a day that already holds
 * a look keeps it, and a day that already holds a seeded vomit gets no second one, so a
 * re-run fills only what is missing and never doubles a count the sitting is judging. Ids
 * stay the write paths' own; a seed that minted its own ids would need a parameter on two
 * production writers that only it would ever pass.
 */
export async function seedNoticedLooks(petIdOrName: string): Promise<number> {
  const email = useAuthStore.getState().session?.user?.email;
  // By id, or by name (`__seedNoticed('Pepper')`) so the console call needs no lookup —
  // either way only among the signed-in account's own pets.
  const wanted = petIdOrName.trim().toLowerCase();
  const pet = usePetStore
    .getState()
    .pets.find((p) => p.id === petIdOrName || p.name.trim().toLowerCase() === wanted);
  const refusal = seedRefusal({ isDev: __DEV__, email, pet });
  if (refusal || !pet) {
    console.warn(`[lookDevSeed] refused: ${refusal}`);
    return 0;
  }
  const species = lookSpeciesOf(pet.species) as LookSpecies;
  const petId = pet.id;

  const nowMs = Date.now();
  let written = 0;
  try {
    const answered = new Set((await loadLookDays(petId)).map((r) => r.localDay));
    const vomitDays = await seededVomitDays(petId);

    for (const day of buildLookSeed(species)) {
      const at = seedLookInstant(day.daysAgo, nowMs);
      const key = localDayForLook(at);

      if (!answered.has(key)) {
        await insertLook({
          petId,
          species,
          outcome: day.outcome,
          words: day.words,
          occurredAt: at,
          // 'manual': the point was chosen, not seeded from the clock (C-10 — a defaulted
          // timestamp is the app's claim, and this one is not the app's).
          occurredAtSource: 'manual',
        });
        answered.add(key);
        written += 1;
      }

      // A seeded vomit is never today's (buildLookSeed's rule, pinned by its test), so it is
      // always in the past and always on its look's day.
      if (day.vomit && !vomitDays.has(key)) {
        await insertSimpleEvent({
          petId,
          eventType: 'vomit',
          confidence: 'witnessed',
          occurredAt: new Date(at.getTime() - SEED_VOMIT_LEAD_MS),
          earliest: null,
          latest: null,
          source: 'manual',
          notes: SEED_MARKER,
        });
        vomitDays.add(key);
      }
    }
    console.log(`[lookDevSeed] wrote ${written} looks for ${pet.name}`);
  } catch (e) {
    // A failure partway leaves what landed in place; re-running fills only the missing
    // days, so the fix is to run it again, and the console says how far it got.
    console.warn(`[lookDevSeed] stopped after ${written} looks for ${pet.name}:`, e);
  } finally {
    // Screens re-read whatever landed locally, as they do after a hydration.
    useSyncStore.getState().bumpHydrationTick();
  }
  return written;
}

/** The local days that already hold a vomit this seed wrote (its SEED_MARKER note). */
async function seededVomitDays(petId: string): Promise<Set<string>> {
  const rows = await getDb().getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events
      WHERE pet_id = ? AND event_type = 'vomit' AND notes = ? AND deleted_at IS NULL`,
    [petId, SEED_MARKER],
  );
  return new Set(rows.map((r) => localDayForLook(new Date(r.occurred_at))));
}
