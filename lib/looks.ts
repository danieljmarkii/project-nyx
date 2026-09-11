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
// `loadLookDays` is the only reader HERE, which is what makes "stated once" true
// rather than repeated.
//
// ⚠ Amended again at CUL-874 / N-5, twice over. The pure DAY COUNTS moved to
// `lib/lookDayCounts.ts` (re-exported below — one definition, two import paths) so that a
// render-only surface need not pull this file's write path behind it; and
// `loadVomitLocalDays` was added, which reads `events` rather than `looks`. Neither
// touches the join rule: the vomit reader filters `deleted_at IS NULL` on the events
// table itself, and `loadLookDays` is still the only read of `looks` HERE. The claim that
// matters is unchanged — a look row is GROUPED BY DAY in exactly one module, and it is
// therefore the only place a denominator can be got wrong.
//
// ⚠ Amended at CUL-869 / N-3, because the original sentence claimed more than it
// can now keep. `getTimeline` and `getEventById` (lib/db.ts) LEFT JOIN `looks` to
// carry a look's words and note onto the row every record surface already reads —
// the `weight_checks` shape, one line above it in the same SELECT. That is a second
// read of the table, and it obeys the rule more strongly rather than less: both
// queries filter `e.deleted_at IS NULL` on the parent itself, so a reversed look
// cannot come back through them at all. What survives unchanged is the claim that
// matters: `loadLookDays` is the only place a look row is ever GROUPED BY DAY, and
// therefore the only place a denominator can be got wrong.

import { getDb } from './db';
import { syncPendingEvents, syncPendingLooks } from './sync';
import { uuid, localDayIndex, localDayIndexOf, dayKeyFromIndex } from './utils';
import { wordsToLocalText, wordsFromLocalText } from './lookWordsCodec';
import { LOOK_VOCABULARY, LOOK_VOCAB_VERSION, type LookSpecies } from '../constants/lookWords';
import type { LookDayRow } from './lookDayCounts';

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

/** One look row, reduced to what a COUNT needs — MOVED to `lib/lookDayCounts.ts` at
 *  CUL-874 / N-5 with the counters that read it, and re-exported below. */

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
  const rows = await db.getAllAsync<{
    event_id: string;
    local_day: string;
    created_at: string;
    outcome: string;
    words: string | null;
    vocab_version: number | null;
  }>(
    // ORDERED WITHIN THE DAY, not just across days (CUL-873). The receipts' attachment
    // rule is "the earliest look of the day carrying the word, ties by `created_at` then
    // id" (T-18), so the order that rule needs is produced HERE, once, by the reader that
    // already owns the day grouping — rather than re-sorted by each consumer, which is
    // how two surfaces come to disagree about which entry earned a line.
    `SELECT l.event_id, l.local_day, l.created_at, l.outcome, l.words, l.vocab_version
       FROM looks l
       JOIN events e ON e.id = l.event_id
      WHERE l.pet_id = ?
        AND e.deleted_at IS NULL
        ${sinceDay ? 'AND l.local_day >= ?' : ''}
      ORDER BY l.local_day DESC, l.created_at ASC, l.id ASC`,
    sinceDay ? [petId, sinceDay] : [petId],
  );
  return rows.map((r) => ({
    eventId: r.event_id,
    localDay: r.local_day,
    createdAt: r.created_at,
    // A value outside the CHECK cannot reach here from the server; if a future
    // outcome ever does, it reads as an observation rather than as an absence —
    // the safe direction, since an absence day is the only one a surface may
    // describe as "nothing unusual" and it must never be inferred.
    outcome: r.outcome === 'nothing_unusual' ? 'nothing_unusual' : 'observed',
    words: wordsFromLocalText(r.words),
    vocabVersion: typeof r.vocab_version === 'number' ? r.vocab_version : LOOK_VOCAB_VERSION,
  }));
}

// The counters MOVED to `lib/lookDayCounts.ts` at CUL-874 / N-5 and are re-exported
// here, so every caller that has imported them from this module since N-2 is untouched.
// The move is about the IMPORT GRAPH, not about ownership: this file holds the write path
// and therefore drags `./sync` → `./supabase` behind it, and Patterns' pure model,
// comparison and pairing modules need the counters and nothing else. One definition, two
// paths — see that file's header.

export {
  answeredDaySet,
  answeredDays,
  wordDays,
  wordDaySet,
  absenceDays,
  absenceDaySet,
  answeredVomitDays,
  type LookDayRow,
} from './lookDayCounts';

