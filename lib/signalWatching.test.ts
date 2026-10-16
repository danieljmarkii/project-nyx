// The Signal's gap warning (Signals v2 B-755 / CUL-14's gap lane; CUL-1838's logged-time
// clock). Here we pin: the gap row's verbatim copy and its run-aware render, the G8
// register sweep, the escalate-only detector with its logged-time recency guard, and the
// detector's null-model fire rate. The DB read (`getGapWarning`) is exercised end to end
// over real SQLite in `components/home/SignalZone.lookRecency.test.tsx`.

import { watchingGapRow, watchingGapRowFromHours, formatWatchingGapSequence } from './signalCopy';
import {
  detectWatchingGapShortening,
  loggedHoursSince,
  nextGapChangeMs,
  QUIET_STRETCH_MS,
  WATCHING_GAP_WINDOW_DAYS,
} from './signalWatching';
import type { OnsetConfidence } from './mealTiming';

const HOUR = 3_600_000;
const DAY = 86_400_000;
// A fixed "now" — these functions ask DURATION questions (ms since a meal / between
// episodes / since now), never a local-day question, so a UTC-anchored instant is stable
// across runner zones (B-514: the local-day inputs — dayNumber — are integers passed in).
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0);

/** A log every `h` hours over [from, to] — an owner who logs meals on a steady rhythm. */
function everyHours(h: number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += h * HOUR) out.push(t);
  return out;
}

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
});

