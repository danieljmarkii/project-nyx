// CUL-1086 — the free-fed intake predicate, at its edges. Every case here is one the adversarial
// passes broke an earlier rule with (round 1: by food; round 2: the local DATE read as a UTC
// day). The uncertain interval around a bowl's take-up is split by the n=1 asymmetry: a rating
// of concern counts, anything else is set aside.

import { isFreeFedIntakeMeal, parseFreeFedIntakeSpans, type FreeFedIntakeArrangement } from './freeFedIntake';

const K = 'kibble';
const at = (iso: string) => Date.parse(iso);
const spansOf = (...rows: Omit<FreeFedIntakeArrangement, 'foodItemId'>[]) =>
  parseFreeFedIntakeSpans(rows.map((r) => ({ foodItemId: K, ...r })));
const bowl = (iso: string, rating: string | null, spans: ReturnType<typeof spansOf>) =>
  isFreeFedIntakeMeal(K, at(iso), rating, spans);

describe('isFreeFedIntakeMeal (CUL-1086, by date)', () => {
  it('counts a rating logged before the row was written: the refused food left down afterwards', () => {
    const s = spansOf({ createdAt: '2026-07-10T14:00:00Z', activeFrom: '2026-07-10', activeUntil: null });
    expect(bowl('2026-07-10T08:00:00Z', 'refused', s)).toBe(false);
    expect(bowl('2026-07-10T08:00:00Z', 'all', s)).toBe(false);
    expect(bowl('2026-07-10T14:30:00Z', 'all', s)).toBe(true);
    expect(bowl('2026-07-10T14:30:00Z', 'refused', s)).toBe(true); // certain bowl time: not observed
  });

  it('take-up day, UTC: refusals the owner watched count; an "ate it all" is set aside', () => {
    // Round 2 probe 1: the bowl comes up at 07:00Z so the owner can watch her meals.
    const s = spansOf({ createdAt: '2026-07-01T09:00:00Z', activeFrom: '2026-07-01', activeUntil: '2026-07-10' });
    expect(bowl('2026-07-10T08:00:00Z', 'refused', s)).toBe(false);
    expect(bowl('2026-07-10T18:00:00Z', 'picked', s)).toBe(false);
    expect(bowl('2026-07-10T18:00:00Z', 'all', s)).toBe(true);
    expect(bowl('2026-07-10T18:00:00Z', 'some', s)).toBe(true);
    // Before the date could have begun anywhere (UTC+14): certainly the bowl.
    expect(bowl('2026-07-09T09:00:00Z', 'refused', s)).toBe(true);
    // After it has ended everywhere (UTC−12): certainly watched.
    expect(bowl('2026-07-11T12:00:00Z', 'all', s)).toBe(false);
  });

  it('take-up day, Sydney (UTC+10): the next local morning\'s refusal counts', () => {
    // Round 2 probe 1: up Mon 07:00 local (Sun 21:00Z), active_until = Mon. Refusals at Mon
    // 08:00, Mon 18:00 and Tue 08:00 local.
    const s = spansOf({ createdAt: '2026-06-20T00:00:00Z', activeFrom: '2026-06-20', activeUntil: '2026-07-06' });
    expect(bowl('2026-07-05T22:00:00Z', 'refused', s)).toBe(false);
    expect(bowl('2026-07-06T08:00:00Z', 'refused', s)).toBe(false);
    expect(bowl('2026-07-06T22:00:00Z', 'refused', s)).toBe(false);
  });

  it('take-up evening, Los Angeles (UTC−7): the bowl\'s late "ate it all" never counts as watched', () => {
    // Round 2 probe 2: bowl rated "all" at 19:00 local on the take-up date (02:00Z the next day).
    const s = spansOf({ createdAt: '2026-06-20T00:00:00Z', activeFrom: '2026-06-20', activeUntil: '2026-07-10' });
    expect(bowl('2026-07-11T02:00:00Z', 'all', s)).toBe(true);
  });

  it('a mis-tap (on, then off five minutes later) can only ever withhold reassurance', () => {
    const s = spansOf({ createdAt: '2026-07-10T08:00:00Z', activeFrom: '2026-07-10', activeUntil: '2026-07-10' });
    expect(s[0].bowlUntilMs).toBe(s[0].bowlFromMs); // no certain bowl time at all
    expect(bowl('2026-07-10T12:00:00Z', 'refused', s)).toBe(false);
    expect(bowl('2026-07-10T12:00:00Z', 'all', s)).toBe(true);
    expect(bowl('2026-07-10T07:00:00Z', 'all', s)).toBe(false); // before the row: watched
  });

  it('toggled off and on again in one day: the gap between the rows is uncertain, not bowl', () => {
    const s = spansOf(
      { createdAt: '2026-07-01T09:00:00Z', activeFrom: '2026-07-01', activeUntil: '2026-07-10' },
      { createdAt: '2026-07-10T15:00:00Z', activeFrom: '2026-07-10', activeUntil: null },
    );
    expect(bowl('2026-07-10T12:00:00Z', 'refused', s)).toBe(false);
    expect(bowl('2026-07-10T12:00:00Z', 'all', s)).toBe(true);
    expect(bowl('2026-07-10T16:00:00Z', 'refused', s)).toBe(true); // the second bowl is certainly down
  });

  it('with no created_at, the opening date is uncertain the same way', () => {
    const s = spansOf({ createdAt: null, activeFrom: '2026-07-05', activeUntil: null });
    expect(bowl('2026-07-05T12:00:00Z', 'refused', s)).toBe(false);
    expect(bowl('2026-07-05T12:00:00Z', 'all', s)).toBe(true);
    expect(bowl('2026-07-04T09:00:00Z', 'all', s)).toBe(false); // before the date anywhere
    expect(bowl('2026-07-07T00:00:00Z', 'refused', s)).toBe(true); // certainly down by now
  });

  it('never matches a null food, another food, a non-finite instant, or a row with no food', () => {
    const s = spansOf({ createdAt: '2026-07-01T00:00:00Z', activeFrom: '2026-07-01', activeUntil: null });
    expect(isFreeFedIntakeMeal(null, at('2026-07-05T00:00:00Z'), 'all', s)).toBe(false);
    expect(isFreeFedIntakeMeal('wet', at('2026-07-05T00:00:00Z'), 'all', s)).toBe(false);
    expect(isFreeFedIntakeMeal(K, NaN, 'all', s)).toBe(false);
    expect(parseFreeFedIntakeSpans([{ foodItemId: null, createdAt: '2026-07-01T00:00:00Z', activeFrom: null, activeUntil: null }])).toEqual([]);
  });
});
