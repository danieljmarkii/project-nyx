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
// The retry lives in this session only; one that survives the app being closed needs the sync
// queue and is a filed follow-up, so until then the line is the owner's signal.

import { supabase } from './supabase';
import type { VetReport } from './pdf';
import type { SendResult } from './reportSend';

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

/** Keep `report`'s draft as sent by `via`. Never throws. */
export async function keepReportCopy(
  report: VetReport,
  via: KeepVia,
  invoke: Invoke = invokeKeep,
  delays: readonly number[] = KEEP_RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<KeepOutcome> {
  if (!report.reportId || !report.petId) return 'not_saved';
  for (let attempt = 0; ; attempt++) {
    let error: KeepAnswer['error'];
    try {
      ({ error } = await invoke({ mode: 'keep', petId: report.petId, reportId: report.reportId, sharedVia: via }));
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e), status: null, expired: false };
    }
    if (error === null) return 'kept';
    console.warn('[reportKeep] the copy was not kept:', error.message);
    if (error.expired) return 'expired';
    if (!retryable(error) || attempt >= delays.length) return 'failed';
    await wait(delays[attempt]);
  }
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
