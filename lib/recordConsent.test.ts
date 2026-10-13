import {
  besideCallOf,
  cappedFrameOf,
  photoUnreadUnderCall,
  recordConsentOf,
  unreadFrameOf,
} from './recordConsent';
import type { AiConsentRow } from './aiConsent';

const yes: AiConsentRow = { granted: true, copyVersion: '2026-10-12', source: 'backstop', decidedAt: '2026-10-12T10:00:00+00:00' };
const no: AiConsentRow = { ...yes, granted: false };

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