describe('watching copy — the G8 register sweep (transparency, never solicitation)', () => {
  const strings = [
    watchingGapRow('vomiting', '6 days, then 3, then 2'),
    watchingGapRow('vomiting', '3 days, then 18 hours, then 9 hours'),
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
  // An owner who logs a meal every 12 hours across the whole span: logged time equals the
  // wall clock, so these cases read exactly as the server's guard does.
  const steady = everyHours(12, NOW - 200 * DAY, NOW);

  it('returns the recent gaps on a meaningful (ratio-passing), current, shortening run', () => {
    expect(detectWatchingGapShortening(meaningfulRun(), NOW, steady)).toEqual([144, 72, 48]);
  });

  it('null on fewer than 3 gaps (needs ≥4 collapsed episodes — the g-chart watching floor)', () => {
    expect(detectWatchingGapShortening(onsetsFromGaps([144, 72, 48], 24).slice(1), NOW, steady)).toBeNull(); // 2 gaps
  });

  it('null on a lengthening run (absence ≠ wellness — a widening gap never surfaces)', () => {
    expect(detectWatchingGapShortening(onsetsFromGaps([24, 72, 144], 24), NOW, steady)).toBeNull(); // increasing
  });

  it('null on a flat run (steady gaps are not shortening)', () => {
    expect(detectWatchingGapShortening(onsetsFromGaps([72, 72, 72], 24), NOW, steady)).toBeNull();
  });

  it('null on a TRIVIAL flat-looking shortening [50,49,48] — the ratio gate (adversarial 5a)', () => {
    // Strictly decreasing in raw terms, but latest 48 > 0.5 × median(49) — so it would round
    // to a misleading "2 days, then 2, then 2". The ratio gate suppresses it.
    expect(detectWatchingGapShortening(onsetsFromGaps([50, 49, 48], 24), NOW, steady)).toBeNull();
  });

  it('null on a 3-gap-only moderate shortening [144,72,48] — not meaningfully shorter than its own median', () => {
    // The mock example as a pet's ONLY 3 gaps: median 72, latest 48 > 36 → a 4-episode record
    // isn't strong enough evidence of acceleration to flag (the noise suppression both reviews asked for).
    expect(detectWatchingGapShortening(onsetsFromGaps([144, 72, 48], 24), NOW, steady)).toBeNull();
  });

  it('null when the run is stale/reversed (LOGGED time since the last onset ≫ 2× the latest gap — recency guard)', () => {
    // The meaningful run, but the last episode is 200h back (> 2×48h) and the owner kept
    // logging meals all through it → the run has not continued.
    expect(detectWatchingGapShortening(onsetsFromGaps([240, 240, 144, 72, 48], 200), NOW, steady)).toBeNull();
  });

  it('uses the most-recent 3 gaps when the record has more (a longer tail is fine)', () => {
    // 6 gaps; the last 3 (6d,3d,2d) are the shortening run reported.
    expect(detectWatchingGapShortening(onsetsFromGaps([300, 240, 240, 144, 72, 48], 24), NOW, steady)).toEqual([144, 72, 48]);
  });

  it('windows to the 180-day era — an onset >180d ago is excluded and never joins the run (adversarial 7)', () => {
    // The meaningful run within 180d, plus one onset 200 days ago. If the window failed, that
    // old onset would prepend a ~160-day gap and perturb the median; windowed out, the result
    // is identical to the run alone.
    const withAncient = [w(NOW - 200 * DAY), ...meaningfulRun()];
    expect(detectWatchingGapShortening(withAncient, NOW, steady)).toEqual([144, 72, 48]);
  });

  it('collapses re-logs before measuring gaps (a double-tap does not mint a fake 0h gap)', () => {
    const base = meaningfulRun();
    const doubled = [...base, w(base[base.length - 1].ms + 30 * 60_000)]; // 30-min re-log of the newest
    expect(detectWatchingGapShortening(doubled, NOW, steady)).toEqual([144, 72, 48]);
  });
});

// ── The logged-time clock (CUL-1838; PM ruling 2026-10-14 on CUL-1468) ──────────────
// "A gap in logging is not a gap in vomiting": the recency guard counts only logged time,
// leaves out any 48h+ stretch with nothing logged but looks, and a look never moves the
// anchor (looks are not in `loggedMs` — `readLoggedMs` excludes them in SQL, and the
// end-to-end proof over real SQLite is SignalZone.lookRecency.test.tsx).
describe('loggedHoursSince', () => {
  it('counts the wall clock when the owner logs on a steady rhythm', () => {
    expect(loggedHoursSince(NOW - 100 * HOUR, NOW, everyHours(12, NOW - 200 * HOUR, NOW))).toBeCloseTo(100);
  });
  it('leaves out a 48h+ stretch whole, the trailing one included', () => {
    // A log 10h after the anchor, then nothing for 90h: 10h counted, the 90h left out.
    expect(loggedHoursSince(NOW - 100 * HOUR, NOW, [NOW - 90 * HOUR])).toBeCloseTo(10);
  });
  it('counts a stretch just under the floor and drops one just over it (the boundary is the shipped constant)', () => {
    const under = QUIET_STRETCH_MS / HOUR - 1;
    expect(loggedHoursSince(NOW - under * HOUR, NOW, [])).toBeCloseTo(under);
    expect(loggedHoursSince(NOW - (under + 2) * HOUR, NOW, [])).toBe(0);
  });
  it('ignores logs outside the span and an empty span', () => {
    expect(loggedHoursSince(NOW, NOW, [NOW - HOUR])).toBe(0);
    expect(loggedHoursSince(NOW - 10 * HOUR, NOW, [NOW - 20 * HOUR, NOW + HOUR])).toBeCloseTo(10);
  });
});

describe('detectWatchingGapShortening — the warning stays until the next log (CUL-1468)', () => {
  const w = (ms: number) => ({ ms, confidence: 'witnessed' as OnsetConfidence });
  // CUL-1468's cat: vomits 12, 7 and 3 days apart, the last one `daysAgo` back, nothing else.
  const cat = (daysAgo: number) => [22, 10, 3, 0].map((d) => w(NOW - (daysAgo + d) * DAY));

  it('the backfill case: the last event 2.5 days old still warns (the wall clock had it expire only past day 6)', () => {
    const onsets = cat(2.5);
    expect(detectWatchingGapShortening(onsets, NOW, onsets.map((o) => o.ms))).toEqual([288, 168, 72]);
  });

  it('a record gone quiet keeps the warning however long it sits (the wall clock dropped it at day 6.5)', () => {
    const onsets = cat(30);
    expect(detectWatchingGapShortening(onsets, NOW, onsets.map((o) => o.ms))).toEqual([288, 168, 72]);
  });

  it('non-vacuity: the same record with meals logged through the quiet days does expire', () => {
    const onsets = cat(30);
    const meals = everyHours(12, NOW - 30 * DAY, NOW);
    expect(detectWatchingGapShortening(onsets, NOW, [...onsets.map((o) => o.ms), ...meals])).toBeNull();
  });

  it('logging again resumes the clock from the next log: a meal an hour ago after a quiet week, still inside the grace', () => {
    const onsets = cat(7);
    // Nothing for a week, then one meal an hour ago: the week is left out, 1h counted.
    expect(detectWatchingGapShortening(onsets, NOW, [...onsets.map((o) => o.ms), NOW - HOUR])).toEqual([288, 168, 72]);
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
  // The sweep's owner logs every 12 hours, so logged time is the wall clock and the
  // measured residual is the server mirror's (the logged-time clock only ever lengthens
  // the warning for an owner who STOPS logging; that case is pinned above, not swept).
  const SWEEP_LOGS = everyHours(12, NOW - 200 * DAY, NOW);
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
      if (detectWatchingGapShortening(onsets, NOW, SWEEP_LOGS) !== null) fires++;
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
        if (detectWatchingGapShortening(onsets, NOW, SWEEP_LOGS) !== null) fires++;
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
        if (detectWatchingGapShortening(onsets, NOW, SWEEP_LOGS) !== null) fires++;
      }
      return fires / TRIALS;
    }
    const worst = Math.max(markov(7005, 5), markov(7006, 6), markov(7008, 8));
    expect(worst).toBeLessThan(0.08);
  });
});

