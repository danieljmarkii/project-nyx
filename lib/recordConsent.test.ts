import {
  besideCallOf,
  cappedFrameOf,
  mountSendDecision,
  parseStoredInstant,
  photoUnreadUnderCall,
  recordConsentOf,
  unreadFrameOf,
  type ConsentFact,
} from './recordConsent';
import type { AiConsentRow } from './aiConsent';

const YES_AT = '2026-10-12T10:00:00+00:00';
const yes: AiConsentRow = { granted: true, copyVersion: '2026-10-12', source: 'backstop', decidedAt: YES_AT };
const no: AiConsentRow = { ...yes, granted: false };
const ok = (row: AiConsentRow | null): ConsentFact => ({ kind: 'ok', row });

describe('mountSendDecision — the promise on What\'s sent (CUL-1835)', () => {
  it('a photo from before the yes is held for the tap', () => {
    expect(mountSendDecision({ kind: 'added', at: '2026-10-12T09:59:00.000Z' }, ok(yes))).toBe('hold_pre_yes');
  });

  it('a photo from after the yes is sent as it always was', () => {
    expect(mountSendDecision({ kind: 'added', at: '2026-10-12T10:01:00.000Z' }, ok(yes))).toBe('send');
  });

  // C-40: the device writes `.000Z`, PostgREST hands back `+00:00`. As TEXT, '+' sorts
  // before '.', so a lexical compare would call this photo LATER than the yes and send it.
  it('the same instant in the two spellings is held, never sent (parsed, not compared as text)', () => {
    const photo = '2026-10-12T10:00:00.000Z';
    expect(photo > YES_AT).toBe(true); // the text compare the module must not use
    expect(parseStoredInstant(photo)).toBe(parseStoredInstant(YES_AT));
    expect(mountSendDecision({ kind: 'added', at: photo }, ok(yes))).toBe('hold_pre_yes');
  });

  it("SQLite's bare default is read as the UTC it is", () => {
    expect(parseStoredInstant('2026-10-12 09:59:00')).toBe(Date.parse('2026-10-12T09:59:00Z'));
    expect(mountSendDecision({ kind: 'added', at: '2026-10-12 09:59:00' }, ok(yes))).toBe('hold_pre_yes');
    expect(mountSendDecision({ kind: 'added', at: '2026-10-12 10:01:00' }, ok(yes))).toBe('send');
  });

  it('fails closed: a failed consent read, an unknown photo time, or an unparseable stamp holds', () => {
    expect(mountSendDecision({ kind: 'added', at: '2026-10-12T10:01:00Z' }, { kind: 'error' })).toBe('hold_unknown');
    expect(mountSendDecision({ kind: 'unknown' }, ok(yes))).toBe('hold_unknown');
    expect(mountSendDecision({ kind: 'added', at: 'not a time' }, ok(yes))).toBe('hold_unknown');
    expect(mountSendDecision({ kind: 'added', at: '2026-10-12T10:01:00Z' }, ok({ ...yes, decidedAt: '' }))).toBe('hold_unknown');
  });

  // A no must never quiet a check that needs no photo: the server's gate keeps the photo
  // and still writes the contextual escalation, so the invoke runs.
  it('no answer, or a no: the invoke runs, whatever the photo', () => {
    for (const photo of [{ kind: 'added', at: '2020-01-01T00:00:00Z' }, { kind: 'unknown' }] as const) {
      expect(mountSendDecision(photo, ok(null))).toBe('send');
      expect(mountSendDecision(photo, ok(no))).toBe('send');
    }
  });

  it('a photoless record always invokes, even with the consent unread', () => {
    expect(mountSendDecision({ kind: 'none' }, { kind: 'error' })).toBe('send');
  });
});

describe('the frames', () => {
  it('reads the consent, keeping "not read yet" apart from "no answer"', () => {
    expect(recordConsentOf(undefined, false)).toBe('loading');
    expect(recordConsentOf(undefined, true)).toBe('error');
    expect(recordConsentOf(null, true)).toBe('unasked');
    expect(recordConsentOf(yes, false)).toBe('granted');
    expect(recordConsentOf(no, false)).toBe('declined');
  });

  it('unread: ask, off, read this, or the bare status while unknown', () => {
    expect(unreadFrameOf('unasked')).toBe('ask');
    expect(unreadFrameOf('declined')).toBe('off');
    expect(unreadFrameOf('granted')).toBe('read_this');
    expect(unreadFrameOf('loading')).toBe('unread');
    expect(unreadFrameOf('error')).toBe('unread');
  });

  it('capped then declined: the cap copy (a read tomorrow) gives way', () => {
    expect(cappedFrameOf('declined')).toBe('off');
    expect(cappedFrameOf('unasked')).toBe('ask');
    expect(cappedFrameOf('granted')).toBeNull();
    expect(cappedFrameOf('loading')).toBeNull();
  });

  it('frame G: only an unread photo under a call, and only while off or unanswered', () => {
    const gated = { status: 'completed', ai_raw_payload: null };
    expect(photoUnreadUnderCall(gated, true)).toBe(true);
    expect(photoUnreadUnderCall(gated, false)).toBe(false);
    expect(photoUnreadUnderCall({ status: 'completed', ai_raw_payload: { confidence: 'high' } }, true)).toBe(false);
    expect(photoUnreadUnderCall({ status: 'failed', ai_raw_payload: null }, true)).toBe(false);
    expect(besideCallOf('declined')).toBe('off_line');
    expect(besideCallOf('unasked')).toBe('ask');
    expect(besideCallOf('granted')).toBeNull();
  });
});
