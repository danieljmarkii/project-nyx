// Signals v2 watching system (B-755 / CUL-14) — the pure gating + predicates + the G8
// copy round. Spec §4.4 / D5 / G8. The DB read layer (getWatchingRows) is a thin wrapper
// over these pure functions + the shared patternsTiming reads; it's exercised through the
// SignalZone render tests (hook mocked). Here we pin: the verbatim mock §05 strings, the
// G8 register sweep (no imperative / streak / reward / promise / exclamation), the per-lane
// gates, and the escalate-only gap detector (the clinically-adjacent piece).

import {
  WATCHING_SUB,
  watchingTimingRow,
  watchingChangeRow,
  watchingGapRow,
  watchingGapRowFromHours,
  formatWatchingGapSequence,
  BUILDING_FLOOR,
} from './signalCopy';
import {
  buildWatchingRows,
  windowedTimedEligibleCount,
  detectWatchingGapShortening,
  daysSinceLastVomitEpisode,
  WATCHING_TIMING_NEED,
  WATCHING_TIMING_QUIET_DAYS,
  type WatchingRow,
  type WatchingFacts,
} from './signalWatching';
import type { FeedingInput, FreeFedSpan, OnsetConfidence } from './mealTiming';

const HOUR = 3_600_000;
const DAY = 86_400_000;
// A fixed "now" — these functions ask DURATION questions (ms since a meal / between
// episodes / since now), never a local-day question, so a UTC-anchored instant is stable
// across runner zones (B-514: the local-day inputs — dayNumber — are integers passed in).
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0);

