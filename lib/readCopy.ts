// The phone's copy of the per-incident read's verdict (History v2 §5.3, HV-5 /
// CUL-1162): the one module that reads or writes `event_ai_verdicts`.
//
// WHY A COPY. Home's spine, the Patterns month and the Signal screen each fetched the
// verdict from the server every time they drew it, so offline "Worth a call" simply
// vanished: the month drew every photographed day as seen and Home drew nothing. The
// copy holds four columns of the server's analysis row (event id, status, verdict,
// change time) plus its three read stamps (PR-12, below), and `lib/readState.ts` decides
// every surface's state from it.
//
// WHAT IT NEVER HOLDS. The read's words (`read_text`: no surface that reads the copy
// shows any, and they are the model's free text about a pet's health) and the hide
// stamp (`dismissed_at`: Hide hides words and never stands the rose down, H-4a).
// `READ_COPY_COLUMNS` is the only column list this module sends, and
// `lib/readCopy.test.ts` pins it and the real DDL to exactly the seven.
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
// THE THREE STAMPS (Engines v3 PR-12, CUL-1267; migration 075). The copy also keeps the
// read's `photo_set_key`, `rule_version` and `engine_flags`: which photos, which floor rules
// and which Engines keys produced the verdict. Never `model_id` / `prompt_hash`, which
// describe the model's raw output the phone never holds. The server is their only writer
// (`_shared/engineStamps.ts`, and 075 §2b freezes them against a client UPDATE); this copy
// only mirrors them. They change three things here:
//   · `readCopies` checks that the photo this phone shows is in `photo_set_key` and hands
//     each copy `photoSetStale`, which `lib/readState.ts` reads to stop a quiet verdict standing
//     over a photo nothing has read. It never reaches the rose (`photoSetStaleOf` says when).
//   · Every phone re-pulls every row once, under `WATERMARK_KEY`'s new name: rows pulled by
//     an earlier build sit behind the old watermark with NULL stamps. The upsert fills
//     stamps into a row it already holds at the same instant, once, and only from NULL.
//   · The millisecond tie (CUL-1201, the 9/25 comment). `julianday` rounds to the
//     millisecond, and 075's trigger makes every rewrite strictly later at MICROSECOND
//     grain, so two versions inside one millisecond compared equal and the newer one was
//     refused. On an equal `julianday` the upsert now compares the seconds field as a
//     NUMBER (`CAST(substr(…, 18) AS REAL)`), never the strings: `…00.000Z` and
//     `…00+00:00` are one instant, and as text the first sorts later (C-40).
//
// STATED BLIND SPOT (PR-12's privacy pass). A build DOWNGRADE (an OTA rollback to a build
// before PR-12) writes a newer verdict with its old four-column upsert and leaves the
// stamps it found; on the next upgrade that row is not NULL-stamped and not behind the new
// watermark, so it keeps the older stamps until the server rewrites it. The compare can
// then only err toward grey: a mismatch demotes a calm read and never reaches the rose.
//
// STATED BLIND SPOT (C-38). A server row that is DELETED is never mirrored. Nothing in
// the client deletes an analysis row today. The server removes one through a cascade
// from its event or pet (account deletion wipes this device anyway), and the table's
// `FOR ALL` policy (migration 013) would also let the owner's own session delete one,
// though no shipped path does. A verdict the server no longer holds would linger here;
// for `worth_a_call` that fails toward the rose, which is the safe direction, and every
// reader asks only for events this device still holds.

import { getDb, getWatermark, setWatermark } from './db';
import { EVENT_ATTACHMENT_ORDER } from './eventAttachmentQueries';
import { advanceWatermark, HYDRATE_WATERMARK_OVERLAP_MS, watermarkQueryFloor } from './hydration';
import type { ReadCopyRow } from './readState';
import { supabase } from './supabase';

/**
 * Exactly the seven columns the copy keeps, and the only columns this module ever asks
 * the server for. Never `read_text`, never `dismissed_at`, never the payload stamps.
 */
export const READ_COPY_COLUMNS =
  'event_id, status, recommendation, updated_at, photo_set_key, rule_version, engine_flags';

/** The copy's key in `sync_watermarks` (wiped at sign-out with the rest). Renamed from
 *  `event_ai_verdicts` when the stamps arrived (PR-12): a new name has no watermark, so
 *  the first pull after the upgrade reads every row once and fills the stamps a row pulled
 *  by an earlier build lacks. The old key's row is left to the sign-out wipe; nothing
 *  reads it. Rename it again whenever a column is added that existing rows must gain. */
