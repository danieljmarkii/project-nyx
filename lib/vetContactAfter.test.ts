import {
  contactAfterEyebrow,
  describeContactSave,
  hasLiveWarning,
  keepGoingLine,
} from './vetContactAfter';
import type { SignalCacheRow } from './signal';

// CUL-2767 (Vet contacts PR-05, spec §4.3–4.4, AC 12). The saved moment's check is earned by
// the absence of anything open; these pin the predicate and every branch's words.

const cacheWith = (classes: Array<'safety' | 'insight'>): SignalCacheRow =>
  ({
    signalText: null,
    isBuilding: false,
    coverage: [],
    generatedAt: '2026-11-14T12:00:00Z',
    expiresAt: '2026-11-15T12:00:00Z',
    findings: classes.map((c, rank) => ({
      rank,
      finding: c === 'safety'
        ? { type: 'intake_decline', priorityClass: 'safety' }
        : { type: 'reflection', priorityClass: 'insight' },
    })),
  }) as unknown as SignalCacheRow;

const BANNED = /handled|\bdone\b|all set/i;
// clinical-guardrails Pattern 8: the analyze-* suites' reassurance vocabulary, word for word.
const REASSURE_VOCAB = /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i;
// Pattern 11's Never column: no condition on the owner's sense of normal, no "can wait".
const NEVER_ASK = /isn.t like|if you.re not worried|can wait|no rush|when convenient/i;

describe('hasLiveWarning', () => {
  it('is true for any safety card, and for an unread cache (C-12: unread is not empty)', () => {
    expect(hasLiveWarning(cacheWith(['insight', 'safety']))).toBe(true);
    expect(hasLiveWarning('unread')).toBe(true);
  });
  it('is false for no cache row and for insight cards alone', () => {
    expect(hasLiveWarning(null)).toBe(false);
    expect(hasLiveWarning(cacheWith(['insight']))).toBe(false);
    expect(hasLiveWarning(cacheWith([]))).toBe(false);
  });
});

describe('describeContactSave', () => {
  const linked = [{ key: 'course:1', title: 'Motazol started', note: 'linked to this visit' }];

  it.each(['phone', 'text', 'email'] as const)('a live warning on a %s: no check, Home unchanged, the safety line', (channel) => {
    const s = describeContactSave({ petName: 'Pixel', channel, liveWarning: true, watchedSign: false, linked });
    expect(s.mark).toBe('neutral');
    expect(s.safety).toEqual({ lead: 'If Pixel is worse, don’t wait.', rest: 'Call your vet today.' });
    expect(s.reportLine).toMatch(/^Nothing on Home changes because you (called|texted|emailed)\.$/);
    for (const line of [s.heading, s.reportLine, s.safety?.lead, s.safety?.rest]) {
      expect(line ?? '').not.toMatch(BANNED);
      expect(line ?? '').not.toMatch(REASSURE_VOCAB);
      expect(line ?? '').not.toMatch(NEVER_ASK);
      expect(line ?? '').not.toContain('!');
    }
  });

  it('a watched sign alone also takes the neutral moment', () => {
    expect(describeContactSave({ petName: 'Nyx', channel: 'phone', liveWarning: false, watchedSign: true, linked: [] }).mark)
      .toBe('neutral');
  });

  it('nothing open keeps the shipped check with the no-exam report line (C5)', () => {
    const s = describeContactSave({ petName: 'Nyx', channel: 'phone', liveWarning: false, watchedSign: false, linked: [] });
    for (const line of [s.heading, s.reportLine]) {
      expect(line ?? '').not.toMatch(REASSURE_VOCAB);
      expect(line ?? '').not.toMatch(BANNED);
    }
    expect(s).toMatchObject({
      mark: 'check',
      heading: 'Nyx’s call is saved',
      reportLine: 'It goes on Nyx’s vet report as a phone call. No exam.',
      safety: null,
      offlineLine: 'On this phone now — backs up when you’re online',
    });
    expect(describeContactSave({ petName: 'Nyx', channel: 'text', liveWarning: false, watchedSign: false, linked: [] }).heading)
      .toBe('Nyx’s texts are saved');
    expect(describeContactSave({ petName: 'Pixel', channel: 'email', liveWarning: false, watchedSign: false, linked: [] }).reportLine)
      .toBe('It goes on Pixel’s vet report as an email. No exam.');
  });
});

describe('the screen words', () => {
  it('names the channel, the day and the reason in the eyebrow', () => {
    expect(contactAfterEyebrow('phone', '2026-11-09', 'Ear')).toBe('Phone · Mon, Nov 9 · Ear');
    expect(contactAfterEyebrow('text', '2026-11-09', '  ')).toBe('Text · Mon, Nov 9');
  });
  it('Keep going until names the old end only once it moved', () => {
    expect(keepGoingLine('2026-11-23')).toBe('Keep going until Mon, Nov 23');
    expect(keepGoingLine('2026-12-01', '2026-11-23')).toBe('Keep going until Tue, Dec 1 · was Nov 23');
    expect(keepGoingLine('2026-12-01', '2026-12-01')).toBe('Keep going until Tue, Dec 1');
    expect(keepGoingLine(null)).toBeNull();
    expect(keepGoingLine('2026-02-30')).toBeNull();
  });
});
