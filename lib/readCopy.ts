// The phone's copy of the per-incident read's verdict (History v2 §5.3, HV-5 /
// CUL-1162): the one module that reads or writes `event_ai_verdicts`.
//
// WHY A COPY. Home's spine, the Patterns month and the Signal screen each fetched the
// verdict from the server every time they drew it, so offline "Worth a call" simply
// vanished: the month drew every photographed day as seen and Home drew nothing. The
// copy holds four columns of the server's analysis row (event id, status, verdict,
// change time) and `lib/readState.ts` decides every surface's state from it.
//
// WHAT IT NEVER HOLDS. The read's words (`read_text`: no surface that reads the copy
// shows any, and they are the model's free text about a pet's health) and the hide
// stamp (`dismissed_at`: Hide hides words and never stands the rose down, H-4a).
// `READ_COPY_COLUMNS` is the only column list this module sends, and
// `lib/readCopy.test.ts` pins it and the real DDL to exactly the four.
//
// ONE WRITER, THREE CALLERS (the PM's ruling on the plan, 2026-09-25). `writeCopies`
// is the only statement that writes the table, and three things call it:
//   1. the sync pull (`pullReadCopies`, a step of `hydrateFromCloud`), which is how a
//      read from another device, or one that landed while this app was not looking,
//      arrives;
//   2. the analysis chain, which saves its landed read BEFORE it settles its claim
//      (`lib/analysis.ts`), because Home rereads the verdict when the chain settles and
//      never through a watch: without this the copy is still empty at that moment;
//   3. the realtime watch (`watchAnalysisRow`), before each check, for a read that lands
//      after the chain's own call returned.
// The spec's "nothing else writes it" is kept in the form that matters: there is one
// write path to audit, and `guards/readState.test.ts` reds on any other file naming the
// table in SQL.
//
// LAST WRITE WINS, DECIDED IN SQL. The two landing callers run outside `syncNow`'s
// single flight, so a landing write and a sync pull can interleave. A read-decide-write
// in JS would let an older row, decided before a newer one landed, overwrite it. The
// upsert's own WHERE decides instead, on PARSED instants (`julianday`), never text: the
// server spells its timestamps `…+00:00`, and C-40 is the scar for comparing two
// spellings of one instant as strings.
//
// THE PULL READS ONE ORDERED STREAM (the code review's BUG and the adversarial pass's
// F5 on #912). It pages by KEYSET on (updated_at, event_id), ascending, from the
// watermark's floor: every page asks for the rows strictly after the last row received,
// never for an offset. An earlier draft paged by offset on `event_id`, and two things
// broke it. A row the pull had already passed could change while the app sat suspended
// between pages; a later row's change then carried the watermark past it, and the copy
// kept the old verdict for good. And a row deleted behind the offset shifted every row
// after it back by one, skipping a live row while a new one restored the count. A
// keyset closes both by construction: a changed row moves AHEAD of the cursor, so the
// same pull still receives it, and a cursor is a value, not a position, so a delete
// behind it moves nothing. What follows is the property the watermark stands on: every
// row a pull did not receive sorts after its cursor, and the cursor is where the next
// pull starts (the watermark, less the commit-skew overlap). The exact count taken
// first still decides whether the watermark moves at all (C-42): it is the guard
// against a page that comes back empty while rows remain. The cursor's instant is the
// server's own string, passed back untouched (`keysetAfter` says why).
//
// THE ONE ROW A KEYSET CAN STILL MISS, AND WHY THE PULL HAS A TIME BUDGET (the second
// adversarial pass on #912). `updated_at` is the writing transaction's START, so a row
// whose transaction began just before the cursor passed its place and committed just
// after is behind the cursor, unseen. The overlap brings it back on the next pull, but
// only if the watermark has not run more than the overlap past it, and the watermark
// runs as far as the pull's last page: a pull that sat suspended between pages for
// minutes while other rows changed put that row behind the watermark for good. So a
// pull that ran longer than `READ_COPY_PULL_BUDGET_MS` writes what it received and
// holds the watermark, and the next pull, from the old place, reads the row. Half the
// overlap for the pull leaves the other half for the writing transaction's own length.
//
// STATED BLIND SPOT (C-38). A server row that is DELETED is never mirrored. Nothing in
// the client deletes an analysis row today. The server removes one through a cascade
// from its event or pet (account deletion wipes this device anyway), and the table's
// `FOR ALL` policy (migration 013) would also let the owner's own session delete one,
// though no shipped path does. A verdict the server no longer holds would linger here;
// for `worth_a_call` that fails toward the rose, which is the safe direction, and every
// reader asks only for events this device still holds.