export const READ_COPY_WATERMARK_KEY = 'event_ai_verdicts:v2';

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
    const marks = chunk.map(() => '?').join(', ');
    const rows = await db.getAllAsync<ReadCopyRow>(
      `SELECT event_id, status, recommendation, updated_at, photo_set_key, rule_version, engine_flags
         FROM event_ai_verdicts
        WHERE event_id IN (${marks})`,
      chunk,
    );
    if (rows.length === 0) continue;
    // The photo each event SHOWS on this phone: the first row in the order every screen
    // renders by (`EVENT_ATTACHMENT_ORDER`, what `getEventAttachment` returns). Ordered
    // per event so the first row seen for an event is that photo.
    const photos = await db.getAllAsync<{ event_id: string; id: string }>(
      `SELECT event_id, id FROM event_attachments WHERE event_id IN (${marks})
        ${EVENT_ATTACHMENT_ORDER.replace('ORDER BY', 'ORDER BY event_id,')}`,
      chunk,
    );
    const shownByEvent = new Map<string, string>();
    for (const p of photos) if (!shownByEvent.has(p.event_id)) shownByEvent.set(p.event_id, p.id);
    for (const row of rows) {
      out.set(row.event_id, { ...row, photoSetStale: photoSetStaleOf(row, shownByEvent.get(row.event_id) ?? null) });
    }
  }
  return out;
}

/** The server's hash form of `photo_set_key` (engineStamps.ts): 64 hex, no comma, no
 *  hyphen, so it can never be mistaken for a list of UUIDs. The phone cannot compare it. */
const PHOTO_SET_HASH = /^[0-9a-f]{64}$/;

/**
 * Whether the photo this phone SHOWS for the event was absent when the read's words were
 * written, so a quiet verdict does not speak for it. The server's list form
 * (`photoSetKey`, `_shared/engineStamps.ts`) is the event's attachment ids, lowercased,
 * sorted and comma-joined.
 *
 * Membership of the shown photo, NOT equality of the two sets (the adversarial pass on
 * PR-12): the sets need not converge. A replace made offline leaves the old row on the
 * server for good (the remote delete in `detachEventAttachment` is best-effort and never
 * retried), and a replace made on another phone leaves the old row on this one (the
 * attachment pull is insert-only). A set compare marked such an event *Photo not read*
 * forever over a photo that was read, and on two phones the mark moved between them each
 * time one re-pushed its rows. The owner's question is only whether the photo in front of
 * them was read, and the app shows one photo per event.
 *
 * False, which is today's behaviour, whenever the phone cannot tell:
 *   · the row is pre-stamp (`engine_flags` NULL): a read from before migration 075 says
 *     nothing about its photos (the PM's D-3, 2026-09-28);
 *   · the phone shows no photo for the event: it may not have pulled it yet, and "no photo
 *     here" is not "a different photo";
 *   · the key is the hash form, which only a set past 4,000 characters gets.
 * True when the read was written over no photo and the phone now shows one, or over a set
 * that does not include the one it shows (a replace or an add no read has covered). Either
 * way it can only take a calm read away, never the rose (`lib/readState.ts`).
 */
export function photoSetStaleOf(
  stamps: Pick<ReadCopyRow, 'photo_set_key' | 'engine_flags'>,
  shownAttachmentId: string | null,
): boolean {
  if (stamps.engine_flags === null || stamps.engine_flags === undefined) return false;
  if (shownAttachmentId === null) return false;
  const key = stamps.photo_set_key;
  if (key === null || key === undefined) return true;
  if (PHOTO_SET_HASH.test(key)) return false;
  return !key.split(',').includes(shownAttachmentId.toLowerCase());
}

// ── Writing (the one statement) ──────────────────────────────────────────────

/** The seconds field of a server timestamp, as a number (`SS.ffffff`), when the string has
 *  the ISO shape that puts it at character 18; NULL otherwise. Offsets move hours and
 *  minutes, never seconds, so two spellings of one instant give one number. */
const secondsOf = (col: string) =>
  `(CASE WHEN substr(${col}, 11, 1) = 'T' AND substr(${col}, 17, 1) = ':'
         THEN CAST(substr(${col}, 18) AS REAL) END)`;
const IN_SECONDS = secondsOf('excluded.updated_at');
const STORED_SECONDS = secondsOf('event_ai_verdicts.updated_at');

/**
 * Insert a row the copy does not hold; replace one it holds only when the incoming
 * `updated_at` is STRICTLY newer, compared as parsed instants. An incoming instant that
 * does not parse can never be shown newer, so it never replaces; a stored one that does
 * not parse is replaced by any row that does (the `shouldWriteRemoteRow` rules, moved
 * into the statement so they hold under interleaving).
 *
 * `julianday` rounds to the millisecond, so an equal `julianday` is decided on the seconds
 * field instead (the header's PR-12 section):
 *   · strictly larger by less than a second: a newer version inside the same millisecond,
 *     which replaces. (A pair that straddles a minute inside one millisecond differs by
 *     about sixty and replaces nothing, which is the behaviour before PR-12.)
 *   · equal: the same version. A no-op, so a re-pulled boundary row converges without a
 *     rewrite, EXCEPT once: a row pulled before the stamps existed (stored `engine_flags`
 *     NULL) takes them from the same version when it carries them.
 */
