// B-745 PR 3 — the confirm copy. The one assertion that matters most is PARITY:
// the window wording the confirm pill shows must be byte-identical to what the
// History row (describeOccurredAt) will show for the same saved event, so the
// summary pill genuinely is "what gets written". And the open-ended case must NOT
// carry the mock's draft "since this morning" (a lower bound the record doesn't
// hold — clinical-guardrails).

import { summarizeSimpleEvent, confirmTimePhrase, confirmTimeRowLabel, noPetToLogForCopy } from './logCopy';
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

describe('noPetToLogForCopy — CUL-681 / CUL-717', () => {
  it('noPetToLogForCopy orders its clauses by likelihood, not by what is actionable', () => {
    // CUL-717 / CUL-681. The order is the whole reason this is shared rather than
    // written twice: the dominant cause of the state is a pets read that has not
    // answered, so the owner reading it usually HAS a pet — and a draft that led
    // with "add a pet" told them to add another. Sam's falsification, pinned so a
    // later copy edit has to argue with it rather than quietly re-order it.
    const copy = noPetToLogForCopy();
    expect(copy.title).toBe('No pet loaded yet');
    // The title is under the ordering rule too (CUL-717, PM-ruled). It must be a
    // LOAD-state claim — the only framing true of all three arrivals — and share
    // the body's verb so the second line explains the first. Asserted as the
    // shared stem rather than the exact word, so a reword can pass and a revert to
    // an account-state title ("No pet to log for yet") cannot.
    expect(copy.title.toLowerCase()).toContain('load');
    expect(copy.body.toLowerCase()).toContain('load');
    const loading = copy.body.indexOf('load a moment');
    const connection = copy.body.indexOf('check your connection');
    const addAPet = copy.body.indexOf('add a pet');
    expect(loading).toBeGreaterThanOrEqual(0);
    expect(connection).toBeGreaterThan(loading);
    expect(addAPet).toBeGreaterThan(connection);
    expect(copy.title).not.toContain('!');
    expect(copy.body).not.toContain('!');
  });
});
