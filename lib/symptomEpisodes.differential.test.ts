// B-067 / CUL-372 — the episode collapse is BEHAVIOUR-NEUTRAL for the Signal engine.
//
// `supabase/functions/generate-signal/detection.ts` had its `toEpisodeOnsets` and
// `toConfidenceEpisodes` re-based onto the shared predicate. `generate-signal` is
// deployed (v32) and `generate-report` is on the B-494 HOLD, and the deploy ledger
// claims neither owes a redeploy for correctness — a load-bearing claim, since it is
// what lets a detection-engine edit ship without touching production.
//
// Both reviewers said the same thing about the first version of that claim: it rested
// on a one-off fuzz recorded in prose, with no runnable test in the repo. So the
// pre-refactor bodies are transcribed here verbatim as REFERENCE implementations and
// fuzzed against the current ones. If someone changes the collapse, this fails.

import { collapseToEpisodeOnsets } from './symptomEpisodes';

const MS_PER_HOUR = 60 * 60 * 1000;

// ── The bodies exactly as they stood on `main` before this change. Do not "improve"
//    them: their value is being a frozen copy of what production runs. ──
function referenceToEpisodeOnsets(symptomMsList: number[], gapHours: number): number[] {
  if (symptomMsList.length === 0) return [];
  const gapMs = gapHours * MS_PER_HOUR;
  const sorted = [...symptomMsList].sort((a, b) => a - b);
  const onsets: number[] = [sorted[0]];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - prev > gapMs) onsets.push(sorted[i]);
    prev = sorted[i];
  }
  return onsets;
}

type Conf = 'exact' | 'approximate' | null;
interface CE { onsetMs: number; confidence: Conf }

function referenceToConfidenceEpisodes(
  events: { ms: number; confidence: Conf }[],
  gapHours: number,
): CE[] {
  if (events.length === 0) return [];
  const gapMs = gapHours * MS_PER_HOUR;
  const sorted = [...events].sort((a, b) => a.ms - b.ms);
  const episodes: CE[] = [{ onsetMs: sorted[0].ms, confidence: sorted[0].confidence }];
  let prev = sorted[0].ms;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ms - prev > gapMs) {
      episodes.push({ onsetMs: sorted[i].ms, confidence: sorted[i].confidence });
    }
    prev = sorted[i].ms;
  }
  return episodes;
}

// ── The CURRENT bodies, mirroring detection.ts after the re-base. ──
const currentToEpisodeOnsets = (l: number[], g: number) => collapseToEpisodeOnsets(l, g);

function currentToConfidenceEpisodes(
  events: { ms: number; confidence: Conf }[],
  gapHours: number,
): CE[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.ms - b.ms);
  const onsetMsList = collapseToEpisodeOnsets(sorted.map((e) => e.ms), gapHours);
  const episodes: CE[] = [];
  let cursor = 0;
  for (const onsetMs of onsetMsList) {
    while (cursor < sorted.length && sorted[cursor].ms !== onsetMs) cursor++;
    if (cursor >= sorted.length) break;
    episodes.push({ onsetMs, confidence: sorted[cursor].confidence });
  }
  return episodes;
}

/** Deterministic PRNG so any failure is reproducible from the seed alone. */
function makeRng(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

const CONF: Conf[] = ['exact', 'approximate', null];
// The engine's per-symptom gaps (detection.ts DEFAULT_CONFIG): 3h episodes, and the
// longer per-symptom concern windows.
const GAPS = [3, 12, 24, 72];

describe('the re-based collapse is byte-identical to the shipped engine bodies', () => {
  it('agrees on 40,000 fuzzed inputs, including duplicate instants', () => {
    const rnd = makeRng(12345);
    const base = new Date(2026, 7, 1, 8, 0).getTime();
    let withDupes = 0;
    let multiEpisode = 0;

    for (let trial = 0; trial < 40_000; trial++) {
      const n = Math.floor(rnd() * 9);
      const gap = GAPS[Math.floor(rnd() * GAPS.length)];
      // Quantised to few distinct instants ON PURPOSE, so duplicate ms are common —
      // that is the edge `toConfidenceEpisodes`' cursor walk depends on.
      const events = Array.from({ length: n }, () => ({
        ms: base + Math.floor(rnd() * 12) * (Math.floor(rnd() * 4) * MS_PER_HOUR),
        confidence: CONF[Math.floor(rnd() * 3)],
      }));
      const msList = events.map((e) => e.ms);
      if (new Set(msList).size !== msList.length) withDupes++;

      const refOnsets = referenceToEpisodeOnsets(msList, gap);
      if (refOnsets.length > 1) multiEpisode++;
      expect(currentToEpisodeOnsets(msList, gap)).toEqual(refOnsets);
      expect(currentToConfidenceEpisodes(events, gap)).toEqual(
        referenceToConfidenceEpisodes(events, gap),
      );
    }

    // The fuzz is only evidence if it actually reached the interesting shapes.
    expect(withDupes).toBeGreaterThan(5_000);
    expect(multiEpisode).toBeGreaterThan(5_000);
  });

  it('agrees on an overnight chained bout that spans local midnight', () => {
    // The case the bars regression turned on: events every ~2h across midnight are ONE
    // episode, and both implementations must place its onset the previous evening.
    const start = new Date(2026, 7, 20, 20, 0).getTime();
    const bout = [0, 2, 4, 6, 8].map((h) => start + h * MS_PER_HOUR);
    expect(currentToEpisodeOnsets(bout, 3)).toEqual(referenceToEpisodeOnsets(bout, 3));
    expect(currentToEpisodeOnsets(bout, 3)).toEqual([start]);
  });

  it('DIVERGES only on non-finite instants, which no caller can produce', () => {
    // The one known difference: the shared predicate filters NaN, the old engine body
    // let it poison `prev` and swallow everything after it. Documented rather than
    // hidden — every engine call site pre-filters `Number.isFinite`, and the client
    // path filters in `symptomOnsetsByType`, so this is unreachable in production and
    // strictly toward correctness where it does differ.
    const poisoned = [1000, NaN, 14_401_000];
    expect(referenceToEpisodeOnsets(poisoned, 3)).toEqual([1000]);
    expect(currentToEpisodeOnsets(poisoned, 3)).toEqual([1000, 14_401_000]);
  });
});