// ── The G8 register screens (mirrors of the server's, plus the watching-specific bars) ──
const REASSURANCE_RE =
  /\b(fine|okay|ok|healthy|all clear|nothing to worry|nothing serious|probably fine|no concern|don't worry|doing great|doing well|all good|on the mend|thriving|much better|back to normal)\b/i;
// Transparency, never solicitation (§4.4): no imperative asking for more data.
const SOLICITATION_RE =
  /\b(log more|add more|please log|keep logging|start logging|record more|log your|you should log|log another)\b/i;
// No streak / unlock / reward language, no game framing (§4.4 / the R-5 optnote).
const GAME_RE =
  /\b(streak|unlock|unlocked|reward|badge|points?|level up|achievement|milestone|earn|progress bar|keep it up)\b/i;
// Never a promise that a card is coming (§4.4) — "what a pattern needs" is a fact about
// the math, explicitly permitted, so we bar the promise phrasings, not the word "needs".
const PROMISE_RE =
  /\b(a card is coming|card is on its way|we'?ll show you a card|you'?ll (?:unlock|get) a|coming soon|check back|almost there)\b/i;

function sweep(s: string): void {
  expect(s).not.toMatch(/!/); // nyx-voice — no exclamation
  expect(s).not.toMatch(REASSURANCE_RE);
  expect(s).not.toMatch(SOLICITATION_RE);
  expect(s).not.toMatch(GAME_RE);
  expect(s).not.toMatch(PROMISE_RE);
}

describe('watching copy — verbatim mock §05 strings (the R2-7 Designer round)', () => {
  it('the sub line is verbatim', () => {
    expect(WATCHING_SUB).toBe("Here's what we're watching, and what each pattern still needs:");
  });
  it('the timing row is verbatim, count-anchored, jargon-free (B-768 D2a — the mechanism clause replaces "timed episodes")', () => {
    expect(watchingTimingRow(4, 6)).toBe(
      "Timing — 4 of the 6 episodes a pattern needs, timed against meals you've logged.",
    );
  });
  it('the change row is verbatim, naming the current week', () => {
    expect(watchingChangeRow(2, 2)).toBe(
      'Change, week to week — needs 2 full weeks of logging to compare. This is week 2.',
    );
  });
  it('the gap row leads with the direction cue (B-769 D4), then the plain time-ordered sequence', () => {
    expect(watchingGapRow('vomiting', '6 days, then 3, then 2')).toBe(
      'Gaps between vomiting episodes are getting shorter — 6 days, then 3, then 2.',
    );
  });
  it('the gap row cue is descriptive change, never a verdict (Change Contract v1.1)', () => {
    const s = watchingGapRow('vomiting', '6 days, then 3, then 2');
    expect(s).not.toMatch(/worse|worsening|serious|urgent|escalat/i); // no verdict words
    expect(s).not.toMatch(/[↑↓%]/); // no arrows, no percentages
  });

  // Adversarial ② (GA Phase 0): day-rounding can collapse a strictly-decreasing run to
  // equal printed values — the cue must never sit beside numbers that deny it.
  describe('watchingGapRowFromHours — the run-aware render', () => {
    it('a legibly-decreasing run keeps the default units + the cue', () => {
      expect(watchingGapRowFromHours('vomiting', [6 * 24, 3 * 24, 2 * 24])).toBe(
        'Gaps between vomiting episodes are getting shorter — 6 days, then 3, then 2.',
      );
    });
    it('the bimodal flatten ("1 day, then 1, then 1") re-renders in hours, where the decrease shows', () => {
      // 30h → 26h → 25h all round to "1 day"; the counterexample record that passes all
      // three detector gates against a monthly-gap median.
      expect(watchingGapRowFromHours('vomiting', [30, 26, 25])).toBe(
        'Gaps between vomiting episodes are getting shorter — 30 hours, then 26, then 25.',
      );
    });
    it('a sub-hour shortening no unit can print degrades to the neutral phrasing — never a cue the numbers deny, never a dropped row', () => {
      // 10.4h → 10.2h → 10.1h: strictly decreasing raw, but hours print 10, 10, 10.
      expect(watchingGapRowFromHours('vomiting', [10.4, 10.2, 10.1])).toBe(
        'Gaps between vomiting episodes — 10 hours, then 10, then 10.',
      );
    });
    it('a mixed-unit run whose tail flattens even in hours degrades to the neutral phrasing', () => {
      // Tail 10.4h/10.2h prints 10, 10 in every unit — no cue, default-unit sequence.
      expect(watchingGapRowFromHours('vomiting', [30, 10.4, 10.2])).toBe(
        'Gaps between vomiting episodes — 1 day, then 10 hours, then 10 hours.',
      );
    });
  });
  it('the safety-floor line is the verbatim, unconditional BUILDING_FLOOR', () => {
    expect(BUILDING_FLOOR).toBe("If something needs attention sooner, it won't wait for the week.");
  });
});

describe('watching copy — the G8 register sweep (transparency, never solicitation)', () => {
  const strings = [
    WATCHING_SUB,
    watchingTimingRow(1, 6),
    watchingTimingRow(5, 6),
    watchingChangeRow(1, 2),
    watchingChangeRow(2, 2),
    watchingGapRow('vomiting', '6 days, then 3, then 2'),
    watchingGapRow('vomiting', '3 days, then 18 hours, then 9 hours'),
    BUILDING_FLOOR,
  ];
  it('every watching string is clean (no exclamation / reassurance / solicitation / game / promise)', () => {
    for (const s of strings) sweep(s);
  });
});

describe('formatWatchingGapSequence — mirrors the server phrasing.ts formatter', () => {
  it('states the unit once when the run is uniform ("6 days, then 3, then 2")', () => {
    expect(formatWatchingGapSequence([6 * 24, 3 * 24, 2 * 24])).toBe('6 days, then 3, then 2');
  });
  it('states each unit when the run crosses the day/hour boundary', () => {
    expect(formatWatchingGapSequence([3 * 24, 18, 9])).toBe('3 days, then 18 hours, then 9 hours');
  });
  it('pluralizes the head honestly and states the unit once when uniform', () => {
    expect(formatWatchingGapSequence([24, 48])).toBe('1 day, then 2'); // singular head "1 day", unit once
  });
  it('names each unit (singular where 1) when the run crosses the day/hour boundary', () => {
    expect(formatWatchingGapSequence([48, 1])).toBe('2 days, then 1 hour');
  });
  it('rounds once with a 1-hour floor — a sub-hour gap never reads "0 hours"', () => {
    expect(formatWatchingGapSequence([0.4])).toBe('1 hour'); // max(1, round(0.4)) = 1
  });
  it('a single gap renders on its own', () => {
    expect(formatWatchingGapSequence([48])).toBe('2 days');
    expect(formatWatchingGapSequence([])).toBe('');
  });
});

describe('buildWatchingRows — the per-lane gates + the mock order', () => {
  // daysSinceLastEpisode 2 — a LIVE record, so the quiet gate (D1a) is inert in the
  // pre-existing cases; the quiet gate has its own describe below.
  const base: WatchingFacts = {
    timedEligibleCount: 0,
    dayNumber: 30,
    gapSequenceHours: null,
    daysSinceLastEpisode: 2,
  };
  const rowKeys = (rows: WatchingRow[]) => rows.map((r) => r.key);

  describe('timing lane', () => {
    it('no row at 0 timeable episodes (no timing question to pose yet)', () => {
      expect(buildWatchingRows({ ...base, timedEligibleCount: 0 })).toEqual([]);
    });
    it('shows "N of 6" for 1..5 timeable episodes', () => {
      for (const n of [1, 3, 5]) {
        const rows = buildWatchingRows({ ...base, timedEligibleCount: n });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
          key: 'timing',
          text: `Timing — ${n} of the 6 episodes a pattern needs, timed against meals you've logged.`,
        });
      }
    });
    it('no row once the floor is met (≥6 — the lane can run, nothing "still needed")', () => {
      expect(buildWatchingRows({ ...base, timedEligibleCount: WATCHING_TIMING_NEED })).toEqual([]);
      expect(buildWatchingRows({ ...base, timedEligibleCount: 9 })).toEqual([]);
    });
  });

  // B-768, PM-ruled D1a (GA Phase 0): the counter only moves on new episodes, so over a
  // quiet pet it reads as an owed debt — it withdraws at 14 quiet days. Suppression only:
  // no "quieted"/"settled" reframe is ever rendered (no reassurance-on-absence).
  describe('timing lane — the quiet gate (D1a)', () => {
    it('suppresses the timing row once the last episode is ≥ 14 days back', () => {
      for (const quiet of [WATCHING_TIMING_QUIET_DAYS, 21, 59]) {
        expect(
          buildWatchingRows({ ...base, timedEligibleCount: 4, daysSinceLastEpisode: quiet }),
        ).toEqual([]);
      }
    });
    it('keeps the timing row while the record is live (last episode < 14 days back)', () => {
      for (const live of [0, 5, 13.9]) {
        const rows = buildWatchingRows({ ...base, timedEligibleCount: 4, daysSinceLastEpisode: live });
        expect(rowKeys(rows)).toEqual(['timing']);
      }
    });
    it('a null recency fails toward suppression (defensive — cannot occur with a positive count)', () => {
      expect(buildWatchingRows({ ...base, timedEligibleCount: 4, daysSinceLastEpisode: null })).toEqual([]);
    });
    it('the quiet gate touches ONLY the timing row — change and gap rows are unaffected', () => {
      const rows = buildWatchingRows({
        timedEligibleCount: 4,
        dayNumber: 12,
        gapSequenceHours: [6 * 24, 3 * 24, 2 * 24],
        daysSinceLastEpisode: 30,
      });
      // The gap row surviving here is theoretical (its own recency guard would normally
      // null the run first) — the point is the quiet gate itself never reaches past timing.
      expect(rowKeys(rows)).toEqual(['change', 'gap']);
    });
  });

  describe('change lane', () => {
    it('shows the current week while fewer than 2 full weeks have elapsed', () => {
      // day 1 & 7 → week 1; day 8 & 13 → week 2 (still fewer than 2 FULL weeks of span).
      for (const [day, week] of [[1, 1], [7, 1], [8, 2], [12, 2], [13, 2]] as const) {
        const rows = buildWatchingRows({ ...base, dayNumber: day });
        expect(rows).toEqual([
          { key: 'change', text: `Change, week to week — needs 2 full weeks of logging to compare. This is week ${week}.` },
        ]);
      }
    });
    it('no row once 2 full weeks exist (day ≥ 14)', () => {
      expect(buildWatchingRows({ ...base, dayNumber: 14 })).toEqual([]);
      expect(buildWatchingRows({ ...base, dayNumber: 90 })).toEqual([]);
    });
  });

  describe('gap lane', () => {
    it('no row when the detector returned null (no shortening / stale / too few)', () => {
      expect(buildWatchingRows({ ...base, gapSequenceHours: null })).toEqual([]);
    });
    it('renders the cue-led sequence when a shortening run is supplied', () => {
      const rows = buildWatchingRows({ ...base, gapSequenceHours: [6 * 24, 3 * 24, 2 * 24] });
      expect(rows).toEqual([
        { key: 'gap', text: 'Gaps between vomiting episodes are getting shorter — 6 days, then 3, then 2.' },
      ]);
    });
  });

  it('orders the rows timing → change → gap (the render layer splits gap out — B-769 D3a)', () => {
    const rows = buildWatchingRows({
      timedEligibleCount: 4,
      dayNumber: 12,
      gapSequenceHours: [6 * 24, 3 * 24, 2 * 24],
      daysSinceLastEpisode: 2,
    });
    expect(rowKeys(rows)).toEqual(['timing', 'change', 'gap']);
    // The exact frame, reproduced from real-shaped facts.
    expect(rows.map((r) => r.text)).toEqual([
      "Timing — 4 of the 6 episodes a pattern needs, timed against meals you've logged.",
      'Change, week to week — needs 2 full weeks of logging to compare. This is week 2.',
      'Gaps between vomiting episodes are getting shorter — 6 days, then 3, then 2.',
    ]);
  });

  it('returns [] when nothing qualifies (a mature, well-covered record with no shortening)', () => {
    expect(
      buildWatchingRows({ timedEligibleCount: 9, dayNumber: 60, gapSequenceHours: null, daysSinceLastEpisode: 2 }),
    ).toEqual([]);
  });
});

