// The same-day pairing (CUL-874 / N-5) — §6.11, T-17, and L-17 as ruled (CUL-849).
//
// Day keys here are synthetic ('d-01'), not calendar days: this module never parses a
// day, it only INTERSECTS SETS of them, so a synthetic key exercises exactly what it
// does and keeps the test off the clock (C-29 — no calendar literal is being judged).

jest.mock('./sync', () => ({ syncPendingEvents: jest.fn(), syncPendingLooks: jest.fn() }));
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));

import {
  cardPairing,
  LOOK_PAIRING_DISCLOSURE,
  LOOK_PAIRING_MIN_MARKED_VOMIT_DAYS,
  LOOK_PAIRING_MIN_OTHER_DAYS,
  LOOK_PAIRING_MIN_VOMIT_DAYS,
} from './lookPairing';
import { LOOK_VOCAB_VERSION } from '../constants/lookWords';
import type { LookDayRow } from './lookDayCounts';

function look(day: string, words: string[] = []): LookDayRow {
  return {
    eventId: `e-${day}-${words.join('_')}`,
    localDay: day,
    createdAt: `2026-01-01T00:00:00.000Z`,
    outcome: words.length > 0 ? 'observed' : 'nothing_unusual',
    words,
    vocabVersion: LOOK_VOCAB_VERSION,
  };
}

function key(n: number): string {
  return `d-${String(n).padStart(3, '0')}`;
}

/**
 * A record with `vomitDays` answered vomit days and `otherDays` answered other days.
 *
 * `onVomit` / `onOther` are how many of each carry `word`. Vomit days take the low keys,
 * other days the high ones, so the two sets are disjoint by construction.
 */
function build(opts: {
  vomitDays: number;
  otherDays: number;
  word: string;
  onVomit: number;
  onOther: number;
  /** Vomit days with NO look at all — outside both sides (§6.11). */
  unansweredVomitDays?: number;
  /** A second word, to exercise "at most one pairing". */
  second?: { word: string; onVomit: number; onOther: number };
}): { record: LookDayRow[]; vomitLocalDays: string[] } {
  const record: LookDayRow[] = [];
  const vomitLocalDays: string[] = [];
  for (let i = 0; i < opts.vomitDays; i += 1) {
    const d = key(i);
    vomitLocalDays.push(d);
    const words: string[] = [];
    if (i < opts.onVomit) words.push(opts.word);
    if (opts.second && i < opts.second.onVomit) words.push(opts.second.word);
    record.push(look(d, words));
  }
  for (let i = 0; i < (opts.unansweredVomitDays ?? 0); i += 1) {
    vomitLocalDays.push(key(500 + i)); // a vomit day with no look row
  }
  for (let i = 0; i < opts.otherDays; i += 1) {
    const d = key(100 + i);
    const words: string[] = [];
    if (i < opts.onOther) words.push(opts.word);
    if (opts.second && i < opts.second.onOther) words.push(opts.second.word);
    record.push(look(d, words));
  }
  return { record, vomitLocalDays };
}

const CAT = { species: 'cat' as const };