// ── CUL-1949: when the clock alone next moves the answer ─────────────────────────
// Each case checks the instant against the REAL detector: the answer at the instant
// differs from the answer one millisecond before it, which is what Home's schedule needs.
describe('nextGapChangeMs (CUL-1949)', () => {
  // Gaps 100h, 60h, 30h, 10h: the last three strictly shorten, 10h <= 0.5 × the 45h median,
  // and the 2× guard gives 20h of logged time. The last onset is L; nothing logged since.
  const L = NOW - 30 * HOUR;
  const onsetMs = [L - 200 * HOUR, L - 100 * HOUR, L - 40 * HOUR, L - 10 * HOUR, L];
  const onsets = onsetMs.map((ms) => ({ ms, confidence: null }));
  const answer = (now: number) => detectWatchingGapShortening(onsets, now, onsetMs) !== null;

  it('the warning that retired comes back when the silence reaches the quiet stretch, and the schedule names that instant', () => {
    expect(answer(NOW)).toBe(false); // 30h logged, past the 20h guard
    const at = nextGapChangeMs(onsets, NOW, onsetMs);
    expect(at).toBe(L + QUIET_STRETCH_MS);
    expect(answer(at! - 1)).toBe(false);
    expect(answer(at!)).toBe(true);
  });

  it('while the warning is up, the schedule names the retirement', () => {
    const now = L + 5 * HOUR;
    expect(answer(now)).toBe(true);
    const at = nextGapChangeMs(onsets, now, onsetMs)!;
    expect(at).toBe(L + 20 * HOUR + 1);
    expect(answer(at - 1)).toBe(true);
    expect(answer(at)).toBe(false);
  });

  it('a log since the last onset moves the retirement by the logged clock, not the wall', () => {
    // A meal 3h after L, then nothing: the retirement is still 20h of logged time from L.
    const logged = [...onsetMs, L + 3 * HOUR];
    const now = L + 4 * HOUR;
    const at = nextGapChangeMs(onsets, now, logged)!;
    expect(at).toBe(L + 20 * HOUR + 1);
    expect(detectWatchingGapShortening(onsets, at - 1, logged)).not.toBeNull();
    expect(detectWatchingGapShortening(onsets, at, logged)).toBeNull();
  });

  it('a future-dated row is a boundary the moment it starts to count', () => {
    const future = NOW + 2 * HOUR;
    // A log becomes a cut just after its instant; a vomit counts AT it.
    expect(nextGapChangeMs(onsets, NOW, [...onsetMs, future])).toBe(future + 1);
    expect(nextGapChangeMs([...onsets, { ms: future, confidence: null }], NOW, onsetMs)).toBe(future);
  });

  it('the trailing piece is anchored on the EPISODE onset, even when a folded-in vomit is not a cut', () => {
    // Gaps 200h, 100h, 20h; a second vomit 2h into the last episode (one episode), and no
    // logged rows at all: the guard's piece starts at the episode onset D, so 48h from D.
    const D = NOW - 41 * HOUR;
    const rows = [D - 320 * HOUR, D - 120 * HOUR, D - 20 * HOUR, D, D + 2 * HOUR].map((ms) => ({ ms, confidence: null }));
    expect(detectWatchingGapShortening(rows, NOW, [])).toBeNull();
    const at = nextGapChangeMs(rows, NOW, [])!;
    expect(at).toBe(D + QUIET_STRETCH_MS);
    expect(detectWatchingGapShortening(rows, at - 1, [])).toBeNull();
    expect(detectWatchingGapShortening(rows, at, [])).not.toBeNull();
  });

  it('an onset leaving the 180-day era is a boundary', () => {
    const old = [{ ms: NOW - WATCHING_GAP_WINDOW_DAYS * DAY + HOUR, confidence: null }];
    expect(nextGapChangeMs(old, NOW, [])).toBe(old[0].ms + WATCHING_GAP_WINDOW_DAYS * DAY + 1);
  });

  it('property: across random records the answer never moves before the named instant', () => {
    // A missed boundary is a warning shown late, so sample the span [now, next) densely
    // and require one answer across it. Seeded (mulberry32), so a failure replays.
    let seed = 1949;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let comesBack = 0;
    let retires = 0;
    for (let trial = 0; trial < 200; trial++) {
      // A shortening-prone record: 4–6 onsets with shrinking gaps, a few meals between.
      const n = 4 + Math.floor(rand() * 3);
      const ons: number[] = [];
      let t = NOW - rand() * 60 * HOUR;
      let gap = 4 + rand() * 30;
      for (let i = 0; i < n; i++) {
        ons.unshift(t);
        t -= gap * HOUR;
        gap *= 1.2 + rand();
      }
      const meals = Array.from({ length: Math.floor(rand() * 4) }, () => ons[n - 1] + rand() * 70 * HOUR);
      const rows = ons.map((ms) => ({ ms, confidence: null }));
      const logged = [...ons, ...meals];
      let now = NOW;
      for (let step = 0; step < 6; step++) {
        const next = nextGapChangeMs(rows, now, logged);
        const end = next ?? now + 400 * HOUR;
        const before = detectWatchingGapShortening(rows, now, logged) !== null;
        for (let k = 1; k <= 24; k++) {
          const probe = now + Math.floor(((end - 1 - now) * k) / 24);
          expect(detectWatchingGapShortening(rows, probe, logged) !== null).toBe(before);
        }
        if (next === null) break;
        const after = detectWatchingGapShortening(rows, next, logged) !== null;
        if (after && !before) comesBack++;
        if (before && !after) retires++;
        now = next;
      }
    }
    // Non-vacuous: the walk crossed real flips, both ways, not only quiet spans.
    expect(comesBack).toBeGreaterThan(10);
    expect(retires).toBeGreaterThan(10);
  });

  it('an empty record has no boundary', () => {
    expect(nextGapChangeMs([], NOW, [])).toBeNull();
  });
});
