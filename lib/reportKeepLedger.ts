// The keep's ledger on the phone (Vet report v2 PR-32, CUL-2522): `pending_report_keeps`.
//
// A sent report's keep used to live only in memory, so a keep still retrying when the app was
// closed (Mail and the share sheet hand control to another app, and the phone may kill this one)
// was lost with no line. Now `keepReportCopy` writes a row here before its first try and deletes
// it only once the copy is kept. Any other row is a keep the next launch's drain
// (`drainPendingKeeps`, lib/reportKeep.ts) tries again; one it cannot keep is said, and the row
// goes only when the owner dismisses that notice.
//
// The table's DDL is in BASE_SCHEMA_SQL (lib/localSchema.ts) and it is in LOCAL_WIPE_TABLES, so a
// sign-out takes every row with it. Each row also names its account (CUL-2576): a wipe that
// failed leaves rows the next account's drain deletes unsent, never tries and never says.

import { getDb } from './db';

export interface PendingKeep {
  reportId: string;
  petId: string;
  sharedVia: string;
  /** UTC ISO, when the keep was first asked for. */
  queuedAt: string;
  /** The account that sent it (CUL-2576); null on a row written before the column existed. */
  userId: string | null;
}

export interface KeepLedger {
  record(entry: PendingKeep): Promise<void>;
  clear(reportId: string): Promise<void>;
  list(): Promise<PendingKeep[]>;
}

/** The subset of expo-sqlite the ledger uses, so a node:sqlite adapter can stand in under test. */
export interface LedgerDb {
  runAsync(sql: string, ...params: Array<string | number | null>): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: Array<string | number | null>): Promise<T[]>;
}

export function sqliteKeepLedger(db: () => LedgerDb = getDb): KeepLedger {
  return {
    record: async (e) => {
      // A second send of the same report replaces the row with ITS route and time: a replay
      // stamps one departure, and the latest is the one the copy's stamp shows (the server only
      // ever moves it later; rls-privacy-reviewer R1). The window is the server's, from the
      // Preview, so a later queue time never extends it.
      await db().runAsync(
        `INSERT INTO pending_report_keeps (report_id, pet_id, shared_via, queued_at, user_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(report_id) DO UPDATE SET shared_via = excluded.shared_via, queued_at = excluded.queued_at, user_id = excluded.user_id`,
        e.reportId, e.petId, e.sharedVia, e.queuedAt, e.userId,
      );
    },
    clear: async (reportId) => {
      await db().runAsync('DELETE FROM pending_report_keeps WHERE report_id = ?', reportId);
    },
    list: async () => {
      const rows = await db().getAllAsync<{ report_id: string; pet_id: string; shared_via: string; queued_at: string; user_id: string | null }>(
        'SELECT report_id, pet_id, shared_via, queued_at, user_id FROM pending_report_keeps ORDER BY queued_at ASC',
      );
      return rows.map((r) => ({
        reportId: r.report_id, petId: r.pet_id, sharedVia: r.shared_via, queuedAt: r.queued_at, userId: r.user_id ?? null,
      }));
    },
  };
}

/**
 * Report ids whose keep is running in THIS JS session. The drain skips them: the in-session keep
 * owns its row and its line, and a second try beside it would race it to the same answer.
 */
export const keepsInFlight = new Set<string>();

/** Report ids this JS session's keep answered without keeping (the screen had its chance to say
 *  it). Their rows wait for the next launch's drain, which says them once if they still miss. */
export const keepsAnswered = new Set<string>();

/** Report ids whose miss notice is up and not yet dismissed: no second drain says them again. */
export const missesAwaitingAck = new Set<string>();

/** Sign-out teardown (CUL-2576), wired into `wipeLocalSession`: the three sets hold only report
 *  ids, which reach nothing under another account, and they go anyway (FR-9 parity). */
export function clearKeepSessionState(): void {
  keepsInFlight.clear();
  keepsAnswered.clear();
  missesAwaitingAck.clear();
}
