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
  formatWatchingGapSequence,
  BUILDING_FLOOR,
} from './signalCopy';
import {
  buildWatchingRows,
  windowedTimedEligibleCount,
  detectWatchingGapShortening,
  WATCHING_TIMING_NEED,
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
  it('the timing row is verbatim, count-anchored (both numbers printed — §9 denominator rule)', () => {
    expect(watchingTimingRow(4, 6)).toBe('Timing — 4 of the 6 timed episodes a pattern needs.');
  });
  it('the change row is verbatim, naming the current week', () => {
    expect(watchingChangeRow(2, 2)).toBe(
      'Change, week to week — needs 2 full weeks of logging to compare. This is week 2.',
    );
  });
  it('the gap row is verbatim, the symptom + the plain time-ordered sequence', () => {
    expect(watchingGapRow('vomiting', '6 days, then 3, then 2')).toBe(
      'Gaps between vomiting episodes — 6 days, then 3, then 2.',
    );
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
  const base: WatchingFacts = { timedEligibleCount: 0, dayNumber: 30, gapSequenceHours: null };
  const rowKeys = (rows: WatchingRow[]) => rows.map((r) => r.key);

  describe('timing lane', () => {
    it('no row at 0 timeable episodes (no timing question to pose yet)', () => {
      expect(buildWatchingRows({ ...base, timedEligibleCount: 0 })).toEqual([]);
    });
    it('shows "N of 6" for 1..5 timeable episodes', () => {
      for (const n of [1, 3, 5]) {
        const rows = buildWatchingRows({ ...base, timedEligibleCount: n });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ key: 'timing', text: `Timing — ${n} of the 6 timed episodes a pattern needs.` });
      }
    });
    it('no row once the floor is met (≥6 — the lane can run, nothing "still needed")', () => {
      expect(buildWatchingRows({ ...base, timedEligibleCount: WATCHING_TIMING_NEED })).toEqual([]);
      expect(buildWatchingRows({ ...base, timedEligibleCount: 9 })).toEqual([]);
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
    it('renders the plain sequence when a shortening run is supplied', () => {
      const rows = buildWatchingRows({ ...base, gapSequenceHours: [6 * 24, 3 * 24, 2 * 24] });
      expect(rows).toEqual([{ key: 'gap', text: 'Gaps between vomiting episodes — 6 days, then 3, then 2.' }]);
    });
  });

  it('orders the rows timing → change → gap (the mock §05 order)', () => {
    const rows = buildWatchingRows({ timedEligibleCount: 4, dayNumber: 12, gapSequenceHours: [6 * 24, 3 * 24, 2 * 24] });
    expect(rowKeys(rows)).toEqual(['timing', 'change', 'gap']);
    // The exact mock frame, reproduced from real-shaped facts.
    expect(rows.map((r) => r.text)).toEqual([
      'Timing — 4 of the 6 timed episodes a pattern needs.',
      'Change, week to week — needs 2 full weeks of logging to compare. This is week 2.',
      'Gaps between vomiting episodes — 6 days, then 3, then 2.',
    ]);
  });

  it('returns [] when nothing qualifies (a mature, well-covered record with no shortening)', () => {
    expect(buildWatchingRows({ timedEligibleCount: 9, dayNumber: 60, gapSequenceHours: null })).toEqual([]);
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
describe('detectWatchingGapShortening (escalate-only, G5)', () => {
  const w = (ms: number) => ({ ms, confidence: 'witnessed' as OnsetConfidence });
  // A shortening 3-gap run (6d, 3d, 2d) ending 24h before now (well within the 2× recency
  // grace of the latest 48h gap). Onsets oldest→newest.
  const shorteningOnsets = () => {
    const e4 = NOW - 24 * HOUR;
    const e3 = e4 - 48 * HOUR;
    const e2 = e3 - 72 * HOUR;
    const e1 = e2 - 144 * HOUR;
    return [w(e1), w(e2), w(e3), w(e4)];
  };

  it('returns the recent gaps (hours) on a strictly-shortening, current run', () => {
    expect(detectWatchingGapShortening(shorteningOnsets(), NOW)).toEqual([144, 72, 48]);
  });

  it('null on fewer than 3 gaps (needs ≥4 collapsed episodes — the g-chart watching floor)', () => {
    const three = shorteningOnsets().slice(1); // 3 episodes → 2 gaps
    expect(detectWatchingGapShortening(three, NOW)).toBeNull();
  });

  it('null on a lengthening run (absence ≠ wellness — a widening gap never surfaces)', () => {
    const e1 = NOW - 30 * DAY;
    const onsets = [w(e1), w(e1 + 24 * HOUR), w(e1 + 24 * HOUR + 72 * HOUR), w(e1 + 24 * HOUR + 72 * HOUR + 144 * HOUR)];
    expect(detectWatchingGapShortening(onsets, NOW)).toBeNull(); // gaps 24 < 72 < 144 → increasing
  });

  it('null on a flat run (steady gaps are not shortening)', () => {
    const e1 = NOW - 20 * DAY;
    const onsets = [w(e1), w(e1 + 72 * HOUR), w(e1 + 144 * HOUR), w(e1 + 216 * HOUR)]; // all 72h gaps
    expect(detectWatchingGapShortening(onsets, NOW)).toBeNull();
  });

  it('null when the run is stale/reversed (open interval ≫ 2× the latest gap — recency guard)', () => {
    // Same shortening shape, but the last episode is 200h back (> 2×48h) → the accelerating
    // run has not continued; never surfaced as if it were live.
    const staleNow = NOW;
    const e4 = staleNow - 200 * HOUR;
    const e3 = e4 - 48 * HOUR;
    const e2 = e3 - 72 * HOUR;
    const e1 = e2 - 144 * HOUR;
    expect(detectWatchingGapShortening([w(e1), w(e2), w(e3), w(e4)], staleNow)).toBeNull();
  });

  it('uses the most-recent 3 gaps when the record has more (a longer tail is fine)', () => {
    // 5 episodes → 4 gaps [10d, 6d, 3d, 2d]; the last 3 (6d,3d,2d) are the shortening run.
    const e5 = NOW - 24 * HOUR;
    const e4 = e5 - 48 * HOUR;
    const e3 = e4 - 72 * HOUR;
    const e2 = e3 - 144 * HOUR;
    const e1 = e2 - 240 * HOUR;
    expect(detectWatchingGapShortening([w(e1), w(e2), w(e3), w(e4), w(e5)], NOW)).toEqual([144, 72, 48]);
  });

  it('collapses re-logs before measuring gaps (a double-tap does not mint a fake 0h gap)', () => {
    // The shortening run, with the newest episode double-logged 30 min apart → still one
    // episode, so the recent gaps are unchanged (no spurious tiny gap from the re-log).
    const base = shorteningOnsets();
    const doubled = [...base, w(base[base.length - 1].ms + 30 * 60_000)];
    expect(detectWatchingGapShortening(doubled, NOW)).toEqual([144, 72, 48]);
  });
});