describe('§6.11 — the floors', () => {
  it('the shipped floors are the spec’s numbers', () => {
    expect(LOOK_PAIRING_MIN_VOMIT_DAYS).toBe(3);
    expect(LOOK_PAIRING_MIN_OTHER_DAYS).toBe(10);
    expect(LOOK_PAIRING_MIN_MARKED_VOMIT_DAYS).toBe(2);
  });

  it('renders at exactly three answered vomit days and ten answered other days', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 1,
    });
    const pairing = cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] });
    expect(pairing).not.toBeNull();
    expect(pairing?.vomitDays).toBe(3);
    expect(pairing?.otherDays).toBe(10);
  });

  it('two answered vomit days render nothing', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 2, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 0,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] })).toBeNull();
  });

  it('nine answered other days render nothing', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 3, otherDays: 9, word: 'lip_licking', onVomit: 2, onOther: 0,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] })).toBeNull();
  });

  it('BOTH denominators count ANSWERED days — an unanswered vomit day is on neither side', () => {
    // The third pass's correction. With four vomit days of which one has no look, the
    // left denominator is THREE, not four: scoring the unanswered day as "nothing seen"
    // is the reassuring direction on the question a worried owner is asking.
    const { record, vomitLocalDays } = build({
      vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 1, unansweredVomitDays: 1,
    });
    const pairing = cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] });
    expect(pairing?.vomitDays).toBe(3);
    expect(pairing?.unansweredVomitDays).toBe(1);
    expect(pairing?.text).toContain('1 vomit day not answered');
    // And the two sides partition the answered days exactly once (C-4).
    expect((pairing?.vomitDays ?? 0) + (pairing?.otherDays ?? 0)).toBe(13);
  });

  it('pluralises the unanswered clause, and omits it entirely at zero', () => {
    const two = build({
      vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 0, unansweredVomitDays: 2,
    });
    expect(
      cardPairing(two.record, { vomitLocalDays: two.vomitLocalDays, ...CAT, words: ['lip_licking'] })?.text,
    ).toContain('2 vomit days not answered');

    const none = build({ vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 0 });
    expect(
      cardPairing(none.record, { vomitLocalDays: none.vomitLocalDays, ...CAT, words: ['lip_licking'] })?.text,
    ).not.toContain('not answered');
  });
});

describe('§6.11 — the left numerator is never zero and never one', () => {
  it('renders nothing at ZERO — an absence claim at n=3, on the day she was worried', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 5, otherDays: 20, word: 'lip_licking', onVomit: 0, onOther: 0,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] })).toBeNull();
  });

  it('renders nothing at ONE — *1 of the 1* is a pattern generator', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 5, otherDays: 20, word: 'lip_licking', onVomit: 1, onOther: 0,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] })).toBeNull();
  });
});

describe('§6.11 — a strictly positive margin only', () => {
  it('the fourth pass’s counterexample renders NOTHING: 2 of 3 vomit days, 9 of 10 other days', () => {
    // Cleared every other floor in the draft and printed as a finding — with the control
    // fraction HIGHER than the one it was being read as evidence for.
    const { record, vomitLocalDays } = build({
      vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 9,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] })).toBeNull();
  });

  it('an EQUAL margin renders nothing — 2 of 4 beside 5 of 10 is not a finding', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 4, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 5,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] })).toBeNull();
  });

  it('a hair above equal renders — the gate is strict, not approximate', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 4, otherDays: 10, word: 'lip_licking', onVomit: 3, onOther: 5,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] })).not.toBeNull();
  });
});

describe('L-17 — the disclosure IS the correction, and it cannot be dropped', () => {
  const { record, vomitLocalDays } = build({
    vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 1,
  });
  const pairing = cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] });

  it('the one renderable string carries the fraction AND the sentence', () => {
    expect(pairing?.text).toContain('on 2 of the 3 vomit days you answered');
    expect(pairing?.text).toContain('and on 1 of the 10 other days you answered');
    expect(pairing?.text).toContain(LOOK_PAIRING_DISCLOSURE);
  });

  it('THE ATTACK — there is no field on the result that emits the fraction without it', () => {
    // The adversarial pass this issue asks for, encoded. A render path able to print the
    // fraction alone is the uncorrected comparison L-17 was raised to stop, so: every
    // STRING the module returns must carry the disclosure. The numbers may be read
    // (the report and these tests need them); no pre-formatted fraction may be.
    expect(pairing).not.toBeNull();
    if (!pairing) return;
    const strings = Object.entries(pairing).filter(([, v]) => typeof v === 'string');
    expect(strings.length).toBeGreaterThan(0);
    for (const [field, value] of strings) {
      if (field === 'word') continue; // the key, not a sentence
      expect(value).toContain(LOOK_PAIRING_DISCLOSURE);
    }
  });

  it('the disclosure sits on its own line, so a renderer shows both or neither', () => {
    const [counts, disclosure] = (pairing?.text ?? '').split('\n');
    expect(counts).toMatch(/^on \d+ of the \d+ vomit days you answered/);
    expect(disclosure).toBe(LOOK_PAIRING_DISCLOSURE);
  });

  it('never says "linked", "predicts", or names a tier', () => {
    expect(pairing?.text).not.toMatch(/link|predict|strong|weak|likely|correlat|cause/i);
  });
});