const UPSERT_SQL = `
  INSERT INTO event_ai_verdicts (event_id, status, recommendation, updated_at, photo_set_key, rule_version, engine_flags)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO UPDATE SET
    status = excluded.status,
    recommendation = excluded.recommendation,
    updated_at = excluded.updated_at,
    photo_set_key = excluded.photo_set_key,
    rule_version = excluded.rule_version,
    engine_flags = excluded.engine_flags
  WHERE julianday(excluded.updated_at) IS NOT NULL
    AND (julianday(event_ai_verdicts.updated_at) IS NULL
         OR julianday(excluded.updated_at) > julianday(event_ai_verdicts.updated_at)
         OR (julianday(excluded.updated_at) = julianday(event_ai_verdicts.updated_at)
             AND (${IN_SECONDS} > ${STORED_SECONDS} AND ${IN_SECONDS} - ${STORED_SECONDS} < 1
                  OR (${IN_SECONDS} = ${STORED_SECONDS}
                      AND event_ai_verdicts.engine_flags IS NULL
                      AND excluded.engine_flags IS NOT NULL))))`;

/** A server row as PostgREST hands it over: `engine_flags` is the `text[]` as an array. */
export interface ServerVerdictRow {
  event_id: string;
  status: string;
  recommendation: string | null;
  updated_at: string;
  photo_set_key?: unknown;
  rule_version?: unknown;
  engine_flags?: unknown;
}

// The shapes 075's CHECKs enforce on the server, checked again here because a stamp this
// module stores is a stamp `photoSetStaleOf` trusts.
const PHOTO_SET_KEY_SHAPE = /^[0-9a-f,-]{1,4000}$/;
const RULE_VERSION_SHAPE = /^[a-z0-9._-]{1,64}$/;
const ENGINE_KEY_SHAPE = /^[a-z0-9_]{1,64}$/;

/** `engine_flags` as the copy stores it: the sorted keys as a JSON array, or NULL. */
function engineFlagsText(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  if (!value.every((k): k is string => typeof k === 'string' && ENGINE_KEY_SHAPE.test(k))) return null;
  return JSON.stringify([...value].sort());
}

/**
 * The row as the copy stores it, or null when it cannot be keyed. A malformed STAMP
 * stores NULL for that stamp and keeps the row: a bad stamp must never cost a verdict
 * (and a NULL `engine_flags` reads as pre-stamp, which compares nothing).
 */
function toCopyRow(row: Partial<ServerVerdictRow> | null | undefined): ReadCopyRow | null {
  if (
    !row ||
    typeof row.event_id !== 'string' ||
    row.event_id.length === 0 ||
    typeof row.status !== 'string' ||
    typeof row.updated_at !== 'string' ||
    !(row.recommendation === null || typeof row.recommendation === 'string')
  ) {
    return null;
  }
  return {
    event_id: row.event_id,
    status: row.status,
    recommendation: row.recommendation,
    updated_at: row.updated_at,
    photo_set_key:
      typeof row.photo_set_key === 'string' && PHOTO_SET_KEY_SHAPE.test(row.photo_set_key) ? row.photo_set_key : null,
    rule_version:
      typeof row.rule_version === 'string' && RULE_VERSION_SHAPE.test(row.rule_version) ? row.rule_version : null,
    engine_flags: engineFlagsText(row.engine_flags),
  };
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
  rows: readonly (Partial<ServerVerdictRow> | null | undefined)[],
  stale: () => boolean,
): Promise<number> {
  let changed = 0;
  for (const raw of rows) {
    if (stale()) return changed;
    const row = toCopyRow(raw);
    if (!row) {
      console.warn('[read-copy] skipped a row with no usable key:', raw?.event_id ?? '(none)');
      continue;
    }
    const result = await db.runAsync(UPSERT_SQL, [
      row.event_id,
      row.status,
      row.recommendation,
      row.updated_at,
      row.photo_set_key,
      row.rule_version,
      row.engine_flags,
    ]);
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
  rows: ServerVerdictRow[];
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

  const rows: ServerVerdictRow[] = [];
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
    const received = (data ?? []) as unknown as ServerVerdictRow[];
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
  const since = await getWatermark(READ_COPY_WATERMARK_KEY);
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
  if (next) await setWatermark(READ_COPY_WATERMARK_KEY, next);
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
  return writeCopies(db, [data as unknown as ServerVerdictRow], stale);
}
