// The skewed-clock run is skewed, and the ordinary run is not (CUL-832).
//
// The scheduled `Clock skew` workflow runs the whole suite under jest.clockSkew.js with
// CLOCK_SKEW_DAYS set. If the shim ever stopped loading (a config rename, a jest upgrade
// that stops merging a preset's setupFiles), every suite would run on the real clock and
// the job would go green over nothing: the failure a guard's non-vacuity floor exists for
// (C-36). So this compares the skew the run ASKED for (the environment, never anything
// the shim sets) with the skew it GOT: the clock the code reads, measured against one the
// shim cannot touch, the process's real start time plus its monotonic uptime from Node's
// own perf_hooks (the test environment's global `performance` is React Native's, which
// has no timeOrigin).

import { performance as nodePerformance } from 'perf_hooks';

const DAY_MS = 86_400_000;

function skewDaysOf(nowMs: number): number {
  const realNow = nodePerformance.timeOrigin + nodePerformance.now();
  // `|| 0` folds the -0 that rounding a hair below zero returns, which toBe(0) rejects.
  return Math.round((nowMs - realNow) / DAY_MS) || 0;
}

describe('the clock-skew shim', () => {
  it('moves both readings of "now" by exactly the days the run asked for, and never otherwise', () => {
    const asked = process.env.CLOCK_SKEW_DAYS === undefined ? 0 : Number(process.env.CLOCK_SKEW_DAYS);
    expect(skewDaysOf(Date.now())).toBe(asked);
    expect(skewDaysOf(new Date().getTime())).toBe(asked);
  });

  it('a bare Date() call still returns the time as a string, on the same clock', () => {
    // A class-based shim threw here: a class can never be called without `new`.
    const bare = Date();
    expect(typeof bare).toBe('string');
    expect(Math.abs(Date.parse(bare) - Date.now())).toBeLessThan(2_000);
  });

  it('a jest.spyOn(Date, "now") mock takes effect and restores', () => {
    // Suites mock the clock this way. A shim answering `now` from a Proxy trap hid the
    // spy, so the suite never reached its mockRestore and the next test inherited it.
    const spy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    expect(Date.now()).toBe(1_000);
    spy.mockRestore();
    expect(Date.now()).not.toBe(1_000);
  });

  it('a subclass of Date still constructs its own instances', () => {
    class Stamp extends Date {}
    const stamp = new Stamp();
    expect(stamp).toBeInstanceOf(Stamp);
    expect(stamp).toBeInstanceOf(Date);
  });

  it('leaves an explicit instant where it was written', () => {
    // The whole point: a fixture's literal date must not move with the clock.
    expect(new Date('2026-07-25T00:00:00.000Z').toISOString()).toBe('2026-07-25T00:00:00.000Z');
    expect(new Date(2026, 6, 25).getFullYear()).toBe(2026);
  });
});
