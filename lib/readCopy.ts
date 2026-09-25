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
// THE PULL EARNS COMPLETENESS FROM A COUNT (C-42). It pages on `event_id` (immutable,
// so an update landing mid-pull cannot move a row across a page boundary the way
// ordering on `updated_at` would), advances by the rows RECEIVED, stops only on an
// EMPTY page, and moves the watermark only when the rows received cover an exact count
// taken first. A short or truncated pull writes what it has and leaves the watermark
// where it was, so the next cycle asks again rather than skipping what it never saw.
//
// STATED BLIND SPOT (C-38). A server row that is DELETED is never mirrored: nothing in
// the client deletes an analysis row, and the server removes one only through a cascade
// from its event or pet (account deletion wipes this device anyway). A verdict the
// server no longer holds would therefore linger here; for `worth_a_call` that fails
// toward the rose, which is the safe direction.

import { getDb, getWatermark, setWatermark } from './db';
import { advanceWatermark, watermarkQueryFloor } from './hydration';
import type { ReadCopyRow } from './readState';
import { supabase } from './supabase';

/**
 * Exactly the four columns the copy keeps, and the only columns this module ever asks
 * the server for. Never `read_text`, never `dismissed_at`.
 */
export const READ_COPY_COLUMNS = 'event_id, status, recommendation, updated_at';

/** The copy's key in `sync_watermarks` (wiped at sign-out with the rest). */
const WATERMARK_KEY = 'event_ai_verdicts';

/** Rows asked for per page. The loop advances by rows RECEIVED, so a server `max-rows`
 *  below this number costs pages, never rows. */
export const READ_COPY_PAGE = 1000;

/** SQLite's host-parameter budget, with room to spare (the sync layer's chunk). */
const READ_CHUNK = 400;

/** The slice of the expo-sqlite handle the copy needs, so `lib/readCopy.test.ts` runs
 *  this module's real SQL on node:sqlite. */
export interface ReadCopyDb {
  getAllAsync<T>(source: string, params: (string | number | null)[]): Promise<T[]>;
  runAsync(source: string, params: (string | number | null)[]): Promise<unknown>;
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
 * Write server rows into the copy. `stale` is re-checked before EVERY row, not once
 * before the loop: a sign-out's wipe landing mid-loop must not be followed by the rest
 * of the previous account's verdicts (FR-9). A row that cannot be keyed is skipped and
 * said, never thrown: one malformed row must not cost the rest of the page its rose.
 */
export async function writeCopies(
  db: ReadCopyDb,
  rows: readonly (Partial<ReadCopyRow> | null | undefined)[],
  stale: () => boolean,
): Promise<void> {
  for (const row of rows) {
    if (stale()) return;
    if (!isWritable(row)) {
      console.warn('[read-copy] skipped a row with no usable key:', row?.event_id ?? '(none)');
      continue;
    }
    await db.runAsync(UPSERT_SQL, [row.event_id, row.status, row.recommendation ?? null, row.updated_at]);
  }
}

// ── Pulling ──────────────────────────────────────────────────────────────────

interface PulledVerdicts {
  rows: ReadCopyRow[];
  /** The rows received cover the exact count taken before paging. */
  complete: boolean;
}

/** Every verdict row changed at or after `floor` (all of them when `floor` is null).
 *  Null when the server could not be read, which is "we do not know", never "none". */
async function fetchVerdictsSince(floor: string | null): Promise<PulledVerdicts | null> {
  let counted = supabase.from('event_ai_analysis').select('event_id', { count: 'exact', head: true });
  if (floor) counted = counted.gte('updated_at', floor);
  const { count, error: countError } = await counted;
  if (countError || typeof count !== 'number') {
    console.warn('[read-copy] count failed, skipping the pull:', countError?.message);
    return null;
  }
  if (count === 0) return { rows: [], complete: true };

  const rows: ReadCopyRow[] = [];
  for (let from = 0; ; ) {
    let page = supabase
      .from('event_ai_analysis')
      .select(READ_COPY_COLUMNS)
      .order('event_id', { ascending: true })
      .range(from, from + READ_COPY_PAGE - 1);
    if (floor) page = page.gte('updated_at', floor);
    const { data, error } = await page;
    if (error) {
      console.warn('[read-copy] pull failed:', error.message);
      return null;
    }
    const received = (data ?? []) as unknown as ReadCopyRow[];
    // An EMPTY page is the end. A short one is not (C-42): under a `max-rows` cap below
    // the page size a page comes back short while rows remain.
    if (received.length === 0) break;
    rows.push(...received);
    from += received.length;
  }
  const distinct = new Set(rows.map((r) => r.event_id)).size;
  // `>=`, not `===`: a row that lands between the count and the last page is received
  // but was not counted. A row deleted in that gap (the cascade case) leaves the pull
  // short, and the watermark then waits a cycle rather than skipping anything.
  return { rows, complete: distinct >= count };
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
  const pulled = await fetchVerdictsSince(watermarkQueryFloor(since));
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
 * (the chain's settle and the realtime watch). Moves no watermark: the incremental pull
 * still owes every row its own watermark says it has not seen, and this write cannot
 * change which rows those are.
 */
export async function pullReadCopyFor(db: ReadCopyDb, eventId: string, stale: () => boolean): Promise<void> {
  const { data, error } = await supabase
    .from('event_ai_analysis')
    .select(READ_COPY_COLUMNS)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) {
    console.warn('[read-copy] landed read not copied:', error.message);
    return;
  }
  if (!data || stale()) return;
  await writeCopies(db, [data as unknown as ReadCopyRow], stale);
}