// ── daysSinceLastVomitEpisode — the quiet gate's recency input (D1a) ───────────────
describe('daysSinceLastVomitEpisode', () => {
  const w = (ms: number) => ({ ms, confidence: 'witnessed' as OnsetConfidence });
  it('returns days since the most recent event, on RAW events (uncollapsed — the honest, later timestamp)', () => {
    expect(daysSinceLastVomitEpisode([w(NOW - 5 * DAY), w(NOW - 2 * DAY)], NOW)).toBeCloseTo(2);
  });
  it('null for an empty record', () => {
    expect(daysSinceLastVomitEpisode([], NOW)).toBeNull();
  });
  it('ignores non-finite and future-dated entries', () => {
    expect(daysSinceLastVomitEpisode([w(NaN), w(NOW + DAY), w(NOW - 3 * DAY)], NOW)).toBeCloseTo(3);
    expect(daysSinceLastVomitEpisode([w(NaN), w(NOW + DAY)], NOW)).toBeNull();
  });
});

// ── windowedTimedEligibleCount — the honest "have" for the timing row ─────────────
describe('windowedTimedEligibleCount', () => {
  const witnessed = (ms: number): { ms: number; confidence: OnsetConfidence | null } => ({ ms, confidence: 'witnessed' });
  const meal = (ms: number): FeedingInput => ({ ms, confidence: 'witnessed', form: 'meal' });
  const NO_FREE_FED: FreeFedSpan[] = [];

  it('counts eligible (meal-timeable, witnessed-onset) episodes in the 60-day window', () => {
    // 3 witnessed vomits, each 1h after a witnessed meal, all recent → 3 eligible.
    const feedings = [meal(NOW - 5 * DAY), meal(NOW - 3 * DAY), meal(NOW - 1 * DAY)];
    const onsets = [witnessed(NOW - 5 * DAY + HOUR), witnessed(NOW - 3 * DAY + HOUR), witnessed(NOW - 1 * DAY + HOUR)];
    expect(windowedTimedEligibleCount(onsets, feedings, NO_FREE_FED, NOW)).toBe(3);
  });

  it('excludes episodes older than the 60-day window', () => {
    const feedings = [meal(NOW - 2 * DAY), meal(NOW - 90 * DAY)];
    const onsets = [witnessed(NOW - 2 * DAY + HOUR), witnessed(NOW - 90 * DAY + HOUR)];
    expect(windowedTimedEligibleCount(onsets, feedings, NO_FREE_FED, NOW)).toBe(1); // the 90-day-old one is windowed out
  });

  it('excludes untimeable episodes — a discovered onset and one with no preceding meal', () => {
    const feedings = [meal(NOW - 2 * DAY)];
    const onsets = [
      witnessed(NOW - 2 * DAY + HOUR), // eligible
      { ms: NOW - 1 * DAY, confidence: 'estimated' as OnsetConfidence }, // discovered → excluded
      witnessed(NOW - 10 * DAY), // no meal within the 24h lookback → excluded
    ];
    expect(windowedTimedEligibleCount(onsets, feedings, NO_FREE_FED, NOW)).toBe(1);
  });

  it('collapses re-logs (a double-tapped bout is one episode, not two)', () => {
    const feedings = [meal(NOW - 2 * DAY)];
    const onsets = [witnessed(NOW - 2 * DAY + HOUR), witnessed(NOW - 2 * DAY + HOUR + 30 * 60_000)]; // 30 min apart
    expect(windowedTimedEligibleCount(onsets, feedings, NO_FREE_FED, NOW)).toBe(1);
  });
});