/**
 * The local days a vomit was logged for a pet — the OTHER half of the pairing's unit
 * (§6.11: *days with ≥ 1 vomit*, never the report's episode count).
 *
 * ── WHY IT LIVES HERE AND NOT IN `lib/analytics.ts` ─────────────────────────
 * `answeredVomitDays` promises its argument is "keyed the SAME way (`local_day`, the
 * owner's zone)", and analytics buckets symptoms by UTC calendar day
 * (`computeSymptomFrequencyByDay` → `utcDateKey`). Two keyings, one intersection: every
 * vomit logged after 7 PM in New York would land on the NEXT UTC day, miss the look
 * answered beside it, and push the pairing's left numerator down — toward null, the
 * reassuring direction, on the exact question §6.11 exists to answer honestly. So the
 * keys that intersection needs are produced next to the promise, on this feature's own
 * reader, which is also where the soft-delete rule is already stated.
 *
 * `sinceDay` bounds the READ ('YYYY-MM-DD', inclusive), never the meaning of a count
 * (C-3). `timeZone` exists so a timezone-honest fixture can pin the boundary; production
 * passes nothing and the DEVICE zone is the owner's midnight (T-19, C-29).
 *
 * Soft-deleted rows are excluded, so an undone vomit leaves the pairing exactly the way
 * it leaves every other count.
 */
