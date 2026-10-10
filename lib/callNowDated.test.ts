// Engines v3 PR-30c (CUL-1739; PM ruling A, 2026-10-10). A call now says "now" for its read's first
// 24 hours and steps to a dated form after. The boundary is the read's instant plus a day, never
// the local day: a local-day rule would date an 11:40 pm call twenty minutes later.

import {
  CALL_NOW_ASK,
  CALL_NOW_FIRST_DAY_MS,
  callNowIsDated,
  datedCallNowLabel,
  DATED_CALL_NOW_ACTION,
  recordDatedCallNow,
} from './callNowDated';
import { TIER_WORDS } from './incidentTierWords';

const READ = '2026-10-03T23:40:00.000Z';
const readMs = Date.parse(READ);

describe('the first day is 24 hours from the read', () => {
  it('says "now" up to a millisecond before the day ends, and dates it at the day', () => {
    expect(callNowIsDated(READ, readMs)).toBe(false);
    expect(callNowIsDated(READ, readMs + 20 * 60_000)).toBe(false); // past local midnight, still now
    expect(callNowIsDated(READ, readMs + CALL_NOW_FIRST_DAY_MS - 1)).toBe(false);
    expect(callNowIsDated(READ, readMs + CALL_NOW_FIRST_DAY_MS)).toBe(true);
    expect(callNowIsDated(READ, readMs + 13 * CALL_NOW_FIRST_DAY_MS)).toBe(true);
  });

  it('two spellings of one instant date at the same moment (C-40)', () => {
    const plus = '2026-10-03T23:40:00+00:00';
    expect(callNowIsDated(plus, readMs + CALL_NOW_FIRST_DAY_MS - 1)).toBe(false);
    expect(callNowIsDated(plus, readMs + CALL_NOW_FIRST_DAY_MS)).toBe(true);
  });

  it('fails loud: an unreadable instant, a missing one, a future one or a broken clock keeps "now"', () => {
    const later = readMs + 5 * CALL_NOW_FIRST_DAY_MS;
    expect(callNowIsDated('not a date', later)).toBe(false);
    expect(callNowIsDated(undefined, later)).toBe(false);
    expect(callNowIsDated(null, later)).toBe(false);
    expect(callNowIsDated(READ, readMs - CALL_NOW_FIRST_DAY_MS * 3)).toBe(false);
    expect(callNowIsDated(READ, Number.NaN)).toBe(false);
  });
});

describe('the dated words quote the map and keep the ask', () => {
  it('the label is the map’s own call, with its day', () => {
    expect(CALL_NOW_ASK).toBe(TIER_WORDS.call_now.label.toLowerCase());
    expect(datedCallNowLabel('Oct 3')).toBe('On Oct 3, the read said: call your vet now');
  });

  it('the record card keeps "now" in its first day and dates it after, still sending the owner to a vet', () => {
    expect(recordDatedCallNow(READ, readMs + CALL_NOW_FIRST_DAY_MS - 1)).toBeNull();
    const dated = recordDatedCallNow(READ, readMs + CALL_NOW_FIRST_DAY_MS)!;
    expect(dated.label).toMatch(/^On [A-Z][a-z]{2} \d{1,2}, the read said: call your vet now$/);
    expect(dated.action).toBe(DATED_CALL_NOW_ACTION);
    expect(dated.action).toMatch(/call yours now/);
    expect(dated.action).toMatch(/emergency clinic/);
    expect(dated.action).not.toMatch(/!/);
  });

  it('the record dates by the local day of the read', () => {
    const d = new Date(READ);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    expect(recordDatedCallNow(READ, readMs + 2 * CALL_NOW_FIRST_DAY_MS)!.label).toBe(
      `On ${months[d.getMonth()]} ${d.getDate()}, the read said: call your vet now`,
    );
  });
});
