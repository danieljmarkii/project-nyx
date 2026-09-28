// CUL-1086 — the free-fed intake predicate, at its edges. Every case is one an adversarial pass
// broke an earlier rule with: round 1 (by food), round 2 (the local DATE read as a UTC day),
// round 3 (an uncertain window split by rating). With `ended_at` (migration 076, CUL-1396) a bowl
// is down from one instant to another; where an instant is missing the rating counts.

import { isFreeFedIntakeMeal, parseFreeFedIntakeSpans, type FreeFedIntakeArrangement } from './freeFedIntake';

const K = 'kibble';
const at = (iso: string) => Date.parse(iso);
type Row = Omit<FreeFedIntakeArrangement, 'foodItemId'>;
const spansOf = (...rows: Row[]) => parseFreeFedIntakeSpans(rows.map((r) => ({ foodItemId: K, ...r })));
const bowl = (iso: string, spans: ReturnType<typeof spansOf>) => isFreeFedIntakeMeal(K, at(iso), spans);

describe('isFreeFedIntakeMeal (CUL-1086, by instant)', () => {
  it('a rating before the toggle-on counts: the refused food left down afterwards', () => {
    const s = spansOf({ createdAt: '2026-07-10T14:00:00Z', activeFrom: '2026-07-10', activeUntil: null, endedAt: null });
    expect(bowl('2026-07-10T08:00:00Z', s)).toBe(false);
    expect(bowl('2026-07-10T14:00:00Z', s)).toBe(true); // the opening instant is the bowl's
    expect(bowl('2026-07-10T14:30:00Z', s)).toBe(true);
  });

  it('take-up day: ratings after the toggle-off count, in any zone (round 2, probes 1–2)', () => {
    // Up at 07:00Z so the owner can watch her meals; the local date is whatever it is.
    const s = spansOf({ createdAt: '2026-07-01T09:00:00Z', activeFrom: '2026-07-01', activeUntil: '2026-07-10', endedAt: '2026-07-10T07:00:00Z' });
    expect(bowl('2026-07-10T06:59:59Z', s)).toBe(true);
    expect(bowl('2026-07-10T07:00:00Z', s)).toBe(false); // the closing instant is the owner's
    expect(bowl('2026-07-10T08:00:00Z', s)).toBe(false);
    // Los Angeles: a bowl rating at 19:00 local on the take-up date, before a 20:00 take-up.
    const la = spansOf({ createdAt: '2026-06-20T00:00:00Z', activeFrom: '2026-06-20', activeUntil: '2026-07-10', endedAt: '2026-07-11T03:00:00Z' });
    expect(bowl('2026-07-11T02:00:00Z', la)).toBe(true);
    expect(bowl('2026-07-11T03:30:00Z', la)).toBe(false);
  });

  it('a mis-tap on and off exposes only the minutes between, and nothing before or after', () => {
    const s = spansOf({ createdAt: '2026-07-10T08:00:00Z', activeFrom: '2026-07-10', activeUntil: '2026-07-10', endedAt: '2026-07-10T08:05:00Z' });
    expect(bowl('2026-07-10T08:02:00Z', s)).toBe(true);
    expect(bowl('2026-07-10T12:00:00Z', s)).toBe(false);
    expect(bowl('2026-07-10T07:00:00Z', s)).toBe(false);
  });

  it('toggled off and on again: the gap between the rows is watched', () => {
    const s = spansOf(
      { createdAt: '2026-07-01T09:00:00Z', activeFrom: '2026-07-01', activeUntil: '2026-07-10', endedAt: '2026-07-10T07:00:00Z' },
      { createdAt: '2026-07-10T15:00:00Z', activeFrom: '2026-07-10', activeUntil: null, endedAt: null },
    );
    expect(bowl('2026-07-10T12:00:00Z', s)).toBe(false);
    expect(bowl('2026-07-10T16:00:00Z', s)).toBe(true);
  });

  it('a row ended before migration 076 (no ended_at) is a bowl only until its date could begin', () => {
    // UTC+14 is the earliest a local date begins: from then on every rating counts.
    const s = spansOf({ createdAt: '2026-07-01T09:00:00Z', activeFrom: '2026-07-01', activeUntil: '2026-07-10', endedAt: null });
    expect(bowl('2026-07-09T09:59:00Z', s)).toBe(true);
    expect(bowl('2026-07-09T10:00:00Z', s)).toBe(false);
    expect(bowl('2026-07-10T08:00:00Z', s)).toBe(false);
  });

  it('ended_at on a row with no active_until is ignored: the re-opened row is the truth', () => {
    // rls-privacy-reviewer (076): a stale old-build push can re-open a row another device ended.
    const s = spansOf({ createdAt: '2026-07-01T09:00:00Z', activeFrom: '2026-07-01', activeUntil: null, endedAt: '2026-07-05T09:00:00Z' });
    expect(bowl('2026-07-08T09:00:00Z', s)).toBe(true);
  });

  it('with no created_at, the bowl opens only once its local date has ended everywhere', () => {
    const s = spansOf({ createdAt: null, activeFrom: '2026-07-05', activeUntil: null, endedAt: null });
    expect(bowl('2026-07-05T12:00:00Z', s)).toBe(false);
    expect(bowl('2026-07-06T11:59:00Z', s)).toBe(false);
    expect(bowl('2026-07-06T12:00:00Z', s)).toBe(true);
  });

  it('never matches a null food, another food, a non-finite instant, or a row with no food', () => {
    const s = spansOf({ createdAt: '2026-07-01T00:00:00Z', activeFrom: '2026-07-01', activeUntil: null, endedAt: null });
    expect(isFreeFedIntakeMeal(null, at('2026-07-05T00:00:00Z'), s)).toBe(false);
    expect(isFreeFedIntakeMeal('wet', at('2026-07-05T00:00:00Z'), s)).toBe(false);
    expect(isFreeFedIntakeMeal(K, NaN, s)).toBe(false);
    expect(
      parseFreeFedIntakeSpans([{ foodItemId: null, createdAt: '2026-07-01T00:00:00Z', activeFrom: null, activeUntil: null, endedAt: null }]),
    ).toEqual([]);
  });
});
