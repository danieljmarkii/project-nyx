import {
  computeTrialResponseCounts,
  TRIAL_RESPONSE_COUNTS_DEFAULTS,
  type TrialResponseCountsInput,
} from './trialResponseCounts';

// The standing-line counts predicate (CUL-13). Tests pin the windowing/collapse to
// `detectTrialResponse`'s (the §5.3 one-record-one-answer discipline — a full parity test against the
// live detector rides the generate-signal deno suite). TZ-honest per B-514: the helper TAKES a
// `timeZone`, so fixtures pass an explicit one and build instants from UTC components under
// `timeZone: 'UTC'` (local day === UTC day → assertions are clock-independent), with a non-UTC
// boundary case to exercise the offset.

const H = 3_600_000;
const D = 86_400_000;
/** Instant (ms) for a UTC calendar moment — used with `timeZone: 'UTC'` so local day === UTC day. */
const at = (y: number, m: number, d: number, h = 12): number => Date.UTC(y, m - 1, d, h);

/** A trial starting 2026-06-01 (stored day key), "now" = 2026-06-20 noon UTC ⇒ day 20 of the trial. */
function base(over: Partial<TrialResponseCountsInput> = {}): TrialResponseCountsInput {
  return {
    vomitOnsetsMs: [],
    loggedEventMs: [],
    trialStartedAt: '2026-06-01',
    nowMs: at(2026, 6, 20),
    timeZone: 'UTC',
    ...over,
  };
}

