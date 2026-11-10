// The overrun phrase (CUL-1181): one wording for a trial past its window, held to
// the Home strip's own output so the Foods tab cannot drift from the card while the
// card still builds its header inline.
//
// Same edge stub as lib/dietTrialCard.test.ts: `lib/analytics` pulls the sync graph.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

import { resolveTrialStrip, type TrialCardInput } from './dietTrialCard';
import { getDietTrialProgress } from './analytics';
import { trialDayClause, trialOverrunDays } from './trialOverrun';

function localNoon(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

describe('trialDayClause', () => {
  it('counts toward the target inside the window, the target day included', () => {
    expect(trialDayClause(12, 28)).toBe('day 12 of 28');
    expect(trialDayClause(28, 28)).toBe('day 28 of 28');
  });

  it('says how far past the window, never "day 35 of 28"', () => {
    expect(trialDayClause(35, 28)).toBe('day 35 — 7 days past');
    expect(trialDayClause(29, 28)).toBe('day 29 — 1 day past');
    expect(trialDayClause(35, 28)).not.toMatch(/of 28/);
  });

  it('drops the target when there is none to count toward', () => {
    expect(trialDayClause(12, 0)).toBe('day 12');
    expect(trialOverrunDays(40, 0)).toBe(0);
  });
});

// The parity the build note asks for: on every day from inside the window to well
// past it, the Home strip's header ends with exactly this clause. Driven through
// the real resolver (C-34), not a re-derivation of its rule.
describe('parity with the Home trial strip', () => {
  const trial = {
    status: 'active' as const,
    startedAt: '2026-07-01',
    targetDurationDays: 28,
    foodLabel: 'Zignature Kangaroo Formula',
  };
  const input = (nowMs: number): TrialCardInput => ({
    trial,
    nowMs,
    petName: 'Biscuit',
    species: 'dog',
    coverage: { daysLogged: 10, daysElapsed: 12 },
    exposures: { mayStateRecordClean: true, mayImplyRecordClean: true, totalFeedings: 30, offDiet: 0 },
  });

  it.each([
    ['inside the window', localNoon(2026, 7, 12)],
    ['the target day', localNoon(2026, 7, 28)],
    ['one day past', localNoon(2026, 7, 29)],
    ['day 35 of a 28-day trial', localNoon(2026, 8, 4)],
  ])('%s', (_label, nowMs) => {
    const progress = getDietTrialProgress(
      { startedAt: trial.startedAt, targetDurationDays: trial.targetDurationDays },
      nowMs,
    )!;
    const header = resolveTrialStrip(input(nowMs))!.header;
    expect(header).toBe(`Diet trial · ${trialDayClause(progress.dayCounter, progress.targetDays)}`);
  });

  it('reads like the card on day 35 of 28', () => {
    expect(resolveTrialStrip(input(localNoon(2026, 8, 4)))!.header).toBe(
      'Diet trial · day 35 — 7 days past',
    );
  });
});
