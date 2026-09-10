// The look — the one write path, and the one place a look row is grouped by day.
//
// CUL-868 / N-2. docs/nyx-daily-look-requirements.md §5 (the record), T-5 (a look
// never enters the engine), T-14 / T-19 (the day model), §5.5 (the build checklist).
//
// TWO HALVES, ONE FILE, DELIBERATELY:
//
//   1. `insertLook` — the single durable write, on the `insertMeal` shape
//      (lib/meals.ts): both rows in ONE transaction, the queue push, and NOTHING
//      else. In particular NO `triggerSignalRegenDebounced`: a look never enters
//      the engine (T-5), so a regen would be the app asking the detector to
//      re-read a record that did not change in any way it can see. Asserted by
//      test, because "we did not call it" is exactly the kind of fact that decays.
//
//   2. The day counts — `answeredDays`, `wordDays`, `absenceDays`,
//      `answeredVomitDays`. THE DAY IS THE UNIT AND `local_day` IS THE KEY (T-14,
//      T-19). They are here, together, before there are two consumers, because the
//      diet-trial §5.3 lesson says what happens otherwise: two surfaces re-derive
//      "the same" count from the same rows and disagree by a denominator. The
//      card's footer, the receipts, Patterns and the report's client mirror all
//      call these; the report's SERVER counts read the same stored key.
//
// THE JOIN EVERY READ MAKES, STATED ONCE. `looks` has no `deleted_at` of its own —
// deletedness reads through the parent (the `medication_administrations` rule), and
// after an Undo the child row survives, live-looking, note and all. So every read
// in this file joins `events` and drops `deleted_at IS NOT NULL` (spec §9 rule 2).
// `loadLookDays` is the ONLY reader, which is what makes "stated once" true rather
// than repeated.

import { getDb } from './db';
import { syncPendingEvents, syncPendingLooks } from './sync';
import { uuid, localDayIndex, dayKeyFromIndex } from './utils';
import { wordsToLocalText, wordsFromLocalText } from './lookWordsCodec';
import { LOOK_VOCABULARY, LOOK_VOCAB_VERSION, type LookSpecies } from '../constants/lookWords';

/** The two outcomes (migration 064's CHECK). 'nothing_unusual' is the
 *  observed-absence row (L-6) — a real answer, never "no data". */
export type LookOutcome = 'observed' | 'nothing_unusual';

export interface InsertLookParams {
  petId: string;
  /** The vocabulary the words came from — the PET's species, resolved by the
   *  caller through `lookSpeciesOf`. Present so the write can validate the keys
   *  against the right list; a pet with no list has no card and never gets here. */
  species: LookSpecies;
  outcome: LookOutcome;
  /** Closed keys from `constants/lookWords.ts`. Non-empty iff outcome is
   *  'observed' — the DB does not hold that rule (the 032 precedent), so this
   *  write does. */
  words: readonly string[];
  /** When the owner looked. Clock-seeded on the card; a "Change time" edit is
   *  N-3's and re-derives `local_day` with the point (C-10). */
  occurredAt: Date;
  /** 'now' when clock-seeded, 'manual' when the owner set the point (C-10: a
   *  defaulted timestamp is the app's claim, and it must say so). */
  occurredAtSource: 'manual' | 'now';
  /** Explicit IANA zone for the local-day derivation. Production passes nothing —
   *  the DEVICE zone is the owner's midnight and that is the whole point of the
   *  column. It exists so a timezone-honest fixture can pin the boundary instead
   *  of assuming the runner's (C-29). */
  timeZone?: string;
}

export interface InsertLookResult {
  eventId: string;
  lookId: string;
  /** ISO occurred_at written to the parent — use it for the store/beat so the
   *  in-memory row mirrors the DB exactly. */
  occurredAtIso: string;
  /** The stored 'YYYY-MM-DD' day key. Returned because it is DERIVED here and
   *  every count is keyed on it: a caller that re-derives its own would be the
   *  two-clocks bug T-19 exists to stop. */
  localDay: string;
  /** ISO created_at/updated_at written to both rows. */
  now: string;
}

/**
 * The local day a look at this instant belongs to, in the owner's zone.
 *
 * Exported because "Change time" (N-3) must re-derive it with exactly this rule
 * when — and ONLY when — `occurred_at` actually moves (C-10: a peek-and-save is a
 * real gesture that changed nothing, and it must not move the day key). The server
 * bounds the result to ±1 day of the parent's UTC date; the widest real offsets are
 * −12/+14, so an honest device is always inside that.
 */