import { getDb, getWatermark, setWatermark } from './db';
import { advanceWatermark, HYDRATE_WATERMARK_OVERLAP_MS, watermarkQueryFloor } from './hydration';
import type { ReadCopyRow } from './readState';
import { supabase } from './supabase';

/**
 * Exactly the four columns the copy keeps, and the only columns this module ever asks
 * the server for. Never `read_text`, never `dismissed_at`.
 */
export const READ_COPY_COLUMNS = 'event_id, status, recommendation, updated_at';

/** The copy's key in `sync_watermarks` (wiped at sign-out with the rest). */
const WATERMARK_KEY = 'event_ai_verdicts';

/** Rows asked for per page. A server `max-rows` below this number costs pages, never
 *  rows: the cursor is the last row RECEIVED, whatever the page's length. */
export const READ_COPY_PAGE = 1000;

/** The longest a pull may run, first request to last page, and still move the
 *  watermark: half the commit-skew overlap (the header's last section says why). */
export const READ_COPY_PULL_BUDGET_MS = HYDRATE_WATERMARK_OVERLAP_MS / 2;

/** SQLite's host-parameter budget, with room to spare (the sync layer's chunk). */
const READ_CHUNK = 400;

/** The slice of the expo-sqlite handle the copy needs, so `lib/readCopy.test.ts` runs
 *  this module's real SQL on node:sqlite. `changes` is how the writer knows whether a
 *  row actually moved, which is the watch's cue to tell Home. */