// ── detectWatchingGapShortening — the escalate-only sub-floor gap detector ─────────
// Server-faithful (G9): strict-decrease (G5) + the ratio gate (latest ≤ 0.5× median of ALL
// windowed gaps) + the recency guard, at the 3-gap WATCHING floor + the 180-day era window.
describe('detectWatchingGapShortening (escalate-only, G5; ratio-gated, server-faithful)', () => {
  const w = (ms: number) => ({ ms, confidence: 'witnessed' as OnsetConfidence });
  // Build ascending onsets from a gaps-in-hours sequence (oldest→newest), the last onset
  // `sinceLastHours` before now.
  function onsetsFromGaps(gapsHours: number[], sinceLastHours: number): { ms: number; confidence: OnsetConfidence }[] {
    const ms = [NOW - sinceLastHours * HOUR];
    for (let i = gapsHours.length - 1; i >= 0; i--) ms.unshift(ms[0] - gapsHours[i] * HOUR);
    return ms.map(w);
  }
  // A pet who typically goes ~10 days, then a shortening tail 6d → 3d → 2d, last 1 day ago.
  // recent = [144,72,48]; median over all 5 gaps = 144h; latest 48 ≤ 0.5×144 = 72 → fires.
  const meaningfulRun = () => onsetsFromGaps([240, 240, 144, 72, 48], 24);

  it('returns the recent gaps on a meaningful (ratio-passing), current, shortening run', () => {
    expect(detectWatchingGapShortening(meaningfulRun(), NOW)).toEqual([144, 72, 48]);
  });

  it('null on fewer than 3 gaps (needs ≥4 collapsed episodes — the g-chart watching floor)', () => {
    expect(detectWatchingGapShortening(onsetsFromGaps([144, 72, 48], 24).slice(1), NOW)).toBeNull(); // 2 gaps
  });

  it('null on a lengthening run (absence ≠ wellness — a widening gap never surfaces)', () => {
    expect(detectWatchingGapShortening(onsetsFromGaps([24, 72, 144], 24), NOW)).toBeNull(); // increasing
  });

  it('null on a flat run (steady gaps are not shortening)', () => {
    expect(detectWatchingGapShortening(onsetsFromGaps([72, 72, 72], 24), NOW)).toBeNull();
  });

  it('null on a TRIVIAL flat-looking shortening [50,49,48] — the ratio gate (adversarial 5a)', () => {
    // Strictly decreasing in raw terms, but latest 48 > 0.5 × median(49) — so it would round
    // to a misleading "2 days, then 2, then 2". The ratio gate suppresses it.
    expect(detectWatchingGapShortening(onsetsFromGaps([50, 49, 48], 24), NOW)).toBeNull();
  });

  it('null on a 3-gap-only moderate shortening [144,72,48] — not meaningfully shorter than its own median', () => {
    // The mock example as a pet's ONLY 3 gaps: median 72, latest 48 > 36 → a 4-episode record
    // isn't strong enough evidence of acceleration to flag (the noise suppression both reviews asked for).
    expect(detectWatchingGapShortening(onsetsFromGaps([144, 72, 48], 24), NOW)).toBeNull();
  });

  it('null when the run is stale/reversed (open interval ≫ 2× the latest gap — recency guard)', () => {
    // The meaningful run, but the last episode is 200h back (> 2×48h) → not surfaced as live.
    expect(detectWatchingGapShortening(onsetsFromGaps([240, 240, 144, 72, 48], 200), NOW)).toBeNull();
  });

  it('uses the most-recent 3 gaps when the record has more (a longer tail is fine)', () => {
    // 6 gaps; the last 3 (6d,3d,2d) are the shortening run reported.
    expect(detectWatchingGapShortening(onsetsFromGaps([300, 240, 240, 144, 72, 48], 24), NOW)).toEqual([144, 72, 48]);
  });

  it('windows to the 180-day era — an onset >180d ago is excluded and never joins the run (adversarial 7)', () => {
    // The meaningful run within 180d, plus one onset 200 days ago. If the window failed, that
    // old onset would prepend a ~160-day gap and perturb the median; windowed out, the result
    // is identical to the run alone.
    const withAncient = [w(NOW - 200 * DAY), ...meaningfulRun()];
    expect(detectWatchingGapShortening(withAncient, NOW)).toEqual([144, 72, 48]);
  });

  it('collapses re-logs before measuring gaps (a double-tap does not mint a fake 0h gap)', () => {
    const base = meaningfulRun();
    const doubled = [...base, w(base[base.length - 1].ms + 30 * 60_000)]; // 30-min re-log of the newest
    expect(detectWatchingGapShortening(doubled, NOW)).toEqual([144, 72, 48]);
  });
});

