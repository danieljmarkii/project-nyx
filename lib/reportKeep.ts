// The owner's kept copy of a sent report (Vet report v2 PR-20, CUL-2300; spec §11.1).
//
// The server stored this report's exact HTML as a draft at Preview (`VetReport.reportId`). When
// the report leaves the phone, this asks the server to keep that draft: the stored copy becomes
// the owner's, unchangeable, and appears in their Reports library (VR2-21).
//
// WHICH SENDS KEEP A COPY (spec §10.3: status words follow what the app knows). A copy is kept
// whenever the report PROBABLY left: Mail's `sent`, and its `undetermined` (Android never says),
// a print job handed over, a share sheet completed, and the exam room opened (`shown`: the vet
// read it across the table; CUL-2434, PM go (a) 2026-11-04). Never for a Mail draft saved or
// cancelled, a print backed out of, a failure, or Copy (which hands over the email text, not the
// report).
//
// EVERY DEPARTURE ENDS KEPT, OR THE OWNER IS TOLD (CUL-2434). The keep never delays the send's
// confirmation, but its outcome is handed back (`keepAfterSend`'s promise) so the screen can say
// "not saved" when it was not: an offline or failed keep (after a short, bounded retry), a report
// whose Preview save failed (no `reportId`), and a Preview held past the server's keep window.
//
// A KEEP THE APP CLOSED ON IS TRIED AGAIN, OR THE OWNER IS TOLD (CUL-2522). The keep writes a
// row to the phone's ledger (lib/reportKeepLedger.ts) before its first try and deletes it on its
// final answer in this session, whatever that answer is: the in-session line already told the
// owner, so nothing later may contradict it. Only a keep the app was closed on (Mail and the
// share sheet hand control to another app, and the phone may kill this one) leaves its row, and
// `drainPendingKeeps` tries it at the next open, foreground or reconnect: kept is silent, a
// passing failure stays for the next drain, and a refusal or a keep past the window is a miss
// said once (`pendingKeepMissNotice`).

import { supabase } from './supabase';
import type { VetReport } from './pdf';
import type { SendResult } from './reportSend';
import { keepsInFlight, sqliteKeepLedger, type KeepLedger, type PendingKeep } from './reportKeepLedger';

export type KeepVia = 'email' | 'print' | 'share' | 'shown';

/**
 * How a keep ended. `kept`: the server holds the copy. `not_saved`: the Preview's save failed, so
 * there was nothing to keep. `expired`: the Preview was held past the keep window. `failed`: the
 * server could not be reached or could not keep it, after the retries.
 */
export type KeepOutcome = 'kept' | 'not_saved' | 'expired' | 'failed';

/** The route to keep under for one platform answer, or null when nothing should be kept. */
export function keepViaFor(via: KeepVia, result: SendResult): KeepVia | null {
  switch (result) {
    case 'sent':
    case 'undetermined':
      return via === 'email' ? via : null;
    case 'done':
      return via === 'print' || via === 'share' || via === 'shown' ? via : null;
    case 'saved':
    case 'cancelled':
    case 'failed':
      return null;
  }
}

/** What one keep call answered. `status` is the HTTP status, null for a transport failure. */
export interface KeepAnswer {
  error: { message: string; status: number | null; expired: boolean } | null;
}

type Invoke = (body: Record<string, unknown>) => Promise<KeepAnswer>;

/** savedCopy.ts's `keepCopy` answer for a draft past its keep window. */
const EXPIRED_ERROR = 'Saved copy expired';

// The status is read structurally off supabase-js's FunctionsHttpError, whose `context` is the
// Response (lib/account.ts's precedent); a transport or relay error has no status.
async function answerOf(error: unknown): Promise<KeepAnswer['error']> {
  const message = error instanceof Error ? error.message : String(error);
  const context = error && typeof error === 'object' && 'context' in error ? (error as { context?: unknown }).context : null;
  const status = context && typeof context === 'object' && 'status' in context && typeof (context as { status?: unknown }).status === 'number'
    ? (context as { status: number }).status
    : null;
  let expired = false;
  if (status === 409 && context && typeof (context as { json?: unknown }).json === 'function') {
    try {
      const body = (await (context as { json: () => Promise<unknown> }).json()) as { error?: unknown } | null;
      expired = body?.error === EXPIRED_ERROR;
    } catch {
      expired = false;
    }
  }
  return { message, status, expired };
}