export interface ReadCopyDb {
  getAllAsync<T>(source: string, params: (string | number | null)[]): Promise<T[]>;
  runAsync(source: string, params: (string | number | null)[]): Promise<{ changes: number }>;
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * The copy's rows for these events, by event id. Local only: no network, no wait. An
 * event with no row is simply absent, which `readStateOf` reads as "no read on this
 * phone" (unread where one was expected, never calm). Throws on a local read failure;
 * each surface's reader catches and degrades on its own terms.
 */
export async function readCopies(eventIds: readonly string[]): Promise<Map<string, ReadCopyRow>> {
  const out = new Map<string, ReadCopyRow>();
  if (eventIds.length === 0) return out;
  const db = getDb();
  const ids = [...new Set(eventIds)];
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const chunk = ids.slice(i, i + READ_CHUNK);
    const rows = await db.getAllAsync<ReadCopyRow>(
      `SELECT event_id, status, recommendation, updated_at FROM event_ai_verdicts
        WHERE event_id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const row of rows) out.set(row.event_id, row);
  }
  return out;
}

// ── Writing (the one statement) ──────────────────────────────────────────────

/**
 * Insert a row the copy does not hold; replace one it holds only when the incoming
 * `updated_at` is STRICTLY newer, compared as parsed instants. An equal instant is a
 * no-op (a re-pulled boundary row converges without a rewrite). An incoming instant that
 * does not parse can never be shown newer, so it never replaces; a stored one that does
 * not parse is replaced by any row that does (the `shouldWriteRemoteRow` rules, moved
 * into the statement so they hold under interleaving).
 */
const UPSERT_SQL = `
  INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(event_id) DO UPDATE SET
    status = excluded.status,
    recommendation = excluded.recommendation,
    updated_at = excluded.updated_at
  WHERE julianday(excluded.updated_at) IS NOT NULL
    AND (julianday(event_ai_verdicts.updated_at) IS NULL
         OR julianday(excluded.updated_at) > julianday(event_ai_verdicts.updated_at))`;

function isWritable(row: Partial<ReadCopyRow> | null | undefined): row is ReadCopyRow {
  return (
    !!row &&
    typeof row.event_id === 'string' &&
    row.event_id.length > 0 &&
    typeof row.status === 'string' &&
    typeof row.updated_at === 'string' &&
    (row.recommendation === null || typeof row.recommendation === 'string')
  );
}

/**
 * Write server rows into the copy, and return how many rows it CHANGED (an insert, or a
 * replace the last-write-wins rule allowed; a row it refused counts nothing). `stale` is
 * re-checked before EVERY row, not once before the loop: a sign-out's wipe landing
 * mid-loop must not be followed by the rest of the previous account's verdicts (FR-9).
 * A row that cannot be keyed is skipped and said, never thrown: one malformed row must
 * not cost the rest of the page its rose.
 */
export async function writeCopies(
  db: ReadCopyDb,
  rows: readonly (Partial<ReadCopyRow> | null | undefined)[],
  stale: () => boolean,
): Promise<number> {
  let changed = 0;
  for (const row of rows) {
    if (stale()) return changed;
    if (!isWritable(row)) {
      console.warn('[read-copy] skipped a row with no usable key:', row?.event_id ?? '(none)');
      continue;
    }
    const result = await db.runAsync(UPSERT_SQL, [row.event_id, row.status, row.recommendation ?? null, row.updated_at]);
    changed += result.changes;
  }
  return changed;
}

// ── Pulling ──────────────────────────────────────────────────────────────────

/** Where a pull has read to: the last row received, in the order it reads. */
interface Cursor {
  updated_at: string;
  event_id: string;
}

/**
 * The rows strictly after `cursor` in (updated_at, event_id) order, as one PostgREST
 * `or` filter. ONE filter, not "the rest of this instant" and then "every later instant"
 * as two passes: with two passes a first pass that stopped early would hand the second a
 * cursor past rows it never read, and those rows would sort BEFORE the watermark.
 *
 * The instant is the server's own string, passed back untouched and never parsed. A JS
 * `Date` keeps milliseconds and the column keeps microseconds, so a re-spelled cursor
 * would sit before its own row: the next page would hand the same rows back, and the
 * pull would never end.
 */
export function keysetAfter(cursor: Cursor): string {
  return `updated_at.gt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},event_id.gt.${cursor.event_id})`;
}

interface PulledVerdicts {
  rows: ReadCopyRow[];
  /** The rows received cover the exact count taken before paging, every page moved the
   *  cursor forward, and the pull ran inside its time budget. */
  complete: boolean;
}

/** Every verdict row changed at or after `floor` (all of them when `floor` is null), in
 *  (updated_at, event_id) order. Null when the server could not be read, which is "we do
 *  not know", never "none", and null once `stale` turns: after a sign-out the next page
 *  would send the previous account's cursor (its last event id) under whoever holds the
 *  session now, so the pull stops asking (the second privacy pass on #912). */
async function fetchVerdictsSince(floor: string | null, stale: () => boolean): Promise<PulledVerdicts | null> {
  // Wall-clock, not a monotonic timer: a suspension is exactly what this must count, and
  // a monotonic clock can stop while the device sleeps. A clock set backwards reads as
  // over budget, which only holds the watermark for one cycle.
  const startedAt = Date.now();
  let counted = supabase.from('event_ai_analysis').select('event_id', { count: 'exact', head: true });
  if (floor) counted = counted.gte('updated_at', floor);
  const { count, error: countError } = await counted;
  if (countError || typeof count !== 'number') {
    console.warn('[read-copy] count failed, skipping the pull:', countError?.message);
    return null;
  }
  if (count === 0) return { rows: [], complete: true };

  const rows: ReadCopyRow[] = [];
  // Every (event, version) received. A page that adds none is a server that did not
  // honour the cursor, and asking again would only get the same page back.
  const seen = new Set<string>();
  let cursor: Cursor | null = null;
  for (;;) {
    if (stale()) return null;
    let page = supabase.from('event_ai_analysis').select(READ_COPY_COLUMNS);
    if (cursor) page = page.or(keysetAfter(cursor));
    else if (floor) page = page.gte('updated_at', floor);
    const { data, error } = await page
      .order('updated_at', { ascending: true })
      .order('event_id', { ascending: true })
      .limit(READ_COPY_PAGE);
    if (error) {
      console.warn('[read-copy] pull failed:', error.message);
      return null;
    }
    const received = (data ?? []) as unknown as ReadCopyRow[];
    // An EMPTY page is the end: nothing sorts after the cursor. A short one is not
    // (C-42): under a `max-rows` cap below the page size, a page comes back short while
    // rows remain.
    if (received.length === 0) break;
    let fresh = 0;
    for (const row of received) {
      const key = `${row.event_id}\u0000${row.updated_at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fresh += 1;
    }
    rows.push(...received);
    if (fresh === 0) {
      console.warn('[read-copy] a page repeated rows already received; stopping the pull');
      return { rows, complete: false };
    }
    const last = received[received.length - 1];
    cursor = { updated_at: last.updated_at, event_id: last.event_id };
  }
  // `>=`, not `===`: a row changed after the count was taken is received but was not
  // counted. A counted row deleted before the pull reached it (a cascade) leaves the pull
  // short, and the watermark then waits a cycle rather than moving on a count it missed.
  const distinct = new Set(rows.map((r) => r.event_id)).size;
  const spanMs = Date.now() - startedAt;
  const inBudget = spanMs >= 0 && spanMs <= READ_COPY_PULL_BUDGET_MS;
  if (!inBudget) console.warn('[read-copy] the pull outran its time budget; holding the watermark');
  return { rows, complete: distinct >= count && inBudget };
}

