// EN-4's client half: the durable re-check marker (Engines v3 PR-28b, CUL-1436;
// docs/nyx-incident-tiers-requirements.md §8.3, §8.4, §8.10).
//
// THE PROMISE. The server floors a vomit's read from the record alone (`analyze-vomit`,
// `mode: 'refloor'`, PR-28), but only when someone asks, and before this PR nothing on the
// phone asked: a photoless vomit got its floor only when its record was opened, and a
// lethargy or meal log never re-checked the vomits around it. So every vomit, lethargy and
// meal write, a later meal rating, an edit and a soft delete of any of those, owes the
// server one re-check, and the debt is a ROW (`incident_floor_queue`) written in the same
// local transaction as the write that owes it. An app killed between the save and the
// network still owes it on the next launch; offline, it waits.
//
// ONE MODE. A new vomit sends `refloor` too (PM, 2026-10-08): the server's refloor of a
// vomit floors every vomit within 72 hours either side of it, itself included (§8.6 v0.3),
// which is what lets a third vomit lift the two before it. `mode: 'floor'` reaches only the
// event it names.
//
// DARK BEHIND TWO KEYS. The server floors only when `engines_v3_en4` AND `engines_v3_en3`
// are on for the owner (`analyze-vomit/context.ts`), so the phone asks the same question
// (`floorOnNow`, and `hooks/useFloorOn` on a screen). With either off no marker is written, no transaction is opened that was
// not opened before, and nothing new renders: the write paths below take their old shape
// exactly (C-36).
//
// The drain lives in `lib/sync.ts` (`syncPendingIncidentFloors`), because every queue's
// push goes through that module's `serializeQueuePush` (C-24). This module imports it
// lazily: `lib/sync.ts` sits under every writer here.

import { getDb } from './db';
import { uuid } from './utils';

/** The logs that owe a re-check: the server's `REFLOOR_TRIGGER_TYPES`
 *  (`_shared/incident-analysis.ts`), which refuses any other trigger with a 400. */
export const FLOOR_TRIGGER_TYPES = ['vomit', 'lethargy', 'meal'] as const;

export function owesFloorCheck(eventType: string | null | undefined): boolean {
  return (FLOOR_TRIGGER_TYPES as readonly string[]).includes(eventType ?? '');
}

/** Both keys, for the signed-in owner. Read at write time; not reactive (a screen that
 *  must follow a flip uses `hooks/useFloorOn`).
 *
 *  The config store is required LAZILY: it pulls the config fetcher, and with it the
 *  Supabase client, into every module that imports this one, and the write paths here sit
 *  under the event, meal and reversal modules. A store that cannot be loaded reads as off,
 *  the allowlist primitive's own fail-closed direction. */
export function floorOnNow(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { allowlistFlagNow } = require('../hooks/useAppConfig') as typeof import('../hooks/useAppConfig');
    return allowlistFlagNow('engines_v3_en4') && allowlistFlagNow('engines_v3_en3');
  } catch {
    return false;
  }
}

/** The slice of the database handle a marker write needs, so a caller's transaction hands
 *  in the handle it is writing through. */
export interface MarkerDb {
  runAsync(source: string, params: (string | number | null)[]): Promise<unknown>;
}

/** Write one marker. Call it INSIDE the transaction that writes the event it is about. */
export async function insertFloorMarker(db: MarkerDb, eventId: string, petId: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO incident_floor_queue (id, pet_id, event_id, created_at, synced)
     VALUES (?, ?, ?, ?, 0)`,
    [uuid(), petId, eventId, new Date().toISOString()],
  );
}

/**
 * Run a write to an EXISTING event and, when that event owes a re-check, write its marker
 * in the same transaction. The edit, the rating and the soft delete all take this shape;
 * the insert paths write their marker inside the transaction they already open.
 *
 * Flag off, or an event of another type: the write runs exactly as it did before, outside
 * any new transaction. The type and pet are read from the row before the write, so a soft
 * delete still knows what it deleted.
 */
export async function writeOwingFloorCheck<T>(eventId: string, write: () => Promise<T>): Promise<T> {
  if (!floorOnNow()) return write();
  const db = getDb();
  const row = await db.getFirstAsync<{ event_type: string; pet_id: string }>(
    'SELECT event_type, pet_id FROM events WHERE id = ?',
    [eventId],
  );
  if (!row || !owesFloorCheck(row.event_type)) return write();
  const out = await runOwingCheck(db, write, () => insertFloorMarker(db, eventId, row.pet_id));
  kickFloorChecks();
  return out;
}

/** The transaction-start refusal SQLite gives when another transaction is open on the
 *  connection (expo-sqlite's `withTransactionAsync` is not exclusive). */
const NESTED_TRANSACTION = /cannot start a transaction within a transaction/i;

/**
 * The write and its marker in ONE transaction. If the connection already has a transaction
 * open (a hydration, a meal insert, another log landing in the same instant), BEGIN is
 * refused before the write runs, and the write then goes as it did before this PR, with
 * its marker as the next statement: an Undo, a rating or an edit must never fail because a
 * re-check was owed (the code review on PR-28b). The marker then rides in whichever
 * transaction is open, and only a crash between the two statements could lose it, which
 * costs a re-check, never a record.
 */
export async function runOwingCheck<T>(
  db: { withTransactionAsync(fn: () => Promise<void>): Promise<void> },
  write: () => Promise<T>,
  marker: () => Promise<void>,
): Promise<T> {
  let out: T | undefined;
  let began = false;
  try {
    await db.withTransactionAsync(async () => {
      began = true;
      out = await write();
      await marker();
    });
  } catch (e) {
    if (began || !NESTED_TRANSACTION.test(e instanceof Error ? e.message : String(e))) throw e;
    out = await write();
    await marker();
  }
  return out as T;
}

/** Send what is owed, fire-and-forget. The drain holds each marker until its event has
 *  landed, so calling this before the event's own push is harmless. */
export function kickFloorChecks(): void {
  // Lazy: lib/sync.ts imports the modules that import this one.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { syncPendingIncidentFloors } = require('./sync') as typeof import('./sync');
  syncPendingIncidentFloors().catch((e: unknown) => console.warn('[floor] re-check push failed (queued):', e));
}

/** The device claim (§8.5): what this phone showed, under which rule, from which rows.
 *  Attached to every marker still waiting on the event it was worked out over. */
export async function attachDeviceClaim(eventId: string, claim: unknown): Promise<void> {
  try {
    await getDb().runAsync(
      'UPDATE incident_floor_queue SET device_claim = ? WHERE event_id = ? AND synced <> 1',
      [JSON.stringify(claim), eventId],
    );
  } catch (e) {
    // The claim is evidence for a server that cannot adopt it yet (CUL-1437); a failure
    // here costs nothing the owner sees, and the marker itself is already written.
    console.warn('[floor] device claim not attached:', e);
  }
}