export function localDayForLook(occurredAt: Date, timeZone?: string): string {
  return dayKeyFromIndex(localDayIndex(occurredAt.getTime(), timeZone));
}

/**
 * Write a look: the parent `check_in` event and its `looks` child, then push.
 *
 * Throws if the local write fails so the caller's guard can react; the push is
 * fire-and-forget and never throws into the caller (the `insertMeal` contract).
 */
export async function insertLook(params: InsertLookParams): Promise<InsertLookResult> {
  const { petId, species, outcome, words, occurredAt, occurredAtSource, timeZone } = params;

  // The two client-only rules migration 064 deliberately does not hold (its N2/N4
  // findings, routed here): the DB accepted 20,000 keys and an empty observation.
  // Both are programming errors rather than anything an owner can produce — there
  // is no free-text word (§4.1 rule 10) — so they throw rather than degrade, and
  // they throw BEFORE the transaction so a refused look writes nothing at all.
  const seen = new Set(words);
  if (outcome === 'observed' && seen.size === 0) {
    throw new Error('insertLook: an observed look must carry at least one word');
  }
  if (outcome === 'nothing_unusual' && seen.size > 0) {
    throw new Error('insertLook: a nothing_unusual look carries no words');
  }
  for (const word of seen) {
    if (!LOOK_VOCABULARY[species].has(word)) {
      throw new Error(`insertLook: "${word}" is not a ${species} look word`);
    }
  }

  const db = getDb();
  const now = new Date().toISOString();
  const occurredAtIso = occurredAt.toISOString();
  const localDay = localDayForLook(occurredAt, timeZone);
  const eventId = uuid();
  const lookId = uuid();

  // Both rows in ONE transaction (the B-126 rule, and here it is load-bearing twice
  // over): a parent that landed without its child would sync a `check_in` event the
  // record asserts happened and can say nothing about — and the server's
  // trg_looks_same_pet would then refuse the child forever if the parent were
  // missing instead. withTransactionAsync rolls both back on any throw.
  await db.withTransactionAsync(async () => {
    // The parent. `notes` is NULL — ALWAYS, asserted by test and by the server's
    // events_check_in_notes_null CHECK: the look's note lives on `looks.notes`,
    // because Ask's recall fetch selects `events.notes` with no type filter and a
    // note on the parent would reach a model before D10 is ruled (T-22, §9 rule 1).
    // An EMPTY STRING is not "no note" either — the CHECK refuses '' and that row's
    // push would wedge permanently (migration 064's rule 2).
    //
    // occurred_at_confidence is 'witnessed' by construction: a look is a perception
    // at a moment the owner was there for, so there is nothing to find (§5.4,
    // taxonomy D10). No window bounds, ever.
    await db.runAsync(
      `INSERT INTO events
         (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
          occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
          created_at, updated_at, synced)
       VALUES (?, ?, 'check_in', ?, NULL, NULL, 'manual', ?, 'witnessed', NULL, NULL, ?, ?, 0)`,
      [eventId, petId, occurredAtIso, occurredAtSource, now, now],
    );

    // The child. `updated_at` is stamped ISO (not SQLite's local-time datetime()) so
    // cross-device last-write-wins compares correctly (B-055).
    await db.runAsync(
      `INSERT INTO looks
         (id, event_id, pet_id, outcome, local_day, words, vocab_version, notes,
          created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
      [lookId, eventId, petId, outcome, localDay, wordsToLocalText([...seen]), LOOK_VOCAB_VERSION, now, now],
    );
  });

  // Push immediately, events BEFORE looks — the child's FK and the server's same-pet
  // trigger both need the parent visible, and the drain gates on `e.synced = 1`
  // regardless, so a child that loses the race simply waits a cycle. Fire-and-forget.
  syncPendingEvents()
    .then(() => syncPendingLooks())
    .catch((e) => console.error('[insertLook] sync push failed:', e));

  // NO triggerSignalRegenDebounced. Not an omission — T-5: a look never enters the
  // engine, so there is nothing for the detector to re-read. lib/looks.test.ts
  // asserts the absence, because an absence is what a later "consistency" edit
  // quietly fills in.

  return { eventId, lookId, occurredAtIso, localDay, now };
}

// ── The day counts ───────────────────────────────────────────────────────────

/** One look row, reduced to what a COUNT needs. `localDay` is the stored key,
 *  never a re-derivation from `occurred_at` (T-19). */
export interface LookDayRow {
  localDay: string;
  outcome: LookOutcome;
  words: string[];
}

/**
 * Every live look for a pet, newest day first — THE ONLY READ of `looks` in the
 * client, which is what makes the soft-delete join a rule rather than a habit.
 *
 * `sinceDay` bounds the read to a window ('YYYY-MM-DD', inclusive). It bounds the
 * READ, never the meaning of a count: a count's own denominator is the caller's
 * (C-3 — a window may index, only the total may be spoken).
 */
export async function loadLookDays(petId: string, sinceDay?: string): Promise<LookDayRow[]> {
  const db = getDb();
  // The join is the point: after an Undo the `looks` row survives with its words
  // and its note, and only `events.deleted_at` says it is gone (spec §9 rule 2).
  const rows = await db.getAllAsync<{ local_day: string; outcome: string; words: string | null }>(
    `SELECT l.local_day, l.outcome, l.words
       FROM looks l
       JOIN events e ON e.id = l.event_id
      WHERE l.pet_id = ?
        AND e.deleted_at IS NULL
        ${sinceDay ? 'AND l.local_day >= ?' : ''}
      ORDER BY l.local_day DESC`,
    sinceDay ? [petId, sinceDay] : [petId],
  );
  return rows.map((r) => ({
    localDay: r.local_day,
    // A value outside the CHECK cannot reach here from the server; if a future
    // outcome ever does, it reads as an observation rather than as an absence —
    // the safe direction, since an absence day is the only one a surface may
    // describe as "nothing unusual" and it must never be inferred.
    outcome: r.outcome === 'nothing_unusual' ? 'nothing_unusual' : 'observed',
    words: wordsFromLocalText(r.words),
  }));
}

/** The set of days that hold at least one look. THE denominator: every "N of M"
 *  this feature prints has this on one side, and a skipped day is simply absent
 *  (counted as not answered, never as an answered day — §5.6). */
export function answeredDaySet(rows: readonly LookDayRow[]): Set<string> {
  return new Set(rows.map((r) => r.localDay));
}

/** How many days hold at least one look. Days, never looks: ten reflex taps in a
 *  day are one answered day (T-14, §3.3). */
export function answeredDays(rows: readonly LookDayRow[]): number {
  return answeredDaySet(rows).size;
}

/** How many days a word was marked. A word marked in two looks the same day counts
 *  ONCE for that day (T-14) — which is the whole reason this is a set of days and
 *  not a row count. */
export function wordDays(rows: readonly LookDayRow[], word: string): number {
  return wordDaySet(rows, word).size;
}

/** The days a word was marked, as their keys — for a pairing that must intersect
 *  two day sets rather than compare two numbers (§6.11). */
export function wordDaySet(rows: readonly LookDayRow[], word: string): Set<string> {
  const days = new Set<string>();
  for (const r of rows) if (r.words.includes(word)) days.add(r.localDay);
  return days;
}

/**
 * How many days are OBSERVED-ABSENCE days: days on which EVERY look was
 * `nothing_unusual` (T-14).
 *
 * The precedence is the honest one and it runs one way only (C-4): a *nothing
 * unusual* at 7 AM and an *off* at 6 PM is an OFF day, never an absence day. The
 * later look does not overwrite the earlier one — the DAY's classification does,
 * and the accusing branch wins. Inverting this would silently convert a day the
 * owner reported something on into a day the record calls clear.
 */
export function absenceDays(rows: readonly LookDayRow[]): number {
  return absenceDaySet(rows).size;
}

/** The observed-absence days, as their keys. */
export function absenceDaySet(rows: readonly LookDayRow[]): Set<string> {
  const observed = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    seen.add(r.localDay);
    if (r.outcome === 'observed') observed.add(r.localDay);
  }
  for (const day of observed) seen.delete(day);
  return seen;
}

/**
 * How many days are BOTH answered and vomit days — the denominator of the same-day
 * pairing (§6.11), and the one number the third adversarial pass caught the spec
 * getting wrong.
 *
 * `vomitLocalDays` is the caller's set of days a vomit was logged, keyed the SAME
 * way (`local_day`, the owner's zone). Both sides of the pairing's margin must
 * count ANSWERED days: a left denominator over ALL vomit days and a right one over
 * answered days scores every unanswered bad day as "nothing seen" — the reassuring
 * direction, on the exact question a worried owner is asking.
 */
export function answeredVomitDays(
  rows: readonly LookDayRow[],
  vomitLocalDays: Iterable<string>,
): number {
  const answered = answeredDaySet(rows);
  let n = 0;
  for (const day of new Set(vomitLocalDays)) if (answered.has(day)) n += 1;
  return n;
}