const invokeKeep: Invoke = async (body) => {
  const { error } = await supabase.functions.invoke('generate-report', { body });
  return { error: error ? await answerOf(error) : null };
};

/** Waits between tries: a transport failure or a 5xx is tried three times in all. */
export const KEEP_RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A refusal (4xx) says the same thing every time; only a passing failure is worth a retry. */
function retryable(error: NonNullable<KeepAnswer['error']>): boolean {
  return error.status === null || error.status >= 500;
}

/** One keep call. Never throws: a thrown invoke reads as a transport failure. */
async function tryKeep(invoke: Invoke, body: { petId: string; reportId: string; sharedVia: string }): Promise<KeepAnswer['error']> {
  try {
    return (await invoke({ mode: 'keep', ...body })).error;
  } catch (e) {
    return { message: e instanceof Error ? e.message : String(e), status: null, expired: false };
  }
}

/** The ledger's own failures never block or change a keep: the in-session try is still made and
 *  its line still said. A lost ledger write only costs the next open's retry. */
async function quietly(what: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (e) {
    console.warn(`[reportKeep] ledger ${what} failed:`, e instanceof Error ? e.message : String(e));
  }
}

/** Keep `report`'s draft as sent by `via`. Never throws. */
export async function keepReportCopy(
  report: VetReport,
  via: KeepVia,
  invoke: Invoke = invokeKeep,
  delays: readonly number[] = KEEP_RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = sleep,
  ledger: KeepLedger = sqliteKeepLedger(),
  now: () => number = Date.now,
): Promise<KeepOutcome> {
  const { reportId, petId } = report;
  if (!reportId || !petId) return 'not_saved';
  keepsInFlight.add(reportId);
  try {
    // Written BEFORE the first try (CUL-2522): if the app is closed at any moment from here on,
    // the row is what the next open finds.
    await quietly('write', () => ledger.record({ reportId, petId, sharedVia: via, queuedAt: new Date(now()).toISOString() }));
    const outcome = await keepWithRetries(invoke, { petId, reportId, sharedVia: via }, delays, wait);
    // Every final answer clears the row: the screen says this outcome now, so no later drain may
    // keep (or report) the same send a second time.
    await quietly('clear', () => ledger.clear(reportId));
    return outcome;
  } finally {
    keepsInFlight.delete(reportId);
  }
}

async function keepWithRetries(
  invoke: Invoke,
  body: { petId: string; reportId: string; sharedVia: string },
  delays: readonly number[],
  wait: (ms: number) => Promise<void>,
): Promise<Exclude<KeepOutcome, 'not_saved'>> {
  for (let attempt = 0; ; attempt++) {
    const error = await tryKeep(invoke, body);
    if (error === null) return 'kept';
    console.warn('[reportKeep] the copy was not kept:', error.message);
    if (error.expired) return 'expired';
    if (!retryable(error) || attempt >= delays.length) return 'failed';
    await wait(delays[attempt]);
  }
}

/** savedCopy.ts's KEEP_WINDOW_MS (DRAFT_TTL_MS less an hour): the same question, how long a
 *  draft stays keepable. Measured here from the queue time, which is after the Preview that
 *  starts the server's clock, so a row this side of it may still be refused as expired; past it,
 *  no call is made. */
export const KEEP_WINDOW_MS = 23 * 60 * 60 * 1000;

/** A keep the drain could not make. The pet is named by id; the notice looks up its name. */
export interface KeepMiss {
  petId: string;
  sharedVia: string;
}

// A 401 is a session mid-refresh, not a refusal of this copy: the row waits for the next drain.
function retryOnDrain(error: NonNullable<KeepAnswer['error']>): boolean {
  return retryable(error) || error.status === 401;
}

let drainInFlight: Promise<KeepMiss[]> | null = null;

/**
 * At open, foreground or reconnect: try each keep the app was closed on, once. Returns the misses
 * to say, and deletes their rows first (said once: a notice that never shows is the lesser loss
 * than one shown on every open). One drain at a time: a caller arriving mid-drain shares its
 * answer, and the next open or reconnect is the trailing run. Never throws.
 */
