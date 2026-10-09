// EN-3's go-live date lines (CUL-1513, tiers spec §5). Each line is said only where the
// record backs it, and nothing is said without a go-live day.
import {
  datedCallLinesOf,
  earlierRuleLineOf,
  liveSinceOf,
  newSinceLine,
  newSinceLineOf,
  readBeforeLiveSince,
  ruleSeamOf,
  type SeamRead,
} from './ruleSeam';
import type { MonthDay } from './monthModel';
import { EN3_ENGINE_KEY } from './incidentTierWords';
import { dateWord } from './chartCopy';

const LIVE = '2026-10-20';
const STAMP = JSON.stringify([EN3_ENGINE_KEY]);

/** An instant built from LOCAL components, so the fixture means the same day in every zone
 *  the CI runs (C-29). */
function localIso(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

describe('liveSinceOf: the day rides in the key\'s own value', () => {
  it('reads a calendar day from the allowlist value', () => {
    expect(liveSinceOf({ enabled: false, allowlist: ['u'], live_since: LIVE })).toBe(LIVE);
    expect(liveSinceOf({ enabled: true, live_since: '2026-01-05' })).toBe('2026-01-05');
  });
  it('is null for an absent, unseeded, malformed or impossible day', () => {
    expect(liveSinceOf(undefined)).toBeNull();
    expect(liveSinceOf(true)).toBeNull();
    expect(liveSinceOf({ enabled: true })).toBeNull();
    expect(liveSinceOf({ enabled: true, live_since: 20261020 })).toBeNull();
    expect(liveSinceOf({ enabled: true, live_since: '2026-10-20T00:00:00Z' })).toBeNull();
    expect(liveSinceOf({ enabled: true, live_since: '2026-02-30' })).toBeNull();
    expect(liveSinceOf({ enabled: true, live_since: '' })).toBeNull();
  });
});

describe('readBeforeLiveSince: the start of the day on this phone', () => {
  it('splits at local midnight', () => {
    expect(readBeforeLiveSince(localIso(2026, 10, 19, 23, 59), LIVE)).toBe(true);
    expect(readBeforeLiveSince(localIso(2026, 10, 20, 0, 0), LIVE)).toBe(false);
    expect(readBeforeLiveSince(localIso(2026, 10, 20, 9), LIVE)).toBe(false);
  });
  it('parses both spellings of one instant alike (C-40)', () => {
    const at = new Date(2026, 9, 19, 12).getTime();
    const z = new Date(at).toISOString();
    const plus = z.replace('.000Z', '+00:00');
    expect(z).not.toBe(plus);
    expect(readBeforeLiveSince(z, LIVE)).toBe(readBeforeLiveSince(plus, LIVE));
  });
  it('withholds on an unknown time', () => {
    expect(readBeforeLiveSince(null, LIVE)).toBe(false);
    expect(readBeforeLiveSince('not a time', LIVE)).toBe(false);
  });
});

describe('earlierRuleLineOf: the meta line under an unchanged earlier-rule card', () => {
  const earlier = { status: 'completed', recommendation: 'worth_a_call', tier: null, engine_flags: '[]', updated_at: localIso(2026, 9, 22, 1, 30) };
  it('names the rule and the day', () => {
    expect(earlierRuleLineOf(earlier, LIVE)).toBe(`Read under the earlier rule, before ${dateWord(LIVE)}.`);
  });
  it('says nothing with no go-live day, so the card is today\'s to the byte', () => {
    expect(earlierRuleLineOf(earlier, null)).toBeNull();
  });
  it('never on a new-rule read, whatever its time', () => {
    expect(earlierRuleLineOf({ ...earlier, tier: 'call_today', engine_flags: STAMP }, LIVE)).toBeNull();
  });
  it('never on an earlier-rule read last written on or after the day (a rolled-back write)', () => {
    expect(earlierRuleLineOf({ ...earlier, updated_at: localIso(2026, 10, 21) }, LIVE)).toBeNull();
    expect(earlierRuleLineOf({ ...earlier, updated_at: null }, LIVE)).toBeNull();
  });
});

function read(id: string, occurred: string, over: Partial<SeamRead> = {}): SeamRead {
  return { event_id: id, occurred_at: occurred, status: 'completed', recommendation: 'monitor', tier: null, engine_flags: '[]', ...over };
}
const tiered = (id: string, occurred: string, over: Partial<SeamRead> = {}) =>
  read(id, occurred, { tier: 'logged', engine_flags: STAMP, ...over });

describe('ruleSeamOf / newSinceLineOf: the pet\'s first new-rule read, from the record', () => {
  const old = read('a', '2026-09-22T05:30:00.000Z', { recommendation: 'worth_a_call' });
  const first = tiered('b', '2026-10-21T00:05:00.000Z');
  const second = tiered('c', '2026-10-23T00:05:00.000Z', { tier: 'call_today', recommendation: 'worth_a_call' });

  it('marks the earliest tiered read, when an earlier-rule read exists', () => {
    expect(ruleSeamOf([second, old, first])).toEqual({ firstTiered: 'b', hasEarlier: true });
    expect(newSinceLineOf('b', [second, old, first], LIVE, 'Nyx')).toBe(newSinceLine(LIVE, 'Nyx'));
    expect(newSinceLineOf('c', [second, old, first], LIVE, 'Nyx')).toBeNull();
  });
  it('a pet with no earlier reads never sees it', () => {
    expect(newSinceLineOf('b', [first, second], LIVE, 'Nyx')).toBeNull();
  });
  it('says nothing without a go-live day', () => {
    expect(newSinceLineOf('b', [old, first], null, 'Nyx')).toBeNull();
  });
  it('a read with no standing words counts on neither side', () => {
    // A pending earlier read is not an earlier read; a tiered read in flight is not the first.
    const pendingOld = read('p', '2026-09-01T00:00:00.000Z', { status: 'pending', recommendation: null });
    expect(ruleSeamOf([pendingOld, first]).hasEarlier).toBe(false);
    const inFlight = tiered('q', '2026-10-20T12:00:00.000Z', { status: 'pending', tier: null, recommendation: null });
    expect(ruleSeamOf([old, inFlight, first]).firstTiered).toBe('b');
  });
  it('orders by the instant, not the text (C-40), with the id breaking a tie', () => {
    const z = tiered('z', '2026-10-21T04:00:00.000Z');
    const plus = tiered('y', '2026-10-21T04:00:00+00:00');
    expect(ruleSeamOf([old, z, plus]).firstTiered).toBe('y');
    const earlierPlus = tiered('x', '2026-10-21T03:59:59+00:00');
    expect(ruleSeamOf([old, z, earlierPlus]).firstTiered).toBe('x');
  });
  it('the stamp decides the side, never a tier alone (a rolled-back write is earlier-rule)', () => {
    const staleTier = read('s', '2026-10-25T00:00:00.000Z', { tier: 'call_today', recommendation: 'worth_a_call' });
    expect(ruleSeamOf([staleTier, first])).toEqual({ firstTiered: 'b', hasEarlier: true });
  });
  it('names the pet, and falls back to no name rather than a wrong one', () => {
    expect(newSinceLine(LIVE, 'Nyx')).toBe(`New since ${dateWord(LIVE)}: reads say how soon to call. Nyx's earlier reads keep the words they had.`);
    expect(newSinceLine(LIVE, '  ')).toBe(`New since ${dateWord(LIVE)}: reads say how soon to call. Earlier reads keep the words they had.`);
  });
});

function day(key: string, call: MonthDay['call'], outsideMonth = false): MonthDay {
  return { key, call, outsideMonth } as MonthDay;
}
function october(calls: Record<string, MonthDay['call']>) {
  const days: MonthDay[] = [];
  for (let d = 1; d <= 31; d++) {
    const key = `2026-10-${String(d).padStart(2, '0')}`;
    days.push(day(key, calls[key] ?? null));
  }
  return { days };
}

describe('datedCallLinesOf: the month dates its lines only where both hold', () => {
  const straddle = { '2026-10-04': 'worth_a_call', '2026-10-10': 'worth_a_call', '2026-10-22': 'call_today', '2026-10-23': 'call_now' } as const;

  it('dates both lines and marks the seam on a month that straddles the day', () => {
    expect(datedCallLinesOf(october(straddle), LIVE)).toEqual({
      before: `Before ${dateWord(LIVE)}, read as`,
      from: `From ${dateWord(LIVE)}, read as`,
      seamKey: LIVE,
    });
  });
  it('a month wholly on one side keeps today\'s line', () => {
    expect(datedCallLinesOf(october({ '2026-10-04': 'worth_a_call' }), LIVE)).toBeNull();
    expect(datedCallLinesOf(october({ '2026-10-22': 'call_today' }), LIVE)).toBeNull();
    expect(datedCallLinesOf(october({}), LIVE)).toBeNull();
  });
  it('no go-live day, no dates', () => {
    expect(datedCallLinesOf(october(straddle), null)).toBeNull();
  });
  it('never "From {date}" over a day before it (a re-run tiered an old read)', () => {
    expect(datedCallLinesOf(october({ ...straddle, '2026-10-02': 'call_today' }), LIVE)).toBeNull();
  });
  it('never "Before {date}" over a day on or after it (an earlier-rule write after go-live)', () => {
    expect(datedCallLinesOf(october({ ...straddle, '2026-10-20': 'worth_a_call' }), LIVE)).toBeNull();
    expect(datedCallLinesOf(october({ ...straddle, '2026-10-28': 'worth_a_call' }), LIVE)).toBeNull();
  });
  it('a tiered call ON the day is "from" it', () => {
    expect(datedCallLinesOf(october({ '2026-10-04': 'worth_a_call', '2026-10-20': 'call_today' }), LIVE)?.seamKey).toBe(LIVE);
  });
});

describe("newSinceLineOf: the screen's own row stands in for the copy's", () => {
  it('a Re-run that tiered this read counts before the copy is pulled', () => {
    const old = read('a', '2026-09-22T05:30:00.000Z', { recommendation: 'worth_a_call' });
    const staleCopy = read('b', '2026-10-21T00:05:00.000Z');
    expect(newSinceLineOf('b', [old, staleCopy], LIVE, 'Nyx')).toBeNull();
    const own = { status: 'completed', recommendation: 'monitor', tier: 'logged', engine_flags: [EN3_ENGINE_KEY] };
    expect(newSinceLineOf('b', [old, staleCopy], LIVE, 'Nyx', own)).toBe(newSinceLine(LIVE, 'Nyx'));
  });
});

describe('the lines never reassure (clinical-guardrails Pattern 8)', () => {
  it('no REASSURE_VOCAB word in any line', () => {
    const REASSURE_VOCAB = /\b(fine|okay|ok|healthy|normal|unremarkable|all clear|nothing (?:to worry|concerning|alarming))\b/i;
    const lines = [
      earlierRuleLineOf({ status: 'completed', recommendation: 'monitor', updated_at: localIso(2026, 9, 1) }, LIVE) ?? '',
      newSinceLine(LIVE, 'Nyx'),
      ...Object.values(datedCallLinesOf(october({ '2026-10-04': 'worth_a_call', '2026-10-22': 'call_today' }), LIVE) ?? {}),
    ];
    expect(lines.every((l) => l.length > 0)).toBe(true);
    for (const l of lines) expect(REASSURE_VOCAB.test(l)).toBe(false);
  });
});
