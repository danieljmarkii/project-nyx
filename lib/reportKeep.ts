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
//
// A ROW BELONGS TO ITS ACCOUNT (CUL-2576). Every row names the account that sent it, read off
// auth-js's own session, the one whose token the keep call carries. A drain tries and says only
// that account's rows; another account's row, or one that names none, is deleted unsent. The
// sign-out wipe stays the first fence; this is the second, for a wipe that failed.

import { supabase } from './supabase';
import type { VetReport } from './pdf';
import type { SendResult } from './reportSend';
import { keepsAnswered, keepsInFlight, missesAwaitingAck, sqliteKeepLedger, type KeepLedger, type PendingKeep } from './reportKeepLedger';
import { currentSignOutEpoch } from './signOutEpoch';
import { useAuthStore } from '../store/authStore';
import { useKeepLossStore } from '../store/keepLossStore';

export type KeepVia = 'email' | 'print' | 'share' | 'shown';

/**
 * How a keep ended. `kept`: the server holds the copy. `not_saved`: the Preview's save failed, so
 * there was nothing to keep. `expired`: only a new Preview can make a kept copy (the keep window
 * passed, the draft is gone, its file no longer matches, or its AI summary can no longer be kept).
 * `failed`: the server could not be reached or could not keep it, after the retries.
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

// `expired` means "only a new Preview makes a kept copy" (the line "Preview the report again"),
// read off the status alone: a 404 (the draft is gone), and every 409 savedCopy.ts answers (the
// keep window passed, the stored file no longer matches, or the copy's AI summary can no longer be
// kept, CUL-2523). Sending the same copy again can never fix any of them (adversarial pass 2).

// The status is read structurally off supabase-js's FunctionsHttpError, whose `context` is the
// Response (lib/account.ts's precedent); a transport or relay error has no status.
function answerOf(error: unknown): KeepAnswer['error'] {
  const message = error instanceof Error ? error.message : String(error);
  const context = error && typeof error === 'object' && 'context' in error ? (error as { context?: unknown }).context : null;
  const status = context && typeof context === 'object' && 'status' in context && typeof (context as { status?: unknown }).status === 'number'
    ? (context as { status: number }).status
    : null;
  return { message, status, expired: status === 404 || status === 409 };
}

const invokeKeep: Invoke = async (body) => {
  const { error } = await supabase.functions.invoke('generate-report', { body });
  return { error: error ? answerOf(error) : null };
};

/** Waits between tries: a transport failure or a 5xx is tried three times in all. */
export const KEEP_RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A refusal (4xx) says the same thing every time; only a passing failure is worth a retry. */
function retryable(error: NonNullable<KeepAnswer['error']>): boolean {
  return error.status === null || error.status >= 500;
}

/** One keep call. Never throws: a thrown invoke reads as a transport failure. */
async function tryKeep(
  invoke: Invoke,
  body: { petId: string; reportId: string; sharedVia: string; sharedAt?: string },
): Promise<KeepAnswer['error']> {
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

/** The account whose token a keep call would carry: auth-js's session, never the store's, which
 *  the recovery handler nulls before its last-chance flush. Null when there is none or it cannot
 *  be read. Never throws. */
export type CurrentUser = () => Promise<string | null>;

export const currentKeepUser: CurrentUser = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user.id;
  } catch (e) {
    console.warn('[reportKeep] session read failed:', e instanceof Error ? e.message : String(e));
  }
  // auth-js answers no session for an expired token it cannot refresh offline (a clinic
  // basement), without removing it: the store still names the signed-in account, and a keep made
  // then must still leave its row (adversarial-reviewer pass 1, finding 1).
  return useAuthStore.getState().session?.user.id ?? null;
};

