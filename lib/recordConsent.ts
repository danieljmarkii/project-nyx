// What a vomit or stool record shows where a photo read would sit, given the owner's AI
// consent (CUL-1835; mock round 4 §3, frames D to H), and whether opening the record may
// send its photo without a tap. Pure: the reads live in lib/recordConsentRead.ts.
//
// THE PROMISE THIS MODULE KEEPS (What's sent, frame B): "A photo logged while AI reading
// was off is sent only if you tap Read this photo." A `read_disabled` row keeps it on its
// own, because the record never re-invokes over a resolved row. The hole panel 1 found
// (CUL-1833, comment on CUL-1835) is the photo with NO row: logged while off, its upload
// or read call failed, so nothing records that it was off. The record's mount trigger
// re-invokes such a record, and after a later yes the server would read it. So the mount
// trigger asks `mountSendDecision` first, and a photo that predates the current yes waits
// for the tap.
//
// Fails closed: a consent read that failed or stalled, or a photo time that cannot be
// parsed, holds the photo. Holding costs one tap; sending costs the promise.

import type { AiConsentRow } from './aiConsent';

export type RecordConsent = 'loading' | 'error' | 'unasked' | 'declined' | 'granted';

/** The consent a record renders by. `row` is the store's: undefined = not read yet. */
export function recordConsentOf(row: AiConsentRow | null | undefined, readFailed: boolean): RecordConsent {
  if (row === undefined) return readFailed ? 'error' : 'loading';
  if (row === null) return 'unasked';
  return row.granted ? 'granted' : 'declined';
}

// SQLite's `datetime('now')` default writes `YYYY-MM-DD HH:MM:SS`, UTC with no zone, and a
// JS engine may read that as LOCAL time or not at all. Every app writer stamps ISO-8601
// UTC (lib/eventAttachmentQueries.ts), so the bare form only appears on a row no writer
// stamped; it is read as the UTC it is. Both sides are parsed, never compared as text (C-40).
const SQLITE_UTC = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/;

export function parseStoredInstant(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const m = SQLITE_UTC.exec(value);
  const ms = Date.parse(m ? `${m[1]}T${m[2]}Z` : value);
  return Number.isNaN(ms) ? null : ms;
}

/** When the record's photo was attached: the oldest attachment, since the server reads them all. */
export type PhotoFact =
  | { kind: 'none' }
  | { kind: 'added'; at: string }
  | { kind: 'unknown' };

export type ConsentFact = { kind: 'ok'; row: AiConsentRow | null } | { kind: 'error' };

// 'send'           the mount trigger runs as it always has.
// 'hold_pre_yes'   a yes is on file and the photo predates it: frame H, one tap.
// 'hold_unknown'   the photo time or the consent could not be read: nothing is sent, and
//                  the record offers Try again.
export type MountSend = 'send' | 'hold_pre_yes' | 'hold_unknown';

export function mountSendDecision(photo: PhotoFact, consent: ConsentFact): MountSend {
  // No photo, nothing to send: a photoless record invokes for its contextual escalation.
  if (photo.kind === 'none') return 'send';
  if (consent.kind === 'error') return 'hold_unknown';
  // No answer, or a no: the server's gate keeps the photo and still writes the contextual
  // escalation (CUL-552 PR 2), so the invoke must run. Holding here would quiet a check
  // that needs no photo, which a no must never do.
  if (consent.row === null || !consent.row.granted) return 'send';
  if (photo.kind === 'unknown') return 'hold_unknown';
  const added = parseStoredInstant(photo.at);
  const decided = parseStoredInstant(consent.row.decidedAt);
  if (added === null || decided === null) return 'hold_unknown';
  // Strictly after. A photo stamped in the same instant as the yes is held: the device
  // clock that stamped it and the server clock that stamped the yes are not one clock.
  return added > decided ? 'send' : 'hold_pre_yes';
}

// What sits in the read slot when the photo was not read.
//   'ask'        frames D / E: no answer yet
//   'off'        frame F: a recorded no
//   'read_this'  frame H: a yes, and this photo still unread
//   'unread'     the consent is not known yet: the heading and the vet line, no action
export type UnreadFrame = 'ask' | 'off' | 'read_this' | 'unread';

export function unreadFrameOf(consent: RecordConsent): UnreadFrame {
  switch (consent) {
    case 'unasked': return 'ask';
    case 'declined': return 'off';
    case 'granted': return 'read_this';
    default: return 'unread';
  }
}

// A `capped` row says the read "will run tomorrow". Under a no it will not, and while
// unanswered the next run is gated, so those two take the unread frames (the
// capped-then-declined case). A yes, or a consent not known yet, keeps the cap copy,
// which carries its own vet line.
export function cappedFrameOf(consent: RecordConsent): Extract<UnreadFrame, 'ask' | 'off'> | null {
  if (consent === 'declined') return 'off';
  if (consent === 'unasked') return 'ask';
  return null;
}

// Frame G: a check that needs no photo fired while the photo went unread. The server's
// gated branch writes a completed escalation with no model output (`ai_raw_payload`
// null), so that is the mark of an unread photo under a call. A read that ran before a
// later no keeps its payload, and its record shows the read with nothing added.
export function photoUnreadUnderCall(row: { status: string; ai_raw_payload: unknown } | null, hasPhoto: boolean): boolean {
  return !!row && hasPhoto && row.status === 'completed' && row.ai_raw_payload == null;
}

// What sits under that call: G's off line (never a Turn on link under a warning) or, with
// no answer yet, the D card. A yes adds nothing: the capped path writes the same shape.
export function besideCallOf(consent: RecordConsent): 'off_line' | 'ask' | null {
  if (consent === 'declined') return 'off_line';
  if (consent === 'unasked') return 'ask';
  return null;
}