export async function loadVomitLocalDays(
  petId: string,
  sinceDay?: string,
  timeZone?: string,
): Promise<string[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM events
      WHERE pet_id = ? AND event_type = 'vomit' AND deleted_at IS NULL`,
    [petId],
  );
  const sinceIndex = sinceDay !== undefined ? localDayIndexOf(sinceDay) : null;
  const days = new Set<string>();
  for (const row of rows) {
    const ms = Date.parse(row.occurred_at);
    if (!Number.isFinite(ms)) continue;
    const index = localDayIndex(ms, timeZone);
    if (sinceIndex !== null && index < sinceIndex) continue;
    days.add(dayKeyFromIndex(index));
  }
  return [...days].sort();
}

// ── The record's edits (CUL-869 / N-3) ───────────────────────────────────────
//
// A look is editable in three ways and no more: its WORDS, its NOTE, and its
// POINT IN TIME. All three go through `updateLookForEdit` — the note's own
// surfaces (the record screen's add / edit / remove) call `updateLookNote`, which
// is a thin call into it, so there is exactly one statement that writes this table
// after the insert. The CUL-641 lesson, applied before there are two writers
// rather than after they diverge.

/** A look as the editor and the record screen load it. `localDay` is the STORED
 *  key — never re-derived by a reader (T-19). */
export interface StoredLook {
  id: string;
  /** The RECORD's pet — read off the child's own denormalized column, so a screen
   *  reached by event id can resolve the species and sex its words read in without
   *  going near `activePet` (C-9). */
  petId: string;
  outcome: LookOutcome;
  localDay: string;
  words: string[];
  notes: string | null;
}

/**
 * One look by its parent event, or null when this device has no child row.
 *
 * Null is a real state, not an error: a parent can reach a device ahead of its
 * child (they push in that order, and the child's drain gates on the parent being
 * synced). Callers render the bare act rather than inventing an outcome — see
 * `describeLook`'s header for why the absence is the one thing never inferred.
 *
 * NO `events` JOIN here, deliberately, and it is the one read in this file without
 * one: the callers are the record screen and the editor, both of which reached this
 * event through `getEventById`, which already refused a soft-deleted row. Adding a
 * join would not make them safer — it would make the row disappear from a screen
 * that has already decided it may show it.
 */
export async function getLookForEvent(eventId: string): Promise<StoredLook | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{
    id: string;
    pet_id: string;
    outcome: string;
    local_day: string;
    words: string | null;
    notes: string | null;
  }>(
    `SELECT id, pet_id, outcome, local_day, words, notes FROM looks WHERE event_id = ?`,
    [eventId],
  );
  if (!row) return null;
  return {
    id: row.id,
    petId: row.pet_id,
    outcome: row.outcome === 'nothing_unusual' ? 'nothing_unusual' : 'observed',
    localDay: row.local_day,
    words: wordsFromLocalText(row.words),
    notes: row.notes,
  };
}

/** What an edit may change. Every field is optional and OMISSION MEANS "leave it"
 *  — the `severity` / `notes` shape on `updateEvent`, and correct here for the same
 *  reason it is correct there: none of these describes the value another field
 *  writes, so silence has a safe meaning for each (C-10's distinction). */
export interface LookEdit {
  /** The full word list after the edit. Present only when the words were editable
   *  on the surface making the call. */
  words?: readonly string[];
  /** The note, trimmed by the caller; `null` removes it. An EMPTY STRING is never
   *  written — migration 064's CHECK refuses `''` and that row's push would wedge
   *  permanently — so this normalises it to null rather than trusting callers. */
  notes?: string | null;
  /** The re-derived local day. Present ONLY when `occurred_at` actually moved
   *  (C-10): a peek-and-save is a real gesture that changed nothing, and re-deriving
   *  on every save would move an owner's day key the first time she opened a record
   *  in another timezone. The caller knows whether the point moved; this does not.
   *  Derive it with `localDayForLook`, never by hand — the server bounds it to ±1
   *  day of the parent's UTC date and only that rule stays inside the bound. */
  localDay?: string;
}

/**
 * Apply an edit to a look, and re-queue it — but only if something actually
 * changed.
 *
 * THE NO-OP GATE IS THE POINT. `updated_at` is the sync queue's `pendingSince`
 * column (`SYNC_QUEUES`), so moving it is what re-queues the row (C-23). A save
 * that changed nothing must therefore NOT move it: doing so would push an identical
 * row on every visit to the editor, and — worse on a shared account — would make
 * this device win a last-write-wins race against a caregiver's real edit with a
 * copy of the value they had just replaced.
 *
 * Returns whether anything was written, so a caller can decide whether the parent
 * push it is about to fire has a child to carry. Throws on a local write failure,
 * like every other write in this file: the caller keeps its surface as it was and
 * says so.
 *
 * ORDERING. This never pushes. The child's drain gates on `events.synced = 1`, so a
 * child pushed before its parent simply waits a cycle — but the caller is editing
 * the PARENT too, and the one ordered push (events, then children) belongs at the
 * end of that save, not here.
 */
export async function updateLookForEdit(eventId: string, edit: LookEdit): Promise<boolean> {
  const current = await getLookForEvent(eventId);
  if (!current) return false;

  const sets: string[] = [];
  const params: (string | null)[] = [];

  if (edit.words !== undefined) {
    // Dedupe on the way in, exactly as `insertLook` does, so an editor bug cannot
    // store the same key twice and have `wordDays` still count the day once while
    // the record screen prints it twice.
    const next = [...new Set(edit.words)];

    // The invariant `insertLook` already holds, held here too — the edit path is
    // the second door to the same row and it was letting the words go to zero.
    //
    // An observed look with no words is not a quiet row, it is a COUNTED one: the
    // outcome stays 'observed', so `answeredDays` still counts the day (§6.1) while
    // the record has nothing to show for it. That is a day the owner answered,
    // rendered as though she had answered nothing, feeding a denominator on Home,
    // Patterns and the report. A throw rather than a silent drop: by the time this
    // is reached the surface has already had its chance to say so (the editor
    // refuses before any write), so arriving here at all is a programming error.
    if (current.outcome === 'observed' && next.length === 0) {
      throw new Error('updateLookForEdit: an observed look must keep at least one word');
    }

    if (!sameWords(current.words, next)) {
      sets.push('words = ?');
      params.push(wordsToLocalText(next));
    }
  }

  if (edit.notes !== undefined) {
    const next = edit.notes?.trim() || null;
    if (next !== current.notes) {
      sets.push('notes = ?');
      params.push(next);
    }
  }

  if (edit.localDay !== undefined && edit.localDay !== current.localDay) {
    sets.push('local_day = ?');
    params.push(edit.localDay);
  }

  if (sets.length === 0) return false;

  const now = new Date().toISOString();
  await getDb().runAsync(
    `UPDATE looks SET ${sets.join(', ')}, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE event_id = ?`,
    [...params, now, eventId],
  );
  return true;
}

/**
 * Set or clear a look's note — the record screen's add / edit / remove, and the
 * only note-writing entry point besides the editor's save.
 *
 * A thin wrapper on purpose rather than its own UPDATE: a note is the one field on
 * this row that is not recreatable (T-22, C-21), so having two statements that can
 * write it is precisely the divergence risk worth spending a function call to
 * avoid.
 */
export async function updateLookNote(eventId: string, note: string | null): Promise<boolean> {
  return updateLookForEdit(eventId, { notes: note });
}

/** Order-insensitive word comparison. The stored order is the order chosen (§3.1a),
 *  so it is preserved on write — but a re-order alone is not a change worth
 *  re-queueing the row for, and treating it as one would defeat the no-op gate for
 *  any owner who de-selected and re-selected the same two words. */
function sameWords(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((w, i) => w === right[i]);
}