// ── Property sweep — the escalate-only gap detector's null-model fire rate ─────────
// "The sweep sets the floor, not intuition" (the track's ⑥/PR-8 discipline). The row sits
// at the 3-gap WATCHING floor, so it fires on SOME chance shortenings by construction — but
// the ratio gate + recency guard hold that residual low. We MEASURE it on seeded null models
// (deterministic PRNG — no Math.random, which jest/Deno both forbid in this codebase's pure
// modules) and assert a DISCLOSED ceiling + a sanity FLOOR, so the test cannot rot into a
// no-op that would hide a future FPR regression (a re-drop of the ratio gate would spike the
// rate from ~3% toward the naive ~17%). This mirrors — and inherits — PR 8's server-side
// sweep of the same logic; the client mirror having the same measured residual is the point.
describe('detectWatchingGapShortening — null-model property sweep', () => {
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const TRIALS = 3000;
  // Build `eps` onsets whose inter-episode gaps + trailing open interval come from `gapH`
  // (called per gap, so a stateful generator models autocorrelation), ending at NOW − open.
  function fireRate(seed: number, eps: number, gapH: (rng: () => number) => number): number {
    const rng = mulberry32(seed);
    let fires = 0;
    for (let t = 0; t < TRIALS; t++) {
      const gaps: number[] = [];
      for (let i = 0; i < eps - 1; i++) gaps.push(gapH(rng));
      const ms = [NOW - gapH(rng) * HOUR]; // the open interval, same law (memorylessness)
      for (let i = gaps.length - 1; i >= 0; i--) ms.unshift(ms[0] - gaps[i] * HOUR);
      const onsets = ms.map((m) => ({ ms: m, confidence: 'witnessed' as OnsetConfidence }));
      if (detectWatchingGapShortening(onsets, NOW) !== null) fires++;
    }
    return fires / TRIALS;
  }
  const expo = (meanH: number) => (rng: () => number) => -Math.log(1 - rng()) * meanH;

  it('constant-rate (Poisson) + uniform nulls stay single-digit (ratio-gated): pooled < 5%, worst < 6%', () => {
    const rates: number[] = [];
    // Constant-rate Poisson at several mean gaps × episode counts.
    for (const meanDays of [5, 10, 20]) {
      for (const eps of [4, 5, 6, 8]) {
        rates.push(fireRate(1300 + meanDays * 10 + eps, eps, expo(meanDays * 24)));
      }
    }
    // Uniform-random onsets over a 60-day span (a different null shape).
    for (const eps of [4, 5, 6, 8]) {
      const rng = mulberry32(900 + eps);
      let fires = 0;
      for (let t = 0; t < TRIALS; t++) {
        const onsets = Array.from({ length: eps }, () => ({
          ms: NOW - rng() * 60 * DAY,
          confidence: 'witnessed' as OnsetConfidence,
        }));
        if (detectWatchingGapShortening(onsets, NOW) !== null) fires++;
      }
      rates.push(fires / TRIALS);
    }
    const pooled = rates.reduce((a, b) => a + b, 0) / rates.length;
    const worst = Math.max(...rates);
    expect(pooled).toBeLessThan(0.05);
    expect(worst).toBeLessThan(0.06);
  });

  it('has a sanity FLOOR — the escalate-only row DOES fire on chance shortenings (so the test cannot rot to a no-op)', () => {
    // If a future edit silently disabled firing (or the ratio gate turned it inert), this
    // fails — the disclosed residual is a feature of a sub-floor watching row, not a bug.
    const pooled =
      (fireRate(1310, 5, expo(10 * 24)) + fireRate(1320, 6, expo(10 * 24)) + fireRate(1330, 8, expo(20 * 24))) / 3;
    expect(pooled).toBeGreaterThan(0.012);
  });

  it('autocorrelated (waxing/waning) nulls: the disclosed higher residual stays bounded (< 8%)', () => {
    // A 2-state flare/quiet Markov rate — the class PR 8 disclosed as its higher residual
    // (a down-drift reads as acceleration; the RTM the lane guards against). Still bounded.
    function markov(seed: number, eps: number): number {
      const rng = mulberry32(seed);
      const QUIET = 20 * 24;
      const FLARE = 2 * 24;
      const P = 0.35;
      let fires = 0;
      for (let t = 0; t < TRIALS; t++) {
        let flare = rng() < 0.5;
        const draw = (): number => {
          if (rng() < P) flare = !flare;
          return -Math.log(1 - rng()) * (flare ? FLARE : QUIET);
        };
        const gaps: number[] = [];
        for (let i = 0; i < eps - 1; i++) gaps.push(draw());
        const ms = [NOW - draw() * HOUR];
        for (let i = gaps.length - 1; i >= 0; i--) ms.unshift(ms[0] - gaps[i] * HOUR);
        const onsets = ms.map((m) => ({ ms: m, confidence: 'witnessed' as OnsetConfidence }));
        if (detectWatchingGapShortening(onsets, NOW) !== null) fires++;
      }
      return fires / TRIALS;
    }
    const worst = Math.max(markov(7005, 5), markov(7006, 6), markov(7008, 8));
    expect(worst).toBeLessThan(0.08);
  });
});