export function drainPendingKeeps(
  invoke: Invoke = invokeKeep,
  ledger: KeepLedger = sqliteKeepLedger(),
  now: () => number = Date.now,
): Promise<KeepMiss[]> {
  if (drainInFlight) return drainInFlight;
  const run = drainOnce(invoke, ledger, now).finally(() => {
    if (drainInFlight === run) drainInFlight = null;
  });
  drainInFlight = run;
  return run;
}

async function drainOnce(invoke: Invoke, ledger: KeepLedger, now: () => number): Promise<KeepMiss[]> {
  let rows: PendingKeep[];
  try {
    rows = await ledger.list();
  } catch (e) {
    console.warn('[reportKeep] ledger read failed:', e instanceof Error ? e.message : String(e));
    return [];
  }
  const misses: KeepMiss[] = [];
  for (const row of rows) {
    if (keepsInFlight.has(row.reportId)) continue;
    const miss = { petId: row.petId, sharedVia: row.sharedVia };
    const queued = new Date(row.queuedAt).getTime();
    // An unreadable time is treated as past the window: said, never retried forever.
    if (!Number.isFinite(queued) || now() - queued > KEEP_WINDOW_MS) {
      await quietly('clear', () => ledger.clear(row.reportId));
      misses.push(miss);
      continue;
    }
    keepsInFlight.add(row.reportId);
    try {
      const error = await tryKeep(invoke, { petId: row.petId, reportId: row.reportId, sharedVia: row.sharedVia });
      if (error === null) {
        await quietly('clear', () => ledger.clear(row.reportId));
        continue;
      }
      console.warn('[reportKeep] a pending copy was not kept:', error.message);
      if (!error.expired && retryOnDrain(error)) continue;
      await quietly('clear', () => ledger.clear(row.reportId));
      misses.push(miss);
    } finally {
      keepsInFlight.delete(row.reportId);
    }
  }
  return misses;
}

/**
 * After a send: keep the copy when this answer means the report left. Returns at once; the
 * promise is the keep's outcome, for the "not saved" line, or null when nothing was to be kept.
 */
export function keepAfterSend(
  report: VetReport,
  via: KeepVia,
  result: SendResult,
  keep: typeof keepReportCopy = keepReportCopy,
): Promise<KeepOutcome> | null {
  const route = keepViaFor(via, result);
  if (route === null) return null;
  return keep(report, route);
}

/**
 * The owner's line when a copy that left was not kept, or null when it was (the card never
 * claims "saved": VR2-20 says nothing on success). nyx-voice: the pet by name, calm, one action.
 */
export function keepMissLine(outcome: KeepOutcome, petName: string, via: KeepVia): string | null {
  const reports = petName ? `${petName}’s vet reports` : 'your vet reports';
  switch (outcome) {
    case 'kept':
      return null;
    case 'failed':
      return via === 'shown'
        ? `This copy wasn’t saved to ${reports}. Show it on this phone again to save one.`
        : `This copy wasn’t saved to ${reports}. Send it again to save one.`;
    case 'not_saved':
    case 'expired':
      return `This copy wasn’t saved to ${reports}. Preview the report again and send it to save one.`;
  }
}

/**
 * The next open's notice for keeps the app was closed on and could not make (CUL-2522), or null
 * for none. One notice for any number: the pet by name when every miss is one pet's. nyx-voice:
 * calm, what happened, one action. `petName` maps an id to the name on this phone ('' unknown).
 */
export function pendingKeepMissNotice(
  misses: readonly KeepMiss[],
  petName: (petId: string) => string,
): { title: string; body: string } | null {
  if (misses.length === 0) return null;
  const names = new Set(misses.map((m) => petName(m.petId)));
  const name = names.size === 1 ? [...names][0] : '';
  const reports = name ? `${name}’s vet reports` : 'your vet reports';
  const copy = misses.length === 1 ? 'A copy of a vet report you sent wasn’t' : `${misses.length} copies of vet reports you sent weren’t`;
  return {
    title: misses.length === 1 ? 'A report copy wasn’t saved' : 'Some report copies weren’t saved',
    body: `${copy} saved to ${reports}. Preview the report again and send it to save one.`,
  };
}