/**
 * The copy's hydrate step (`hydrateFromCloud`): pull every verdict changed since the
 * watermark, less the commit-skew overlap, and write it through the one statement.
 * Same contract as the sibling steps in `lib/sync.ts`: `stale` is the sign-out epoch
 * check, and the watermark is persisted only after the writes, and only for a pull the
 * count proved complete.
 */
export async function pullReadCopies(db: ReadCopyDb, stale: () => boolean): Promise<void> {
  const since = await getWatermark(WATERMARK_KEY);
  const pulled = await fetchVerdictsSince(watermarkQueryFloor(since), stale);
  if (pulled === null || stale()) return;
  await writeCopies(db, pulled.rows, stale);
  if (!pulled.complete) {
    console.warn('[read-copy] pull incomplete, holding the watermark for the next cycle');
    return;
  }
  const next = advanceWatermark(
    pulled.rows.map((r) => r.updated_at),
    since,
  );
  if (stale()) return;
  if (next) await setWatermark(WATERMARK_KEY, next);
}

/**
 * One event's verdict, pulled into the copy the moment its read lands on this device
 * (the chain's settle and the realtime watch). Returns how many rows it changed (0 or
 * 1). Moves no watermark: the incremental pull still owes every row its own watermark
 * says it has not seen, and this write cannot change which rows those are.
 */
export async function pullReadCopyFor(db: ReadCopyDb, eventId: string, stale: () => boolean): Promise<number> {
  const { data, error } = await supabase
    .from('event_ai_analysis')
    .select(READ_COPY_COLUMNS)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) {
    console.warn('[read-copy] landed read not copied:', error.message);
    return 0;
  }
  if (!data || stale()) return 0;
  return writeCopies(db, [data as unknown as ReadCopyRow], stale);
}
