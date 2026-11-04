// The send sheet's native hand-offs (Vet report v2 PR-18, CUL-2298; spec §10.3). Each returns
// what the platform told us, as a `SendResult`, and nothing else: the words on the
// confirmation are `sendStatusWords`' (lib/reportSend.ts), never decided here.
//
// EVERY ONE RUNS AFTER THE SHEET HAS GONE (C-14). The screen calls these from the sheet's
// `onExited`, so no native sheet is ever presented over a Modal that is still up.
//
// `expo-mail-composer` IS REQUIRED LAZILY, the `lib/vetDocumentPickers.ts` precedent. Its entry
// calls `requireNativeModule('ExpoMailComposer')` at import, which THROWS on any binary built
// before this dependency landed (the PM's dev client and the TestFlight build until the next
// native cut). A static import would take down the whole report route; required here, the
// Email row says Mail isn't available and Share still works.
//
// EACH KEEPS THE OWNER'S COPY AFTER IT ANSWERS (VR2-20, CUL-2300): `keepAfterSend` decides from
// the platform's answer whether the report left, and never delays the result (lib/reportKeep.ts).
// The keep's outcome rides back beside the result (`SendOutcome.keep`, CUL-2434), so the screen
// can tell the owner when a copy that left was not kept.

import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { renderReportPdf, shareReportPdf, type VetReport } from './pdf';
import type { SendResult } from './reportSend';
import { keepAfterSend, type KeepOutcome } from './reportKeep';

/** What the platform answered, and the keep it set off: null when nothing was to be kept. */
export interface SendOutcome {
  result: SendResult;
  keep: Promise<KeepOutcome> | null;
}

type MailModule = typeof import('expo-mail-composer');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const requireMail = (): unknown => require('expo-mail-composer');

/** The module, or null on a binary built without it. Injected in tests. */
export function loadMailComposer(load: () => unknown = requireMail): MailModule | null {
  try {
    return load() as MailModule;
  } catch (e) {
    console.warn('[reportSend] mail composer unavailable on this build:', e);
    return null;
  }
}

/** Can this phone open a Mail draft? False on an old binary or with no mail account set up. */
export async function mailAvailable(mail: MailModule | null = loadMailComposer()): Promise<boolean> {
  if (!mail) return false;
  try {
    return await mail.isAvailableAsync();
  } catch (e) {
    console.warn('[reportSend] mail availability check failed:', e);
    return false;
  }
}

export interface EmailDraft {
  subject: string;
  body: string;
  /** Local file URIs of the vet documents the owner switched on, beside the report. */
  documentUris: string[];
}

/**
 * Open a Mail draft from the owner's own address with the report attached (R-4: from the
 * owner's own address; the To line is theirs to fill, the clinic's address is not stored).
 */
export async function emailReport(report: VetReport, draft: EmailDraft, mail: MailModule | null = loadMailComposer()): Promise<SendOutcome> {
  if (!mail) return { result: 'failed', keep: null };
  const pdf = await renderReportPdf(report);
  try {
    const { status } = await mail.composeAsync({
      subject: draft.subject,
      body: draft.body,
      isHtml: false,
      attachments: [pdf.uri, ...draft.documentUris],
    });
    const result: SendResult = status === 'sent' || status === 'saved' || status === 'cancelled' ? status : 'undetermined';
    return { result, keep: keepAfterSend(report, 'email', result) };
  } finally {
    pdf.release();
  }
}

/**
 * The system print sheet over the report's own HTML. expo-print rejects a DISMISSED sheet with
 * "Printing did not complete" (`PrintIncompleteException`, ios/ExpoPrintExceptions.swift) and a
 * failed job with "Printing job encountered an error", so only the first reads as the owner
 * backing out (no card, no alert); anything else is a failure the screen says.
 */
export const PRINT_DISMISSED = /printing did not complete/i;

export async function printReport(report: VetReport): Promise<SendOutcome> {
  try {
    await Print.printAsync({ html: report.html });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (PRINT_DISMISSED.test(message)) return { result: 'cancelled', keep: null };
    console.warn('[reportSend] print failed:', e);
    return { result: 'failed', keep: null };
  }
  return { result: 'done', keep: keepAfterSend(report, 'print', 'done') };
}

/** The share sheet with the named PDF. `failed` when the platform has no share sheet. */
export async function shareReport(report: VetReport): Promise<SendOutcome> {
  const result: SendResult = (await shareReportPdf(report)) ? 'done' : 'failed';
  return { result, keep: keepAfterSend(report, 'share', result) };
}

/**
 * The exam room opened (CUL-2434, PM go (a) 2026-11-04): the vet reads the report across the
 * table, so it is kept as `shown`. Called once the room is staged and pushed, never before, and
 * never when it could not open.
 */
export function keepShown(report: VetReport): Promise<KeepOutcome> | null {
  return keepAfterSend(report, 'shown', 'done');
}

/** The email's subject and body as text, for an owner who sends from somewhere else. */
export async function copyEmailText(subject: string, body: string): Promise<SendResult> {
  await Clipboard.setStringAsync(`${subject}\n\n${body}`);
  return 'done';
}