/** This account's rows; every other row is deleted unsent (CUL-2576). Throws if the list fails. */
async function ownRows(ledger: KeepLedger, uid: string): Promise<PendingKeep[]> {
  const rows = await ledger.list();
  const own: PendingKeep[] = [];
  for (const row of rows) {
    if (row.userId === uid) own.push(row);
    else await quietly('clear', () => ledger.clear(row.reportId));
  }
  return own;
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
  currentUser: CurrentUser = currentKeepUser,
): Promise<KeepOutcome> {
  const { reportId, petId } = report;
  if (!reportId || !petId) return 'not_saved';
  keepsInFlight.add(reportId);
  try {
    // Written BEFORE the first try (CUL-2522): if the app is closed at any moment from here on,
    // the row is what the next open finds. With no account to name, no row: no drain could
    // ever send it, and the in-session try below still says its own line.
    const queuedAt = new Date(now()).toISOString();
    const userId = await currentUser();
    if (userId !== null) await quietly('write', () => ledger.record({ reportId, petId, sharedVia: via, queuedAt, userId }));
    // Every try names the send's own time: iOS pauses timers in the background, so a retry can
    // fire hours later, and the copy must still say when it left (adversarial pass 2).
    const outcome = await keepWithRetries(invoke, { petId, reportId, sharedVia: via, sharedAt: queuedAt }, delays, wait);
    // Only a kept copy clears its row. Any other answer leaves it for the NEXT LAUNCH's drain
    // (adversarial-reviewer findings 1 and 2): the screen may say the line, but it may also be
    // gone (Done tapped mid-retry, a later send's line replacing this one), and nothing here can
    // tell which. So a miss can be said twice (the screen, then once at the next launch), never
    // not at all; and a later drain may still keep a copy the screen called unsaved (loud).
    if (outcome === 'kept') await quietly('clear', () => ledger.clear(reportId));
    else keepsAnswered.add(reportId);
    return outcome;
  } finally {
    keepsInFlight.delete(reportId);
  }
}