describe('computeTrialResponseCounts — windowing', () => {
  it('places vomit episodes into the trial era and the 49-day baseline by onset day', () => {
    const r = computeTrialResponseCounts(
      base({
        vomitOnsetsMs: [
          at(2026, 6, 5), // trial
          at(2026, 6, 10), // trial
          at(2026, 6, 18), // trial
          at(2026, 5, 20), // baseline (May 20)
          at(2026, 4, 20), // baseline (Apr 20, still ≥ Apr 13)
        ],
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.trialCount).toBe(3);
    expect(r!.baselineCount).toBe(2);
    expect(r!.trialDayNumber).toBe(20);
    expect(r!.baselineWindowDays).toBe(49);
  });

  it('excludes events before the baseline window and after now', () => {
    const r = computeTrialResponseCounts(
      base({
        vomitOnsetsMs: [
          at(2026, 4, 1), // before baseline start (Apr 13) → excluded
          at(2026, 6, 25), // after now (Jun 20) → excluded
          at(2026, 6, 15), // trial
        ],
      }),
    );
    expect(r!.trialCount).toBe(1);
    expect(r!.baselineCount).toBe(0);
  });

  it('counts the start day itself as day 1 / trial era (§5.1 inclusive lower bound)', () => {
    const r = computeTrialResponseCounts(base({ vomitOnsetsMs: [at(2026, 6, 1, 8)] }));
    expect(r!.trialCount).toBe(1);
    expect(r!.baselineCount).toBe(0);
  });
});

describe('computeTrialResponseCounts — 3h re-log collapse (collapse-then-window)', () => {
  it('collapses a re-logged bout into one episode', () => {
    const r = computeTrialResponseCounts(
      base({
        vomitOnsetsMs: [at(2026, 6, 10, 8), at(2026, 6, 10, 8) + H, at(2026, 6, 10, 8) + 2 * H],
      }),
    );
    expect(r!.trialCount).toBe(1); // three logs within 3h = one episode
  });

  it('keeps episodes more than 3h apart separate', () => {
    const r = computeTrialResponseCounts(
      base({ vomitOnsetsMs: [at(2026, 6, 10, 2), at(2026, 6, 10, 2) + 4 * H] }),
    );
    expect(r!.trialCount).toBe(2);
  });

  it('collapses a boundary-straddling bout to ONE episode dated by its onset (baseline), not both windows', () => {
    // 23:00 May 31 UTC + 01:00 Jun 1 UTC are 2h apart → one episode, onset May 31 → baseline.
    const onset = at(2026, 5, 31, 23);
    const r = computeTrialResponseCounts(base({ vomitOnsetsMs: [onset, onset + 2 * H] }));
    expect(r!.baselineCount).toBe(1);
    expect(r!.trialCount).toBe(0); // NOT 1-and-1 (that would be window-then-collapse)
  });
});

describe('computeTrialResponseCounts — logged days', () => {
  it('counts distinct logged local days per window', () => {
    const r = computeTrialResponseCounts(
      base({
        loggedEventMs: [
          at(2026, 6, 2, 8), at(2026, 6, 2, 20), // same trial day (twice) → 1
          at(2026, 6, 3), // trial day → 1
          at(2026, 5, 10), at(2026, 5, 11), // two baseline days
        ],
      }),
    );
    expect(r!.trialLoggedDays).toBe(2);
    expect(r!.baselineLoggedDays).toBe(2);
  });
});

describe('computeTrialResponseCounts — degenerate inputs', () => {
  it('returns null for an unparseable start', () => {
    expect(computeTrialResponseCounts(base({ trialStartedAt: 'not-a-date' }))).toBeNull();
  });

  it('returns null for a non-finite now', () => {
    expect(computeTrialResponseCounts(base({ nowMs: NaN }))).toBeNull();
  });

  it('drops non-finite onsets rather than throwing', () => {
    const r = computeTrialResponseCounts(base({ vomitOnsetsMs: [NaN, at(2026, 6, 10)] }));
    expect(r!.trialCount).toBe(1);
  });

  it('is all-zero for an empty record (never null when the trial can be placed)', () => {
    const r = computeTrialResponseCounts(base());
    expect(r).toEqual({
      trialDayNumber: 20,
      trialCount: 0,
      baselineCount: 0,
      trialLoggedDays: 0,
      baselineLoggedDays: 0,
      baselineWindowDays: 49,
      densityComparable: true, // no logging either window → nothing to compare → comparable (vacuous)
    });
  });
});

describe('computeTrialResponseCounts — densityComparable (the never-reassure guard)', () => {
  // Comparable when the two windows' logging FRACTIONS are within 0.7 of each other; NOT when one
  // window was logged far more intensely. Fractions = logged days ÷ window span (trial span = day
  // number; baseline span = 49). Meal events on every day keep the fraction high; symptom-only sparse
  // logging drops it.
  const mealsEvery = (fromD: number, toD: number, tz = 'UTC'): number[] => {
    const out: number[] = [];
    for (let d = fromD; d <= toD; d++) out.push(at(2026, 6, 1) + (d - 1) * D); // one per trial day
    return out;
  };
  it('flags a densely-logged trial against a sparsely-logged baseline as NOT comparable', () => {
    // Trial: a logged event every one of the 20 trial days → fraction ~1.0. Baseline: only 8 logged
    // days over 49 → fraction ~0.16. 0.16 < 0.7 × 1.0 → not comparable.
    const trialDaily = mealsEvery(1, 20);
    const baselineSparse = [
      at(2026, 5, 20), at(2026, 5, 18), at(2026, 5, 16), at(2026, 5, 14),
      at(2026, 5, 12), at(2026, 5, 10), at(2026, 5, 8), at(2026, 5, 6),
    ];
    const r = computeTrialResponseCounts(base({ loggedEventMs: [...trialDaily, ...baselineSparse] }));
    expect(r!.trialLoggedDays).toBe(20);
    expect(r!.baselineLoggedDays).toBe(8);
    expect(r!.densityComparable).toBe(false);
  });
  it('flags two comparably-logged windows as comparable', () => {
    // Both windows logged on ~every day → fractions ~1.0 and ~0.6 (49-day baseline all logged is 1.0).
    const trialDaily = mealsEvery(1, 20);
    const baselineDaily: number[] = [];
    for (let d = 1; d <= 49; d++) baselineDaily.push(at(2026, 6, 1) - d * D);
    const r = computeTrialResponseCounts(base({ loggedEventMs: [...trialDaily, ...baselineDaily] }));
    expect(r!.densityComparable).toBe(true);
  });
});

describe('computeTrialResponseCounts — timezone (B-514/B-517)', () => {
  it('places a boundary-morning event by the OWNER local day, not UTC', () => {
    // 2026-06-01 08:00 in Auckland (UTC+12) is 2026-05-31 20:00 UTC. Under the owner's clock it is
    // trial day 1; a UTC read would misfile it into the baseline. The helper takes the zone, so it
    // must place it in the trial era.
    const auckMorningUtc = Date.UTC(2026, 4, 31, 20); // 8am Jun 1 in Auckland
    const r = computeTrialResponseCounts({
      vomitOnsetsMs: [auckMorningUtc],
      loggedEventMs: [],
      trialStartedAt: '2026-06-01',
      nowMs: Date.UTC(2026, 5, 20, 20),
      timeZone: 'Pacific/Auckland',
    });
    expect(r!.trialCount).toBe(1);
    expect(r!.baselineCount).toBe(0);
  });
});

describe('computeTrialResponseCounts — properties', () => {
  it('is deterministic and order-independent', () => {
    const onsets = [at(2026, 6, 5), at(2026, 5, 20), at(2026, 6, 18), at(2026, 4, 20)];
    const a = computeTrialResponseCounts(base({ vomitOnsetsMs: onsets }));
    const b = computeTrialResponseCounts(base({ vomitOnsetsMs: [...onsets].reverse() }));
    expect(a).toEqual(b);
  });

  it('adding an in-trial episode never decreases the trial count (monotone)', () => {
    const before = computeTrialResponseCounts(base({ vomitOnsetsMs: [at(2026, 6, 5)] }))!.trialCount;
    const after = computeTrialResponseCounts(
      base({ vomitOnsetsMs: [at(2026, 6, 5), at(2026, 6, 12)] }),
    )!.trialCount;
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBe(2);
  });

  it('exposes the shipped default constants', () => {
    expect(TRIAL_RESPONSE_COUNTS_DEFAULTS).toEqual({
      baselineDays: 49,
      minLoggingDaysPerWindow: 7,
      episodeGapHours: 3,
      densityComparableMinRatio: 0.7,
    });
  });
});