describe('L-17 — at most ONE pairing per card, the largest positive margin', () => {
  it('picks the larger margin when two words qualify', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 4, otherDays: 20, word: 'lip_licking', onVomit: 2, onOther: 5,
      second: { word: 'subdued', onVomit: 4, onOther: 1 },
    });
    const pairing = cardPairing(record, {
      vomitLocalDays, ...CAT, words: ['lip_licking', 'subdued'],
    });
    expect(pairing?.word).toBe('subdued');
  });

  it('returns exactly one value, never a list', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 4, otherDays: 20, word: 'lip_licking', onVomit: 3, onOther: 1,
      second: { word: 'subdued', onVomit: 3, onOther: 1 },
    });
    const pairing = cardPairing(record, {
      vomitLocalDays, ...CAT, words: ['lip_licking', 'subdued'],
    });
    expect(Array.isArray(pairing)).toBe(false);
    expect(pairing?.word).toBe('lip_licking'); // the tie-break: the card's own row order
  });

  it('the tie-break is deterministic — the same record reads the same way twice', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 4, otherDays: 20, word: 'lip_licking', onVomit: 3, onOther: 1,
      second: { word: 'subdued', onVomit: 3, onOther: 1 },
    });
    const a = cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking', 'subdued'] });
    const b = cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking', 'subdued'] });
    expect(a?.word).toBe(b?.word);
  });
});

describe('§6.11 floor 4 — concern words only', () => {
  it('an ACTIVITY POSITIVE never earns a pairing, however strong the margin', () => {
    // *Played lined up most often with a vomit day* is the render this floor exists to
    // make unreachable: a positive is never one half of a two-half comparison (§6.6).
    const { record, vomitLocalDays } = build({
      vomitDays: 5, otherDays: 20, word: 'played', onVomit: 5, onOther: 0,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['played'] })).toBeNull();
  });

  it('a positive cannot displace a concern word that qualifies', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 5, otherDays: 20, word: 'played', onVomit: 5, onOther: 0,
      second: { word: 'lip_licking', onVomit: 2, onOther: 1 },
    });
    const pairing = cardPairing(record, { vomitLocalDays, ...CAT, words: ['played', 'lip_licking'] });
    expect(pairing?.word).toBe('lip_licking');
  });

  it('the OPENING CHIP is a concern and is eligible — it is the chief complaint', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 4, otherDays: 20, word: 'not_herself', onVomit: 3, onOther: 1,
    });
    expect(cardPairing(record, { vomitLocalDays, ...CAT, words: ['not_herself'] })?.word).toBe(
      'not_herself',
    );
  });
});

describe('the record it is handed', () => {
  it('a vomit day the record has no look for is never counted as a control day', () => {
    // The control side is the COMPLEMENT inside the answered set, so a vomit day with no
    // look cannot leak into `otherDays` and dilute the control fraction.
    const { record, vomitLocalDays } = build({
      vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 1, unansweredVomitDays: 5,
    });
    const pairing = cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] });
    expect(pairing?.otherDays).toBe(10);
  });

  it('is pure — it does not mutate the record or the day list', () => {
    const { record, vomitLocalDays } = build({
      vomitDays: 3, otherDays: 10, word: 'lip_licking', onVomit: 2, onOther: 1,
    });
    const before = JSON.stringify({ record, vomitLocalDays });
    cardPairing(record, { vomitLocalDays, ...CAT, words: ['lip_licking'] });
    expect(JSON.stringify({ record, vomitLocalDays })).toBe(before);
  });

  it('an empty record renders nothing rather than dividing by zero', () => {
    expect(cardPairing([], { vomitLocalDays: [], ...CAT, words: ['lip_licking'] })).toBeNull();
  });
});