async function keepWithRetries(
  invoke: Invoke,
  body: { petId: string; reportId: string; sharedVia: string; sharedAt: string },
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
 *  draft stays keepable. Here it only bounds how long a PASSING failure is retried: the drain always
 *  asks the server, which answers 200 for a copy already kept whatever its age, and "expired" for a
 *  draft past its window (adversarial-reviewer finding 6). */
export const KEEP_WINDOW_MS = 23 * 60 * 60 * 1000;

/** A keep the drain could not make. Its row stays until the owner dismisses the notice
 *  (`acknowledgeKeepMisses`): a notice that never showed is said again, never lost. */
export interface KeepMiss {
  reportId: string;
  petId: string;
  sharedVia: string;
}

// A 401 is a session mid-refresh, not a refusal of this copy: the row waits for the next drain.
function retryOnDrain(error: NonNullable<KeepAnswer['error']>): boolean {
  return retryable(error) || error.status === 401;
}

let drainInFlight: { epoch: number; run: Promise<KeepMiss[]> } | null = null;

/**
 * At open, foreground or reconnect: try each keep this launch did not make itself, once. Returns
 * the misses to say. One drain at a time: a caller arriving mid-drain waits for it and gets NO
 * misses (the drain's starter says them, so two callers never alert twice; adversarial-reviewer
 * finding 8), and the next open or reconnect is the trailing run. A drain belongs to the account
 * it started under (rls-privacy-reviewer F1). Never throws.
 */
export function drainPendingKeeps(
  invoke: Invoke = invokeKeep,
  ledger: KeepLedger = sqliteKeepLedger(),
  now: () => number = Date.now,
  lastChance = false,
  currentUser: CurrentUser = currentKeepUser,
): Promise<KeepMiss[]> {
  const epoch = currentSignOutEpoch();
  if (drainInFlight && drainInFlight.epoch === epoch) return drainInFlight.run.then(() => []);
  const run = drainOnce(invoke, ledger, now, epoch, lastChance, currentUser).finally(() => {
    if (drainInFlight?.run === run) drainInFlight = null;
  });
  drainInFlight = { epoch, run };
  return run;
}

/** `lastChance`: the drain before a sign-out wipes the ledger. It tries every row this launch is
 *  not still making (an answered row included: this is its last try), and parks no miss, since the
 *  caller counts what is left (adversarial pass 2, S1 and S2). */
async function drainOnce(
  invoke: Invoke,
  ledger: KeepLedger,
  now: () => number,
  epoch: number,
  lastChance: boolean,
  currentUser: CurrentUser,
): Promise<KeepMiss[]> {
  // No account, nothing tried: every row is some account's, and none is this session's to send.
  const uid = await currentUser();
  if (uid === null || currentSignOutEpoch() !== epoch) return [];
  let rows: PendingKeep[];
  try {
    rows = await ownRows(ledger, uid);
  } catch (e) {
    console.warn('[reportKeep] ledger read failed:', e instanceof Error ? e.message : String(e));
    return [];
  }
  const misses: KeepMiss[] = [];
  for (const row of rows) {
    // Signed out mid-drain: the wipe took these rows, and nothing more is sent under the next
    // account's token, nor any miss said to it.
    if (currentSignOutEpoch() !== epoch) return [];
    // This launch's own keeps (running, or answered on the screen) wait for the next launch; a
    // miss already on screen waits for its dismissal.
    if (keepsInFlight.has(row.reportId)) continue;
    if (!lastChance && (keepsAnswered.has(row.reportId) || missesAwaitingAck.has(row.reportId))) continue;
    const miss = { reportId: row.reportId, petId: row.petId, sharedVia: row.sharedVia };
    keepsInFlight.add(row.reportId);
    try {
      // `sharedAt`: the send's own time, so the kept copy never says it left at this open (and a
      // keep that already landed is left as it is; rls-privacy-reviewer F3).
      const error = await tryKeep(invoke, { petId: row.petId, reportId: row.reportId, sharedVia: row.sharedVia, sharedAt: row.queuedAt });
      if (error === null) {
        await quietly('clear', () => ledger.clear(row.reportId));
        keepsAnswered.delete(row.reportId);
        continue;
      }
      console.warn('[reportKeep] a pending copy was not kept:', error.message);
      const queued = new Date(row.queuedAt).getTime();
      // An unreadable time reads as past the window: said, never retried forever.
      const inWindow = Number.isFinite(queued) && now() - queued <= KEEP_WINDOW_MS;
      if (!error.expired && retryOnDrain(error) && inWindow) continue;
      if (!lastChance) missesAwaitingAck.add(row.reportId);
      misses.push(miss);
    } finally {
      keepsInFlight.delete(row.reportId);
    }
  }
  return currentSignOutEpoch() === epoch ? misses : [];
}

/** The owner dismissed the notice: its rows are said, so they go. Never throws. */
export async function acknowledgeKeepMisses(misses: readonly KeepMiss[], ledger: KeepLedger = sqliteKeepLedger()): Promise<void> {
  for (const m of misses) {
    await quietly('clear', () => ledger.clear(m.reportId));
    missesAwaitingAck.delete(m.reportId);
  }
}

/**
 * Before a sign-out (lib/session.ts flushForSignOut): one last try of EVERY waiting keep, then the
 * number still not kept, which the sign-out warning names as report copies (not "entries"), since
 * the wipe would take them (rls-privacy-reviewer F2; adversarial pass 2, S1 and S2). An unreadable
 * ledger counts as one, so the owner is asked rather than assumed-at. Never throws.
 */
export async function pendingKeepsBeforeSignOut(
  invoke: Invoke = invokeKeep,
  ledger: KeepLedger = sqliteKeepLedger(),
  now: () => number = Date.now,
  currentUser: CurrentUser = currentKeepUser,
): Promise<number> {
  const uid = await currentUser();
  await drainPendingKeeps(invoke, ledger, now, true, async () => uid);
  return pendingKeepCount(uid, ledger);
}

/**
 * How many of `uid`'s keeps still wait, with no try (CUL-2573): a sign-out whose session is
 * already gone can only count what it is about to wipe. Rows of any other account are not
 * counted (and are deleted, CUL-2576). With no account to count for, every row counts; an
 * unreadable ledger counts as one, so a loss is said rather than assumed away. Never throws.
 */
export async function pendingKeepCount(uid: string | null, ledger: KeepLedger = sqliteKeepLedger()): Promise<number> {
  if (uid === null) {
    // No account to attribute to: every row counts, so a loss is never understated
    // (adversarial-reviewer pass 1, finding 2). Nothing is deleted on a guess.
    try {
      return (await ledger.list()).length;
    } catch {
      return 1;
    }
  }
  try {
    return (await ownRows(ledger, uid)).length;
  } catch (e) {
    console.warn('[reportKeep] ledger read before sign-out failed:', e instanceof Error ? e.message : String(e));
    return 1;
  }
}

/**
 * At a SIGNED_OUT, before its wipe (CUL-2573): note how many of the signed-out account's copies
 * the wipe takes, for the notice after it. Nothing is tried: the session is already gone. Not
 * noted for the one sign-out that warned first and was confirmed (Settings), nor for a deleted
 * account, whose reports went with it. Never throws.
 */
export async function noteSignedOutKeepLoss(
  opts: { userId: string | null; justDeletedAccount: boolean },
  ledger: KeepLedger = sqliteKeepLedger(),
): Promise<void> {
  const loss = useKeepLossStore.getState();
  if (loss.consumeAccepted() || opts.justDeletedAccount) return;
  loss.note(opts.userId, await pendingKeepCount(opts.userId, ledger));
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
