// B-745 PR 3 — the confirm copy. The one assertion that matters most is PARITY:
// the window wording the confirm pill shows must be byte-identical to what the
// History row (describeOccurredAt) will show for the same saved event, so the
// summary pill genuinely is "what gets written". And the open-ended case must NOT
// carry the mock's draft "since this morning" (a lower bound the record doesn't
// hold — clinical-guardrails).

import { summarizeSimpleEvent, confirmTimePhrase, confirmTimeRowLabel } from './logCopy';
import { describeOccurredAt, formatTime } from './utils';

// Local-component dates (B-514): a witnessed "today at" assertion must not become a
// statement about the runner's clock, so build the instant from local parts and
// pass an explicit `now` on the same local day.
const NOW = new Date(2026, 7, 13, 18, 0); // Aug 13 2026, 6:00 PM local
const POINT = new Date(2026, 7, 13, 17, 33); // 5:33 PM local, same day

describe('summarizeSimpleEvent — witnessed', () => {
  it('reads "{Type} · today at {time}" on the same local day', () => {
    expect(summarizeSimpleEvent({
      typeLabel: 'Vomit', confidence: 'witnessed', occurredAt: POINT, earliest: null, latest: null, now: NOW,
    })).toBe(`Vomit · today at ${formatTime(POINT)}`);
  });

  it('reads "yesterday at {time}" for the prior local day', () => {
    const yday = new Date(2026, 7, 12, 9, 15);
    expect(confirmTimePhrase({
      confidence: 'witnessed', occurredAt: yday, earliest: null, latest: null, now: NOW,
    })).toBe(`yesterday at ${formatTime(yday)}`);
  });

  it('names the date for an older witnessed point', () => {
    const old = new Date(2026, 7, 3, 9, 15);
    const phrase = confirmTimePhrase({
      confidence: 'witnessed', occurredAt: old, earliest: null, latest: null, now: NOW,
    });
    // "Aug 3 at 9:15 AM" — not "today"/"yesterday"
    expect(phrase).toMatch(/ at /);
    expect(phrase).not.toContain('today');
    expect(phrase).not.toContain('yesterday');
  });
});

describe('summarizeSimpleEvent — window (History parity)', () => {
  it('open-ended pill equals describeOccurredAt.primary ("found by …"), never "since this morning"', () => {
    const latest = new Date(2026, 7, 13, 17, 33);
    const input = { confidence: 'window' as const, occurredAt: latest, earliest: null, latest, now: NOW };
    const parity = describeOccurredAt({
      confidence: 'window', occurredAt: latest.toISOString(), earliest: null, latest: latest.toISOString(),
    }).primary;
    expect(confirmTimePhrase(input)).toBe(parity);              // parity with History
    expect(confirmTimePhrase(input)).toContain('found by');     // the honest upper-bound phrasing
    expect(confirmTimePhrase(input)).not.toContain('since');    // NOT a fabricated lower bound
    expect(summarizeSimpleEvent({ ...input, typeLabel: 'Vomit' })).toBe(`Vomit · ${parity}`);
  });

  it('bounded pill equals describeOccurredAt.primary ("between … and …")', () => {
    const earliest = new Date(2026, 7, 13, 14, 0);
    const latest = new Date(2026, 7, 13, 17, 33);
    const input = { confidence: 'window' as const, occurredAt: latest, earliest, latest, now: NOW };
    const parity = describeOccurredAt({
      confidence: 'window', occurredAt: latest.toISOString(),
      earliest: earliest.toISOString(), latest: latest.toISOString(),
    }).primary;
    expect(confirmTimePhrase(input)).toBe(parity);
    expect(confirmTimePhrase(input)).toContain('between');
    expect(summarizeSimpleEvent({ ...input, typeLabel: 'Loose stool' })).toBe(`Loose stool · ${parity}`);
  });
});

describe('confirmTimeRowLabel', () => {
  it('witnessed row is "Today · {time}" (sentence-cased, dot separator)', () => {
    expect(confirmTimeRowLabel({
      confidence: 'witnessed', occurredAt: POINT, earliest: null, latest: null, now: NOW,
    })).toBe(`Today · ${formatTime(POINT)}`);
  });

  it('window row capitalizes the History phrase ("Found by {time}")', () => {
    const latest = new Date(2026, 7, 13, 17, 33);
    expect(confirmTimeRowLabel({
      confidence: 'window', occurredAt: latest, earliest: null, latest, now: NOW,
    })).toMatch(/^Found by /);
  });
});

// No exclamation marks anywhere (nyx-voice Pattern 4).
describe('confirm copy — voice', () => {
  it('never uses an exclamation mark', () => {
    const inputs = [
      { confidence: 'witnessed' as const, occurredAt: POINT, earliest: null, latest: null, now: NOW },
      { confidence: 'window' as const, occurredAt: POINT, earliest: null, latest: POINT, now: NOW },
      { confidence: 'window' as const, occurredAt: POINT, earliest: new Date(2026, 7, 13, 14, 0), latest: POINT, now: NOW },
    ];
    for (const i of inputs) {
      expect(summarizeSimpleEvent({ ...i, typeLabel: 'Vomit' })).not.toContain('!');
      expect(confirmTimeRowLabel(i)).not.toContain('!');
    }
  });
});
