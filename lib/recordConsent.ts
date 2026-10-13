// What a vomit or stool record shows where a photo read would sit, given the owner's AI
// consent (CUL-1835; mock round 4 §3, frames D to H). Pure.
//
// "Sent only if you tap" (What's sent, frame B) is the SERVER's to keep (PM ruling on
// CUL-1913): `_shared/aiConsent.ts` holds a photo logged before the current yes unless the
// request says the owner tapped, so a held photo arrives here as an ordinary
// `read_disabled` row and renders frame H. The record's taps send `ownerTap`
// (lib/analysis.ts); nothing on the phone decides whether a photo may leave it.

import type { AiConsentRow } from './aiConsent';

export type RecordConsent = 'loading' | 'error' | 'unasked' | 'declined' | 'granted';

/** The consent a record renders by. `row` is the store's: undefined = not read yet. */
export function recordConsentOf(row: AiConsentRow | null | undefined, readFailed: boolean): RecordConsent {
  if (row === undefined) return readFailed ? 'error' : 'loading';
  if (row === null) return 'unasked';
  return row.granted ? 'granted' : 'declined';
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

// Whether History and Home treat photo reading as OFF (CUL-1174, spec H-4b): only on a
// recorded no. Not read yet, a failed read and never asked all keep the grey mark, the
// louder side: an unread photo must never look like a choice the owner did not make, and
// an unasked owner's record still offers its ask.
export function photoReadingOffOf(row: AiConsentRow | null | undefined): boolean {
  return row?.granted === false;
}
