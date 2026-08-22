// B-067 / CUL-372 — the symptom-episode collapse has exactly ONE implementation.
// Guard test, modelled on `lib/dietTrialDayMath.guard.test.ts`.
//
// `lib/symptomEpisodes.test.ts` pins WHAT the collapse should say. This pins that
// every consumer actually ASKS it — the half a value test cannot cover, and the half
// that failed here: the Signal engine collapsed events into episodes while the Home
// Trend card counted raw rows, so one screen showed "2 episodes this week" and
// "5 this week" about the same five events, with opposite directions attached.
//
// The failure this catches is a silent wrong number on a clinical surface, and the
// alternative — noticing a second implementation in review — is exactly what did not
// happen for the fourteen months B-067 sat open.

/// <reference types="node" />
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Every .ts/.tsx source under the app directories, tests excluded. A hardcoded
 *  allowlist was the first draft's mistake — code review pointed out that a NEW file
 *  re-implementing the collapse would sail straight through it, reproducing the exact
 *  failure this guard exists to prevent. */
function appSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(rel);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|guard)\./.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  // `supabase/functions` INCLUDED. The re-pass demonstrated the omission: a second
  // collapse written inside detection.ts passed this guard, and photoComposition.ts's
  // `collapseComposition` — a live third body feeding owner-facing counts — sat in the
  // blind spot the whole time.
  for (const dir of ['lib', 'hooks', 'components', 'app', 'store', 'supabase/functions']) {
    walk(dir);
  }
  return out;
}

/** Source with whole-line comments removed — the modules guarded here NAME the defect
 *  they fixed in their own headers, so matching raw source would make a good comment
 *  fail a `not.toMatch`. */
const readCode = (p: string) =>
  read(p)
    // JSX comment blocks too — `{/* ... */}` does not start with `//`, so the
    // line filter below misses it, and these guards' own explanatory prose NAMES
    // the copy it forbids. Stripped before the line pass so a good comment cannot
    // fail the test it documents.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');

/** The shape of a hand-rolled collapse: an episode-gap threshold, by any of the names
 *  the two original implementations used.
 *
 *  Deliberately identifier-based rather than arithmetic-based. The first draft of this
 *  guard matched `* 60 * 60 * 1000` and immediately failed on `useTrend`'s perfectly
 *  innocent `MS_PER_DAY = 24 * 60 * 60 * 1000` — a guard that fires on a day constant
 *  teaches people to weaken guards. What actually signals a re-implementation is a GAP
 *  variable, so that is what this matches. */
/** A re-implementation of the collapse is detected by its SHAPE, not by one variable
 *  name, and needs BOTH halves below.
 *
 *  Keying on the identifier alone was too blunt: broadening this guard from a 3-file
 *  allowlist to a directory scan immediately flagged `lib/medications.ts`, which uses
 *  `gapMs` for the double-dose proximity check — the absolute distance between two
 *  doses, with no sorting into runs and no chaining. A guard that cries wolf on an
 *  unrelated file is a guard someone eventually deletes. What actually defines this
 *  algorithm is the CHAINING CURSOR: a `prev` that advances to every event, which is
 *  what makes a long drip one episode rather than many. */
const GAP_THRESHOLD =
  /\b(gap|threshold|episodeGap)[A-Za-z]*\s*(=|\))|EPISODE_GAP_HOURS|episodeGapHours/;
const CHAIN_CURSOR = /\b(prev|last|cursor|previous)[A-Za-z]*\s*=\s*sorted\[/;
const reimplementsCollapse = (src: string) =>
  GAP_THRESHOLD.test(src) && CHAIN_CURSOR.test(src);

/** The one file ALLOWED to carry the algorithm.
 *
 *  `lib/mealTiming.ts` is its real home. The first version of this guard did not list
 *  it, and `lib/symptomEpisodes.ts` claimed the collapse "lives here, once" — both
 *  wrong, and adversarial review caught it: `collapseEpisodes` had been sitting there
 *  the whole time, generic over the event shape. `symptomEpisodes` is now a thin
 *  adapter that delegates, so the claim is true and this list is the proof obligation. */
const COLLAPSE_OWNERS = [
  'lib/mealTiming.ts',
  // NAMED EXEMPTION, not an oversight. `collapseComposition` chains the same rule over
  // photo-composition records rather than bare instants, and feeds the {count,
  // denominator} pairs on the Signal's timing cards. Re-basing it is a real change to a
  // deployed engine path and belongs in its own PR — filed as CUL-572. The drift the
  // re-pass actually worried about (a SECOND hardcoded 3) is closed regardless:
  // SYMPTOM_EPISODE_GAP_HOURS now resolves to DEFAULT_MEAL_TIMING_CONFIG.episodeGapHours,
  // which is the constant this file reads, so the two cannot diverge.
  'supabase/functions/generate-signal/photoComposition.ts',
];

// KNOWN LIMIT, stated rather than implied (the `guards/ownerFacingCopy.test.ts`
// convention). This is a syntactic scan: it keys on a gap-threshold assignment plus a
// chaining cursor indexed off a `sorted` array, which is the shape every implementation
// in this repo has taken. A determined rewrite — different identifiers, a `reduce`, a
// while-loop over an iterator — defeats it, as the re-pass demonstrated with two renames
// against the first draft. It is a tripwire for the accidental second copy, which is how
// all three real ones arrived; it is not a proof of uniqueness.

describe('the symptom-episode collapse has one implementation (B-067)', () => {
  it('the Home Trend hook delegates and carries no collapse of its own', () => {
    const src = readCode('hooks/useTrend.ts');
    // The hook now delegates the whole derivation to `lib/trendSummary`, which itself
    // delegates the collapse — so the hook carries neither.
    expect(src).toMatch(/summarizeSymptomTrend\(/);
    expect(src).toMatch(/from '\.\.\/lib\/trendSummary'/);
    expect(readCode('lib/trendSummary.ts')).toMatch(/from '\.\/symptomEpisodes'/);
    // The whole derivation is absent, which is stronger than "it delegates": there is
    // nothing left here to drift.
    expect(reimplementsCollapse(src)).toBe(false);
  });

  it('the Signal engine reads the collapse through the shared predicate', () => {
    const src = read('supabase/functions/generate-signal/detection.ts');
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/lib\/symptomEpisodes\.ts'/);
    expect(src).toMatch(/collapseToEpisodeOnsets\(/);
    // `toEpisodeOnsets` survives as a thin wrapper so the engine keeps its per-call
    // `config.symptomEpisodeGapHours` knob — but it must not re-spell the body.
    expect(readCode('supabase/functions/generate-signal/detection.ts')).not.toMatch(
      /const\s+gapMs\s*=/,
    );
  });

  it('the engine default and the shared constant cannot drift apart', () => {
    const src = readCode('supabase/functions/generate-signal/detection.ts');
    // The default is sourced from the constant, not re-typed as a literal.
    expect(src).toMatch(/symptomEpisodeGapHours:\s*SYMPTOM_EPISODE_GAP_HOURS/);
    expect(src).not.toMatch(/symptomEpisodeGapHours:\s*\d/);
  });

  it('no OTHER app source anywhere re-implements the collapse', () => {
    // Scans lib/ hooks/ components/ app/ store/ rather than an allowlist, so a NEW
    // file re-implementing the collapse fails the build on the day it lands — the
    // vet report's third off-diet predicate (diet-trial §5.3) is what this prevents.
    const offenders = appSources()
      .filter((p) => !COLLAPSE_OWNERS.includes(p))
      .filter((p) => reimplementsCollapse(readCode(p)));
    expect(offenders).toEqual([]);
  });

  // A guard nobody has tested is a guard nobody can rely on. The first draft's
  // `EPISODE_GAP_HOURS\s*=` branch carried a trailing `\b`, so it never matched the
  // idiomatic `const SYMPTOM_EPISODE_GAP_HOURS = 3;` — dead weight posing as
  // protection, and invisible until someone asserted on it.
  it('fires on a real re-implementation', () => {
    expect(reimplementsCollapse(`
      const gapMs = gapHours * MS_PER_HOUR;
      const sorted = [...events].sort((a, b) => a.ms - b.ms);
      let prev = sorted[0].ms;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].ms - prev > gapMs) out.push(sorted[i]);
        prev = sorted[i].ms;
      }`)).toBe(true);
    // The rename the re-pass used to defeat the first draft: prev->last, gapMs->threshold.
    expect(reimplementsCollapse(`
      const threshold = SYMPTOM_EPISODE_GAP_HOURS * 3_600_000;
      const sorted = [...events].sort((a, b) => a.ms - b.ms);
      let last = sorted[0].ms;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].ms - last > threshold) out.push(sorted[i]);
        last = sorted[i].ms;
      }`)).toBe(true);
  });

  it('does NOT fire on innocent gap or duration arithmetic', () => {
    // `MS_PER_DAY = 24 * 60 * 60 * 1000` (the first draft's false positive) and the
    // double-dose proximity check in lib/medications.ts (the directory scan's).
    expect(reimplementsCollapse('const MS_PER_DAY = 24 * 60 * 60 * 1000;')).toBe(false);
    expect(reimplementsCollapse(`
      const gapMs = Math.abs(oMs - focalMs);
      if (gapMs > windowMs) continue;
      if (!closest || gapMs < closest.gapMs) closest = { eventId: o.eventId, gapMs };`)).toBe(false);
  });
});

/** Just the `SymptomChart` component's source.
 *
 *  Scoped deliberately: `FeedingChart` in the same file still renders "↑ from N days
 *  last week" and "Every day this week" over MEAL-LOGGING days. Whether that is a
 *  parallel bypass is CUL-568's call, not this PR's, so this guard must not quietly
 *  pre-empt it — nor let the symptom chart's copy hide behind it. */
function symptomChartSource(): string {
  const src = readCode('components/home/TrendZone.tsx');
  const start = src.indexOf('function SymptomChart');
  const end = src.indexOf('function FeedingChart');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('the Trend card states no week-over-week verdict (B-067)', () => {
  // The safety half of the fix. `TrendZone.test.tsx` asserts the rendered absence;
  // this asserts the strings are gone from the source, so they cannot come back via a
  // branch the render tests do not happen to exercise.
  it('carries no direction copy for the symptom chart', () => {
    const src = symptomChartSource();
    // Case-INSENSITIVE on the copy strings. The first draft used /improving/ and
    // passed only because `chartSubLabelImproving` happens to capitalise the I —
    // i.e. it would not have caught the word coming back in a capitalised sentence.
    expect(src).not.toMatch(/improving/i);
    expect(src).not.toMatch(/↓ from|↑ from/);
    expect(src).not.toMatch(/last week/i);
    expect(src).not.toMatch(/same as last/i);
  });

  it('reserves the "improving" accent for the FEEDING chart until CUL-568 rules', () => {
    // The style token itself cannot be banned file-wide yet — FeedingChart still uses
    // it for "Every day this week", which is CUL-568's call, not this PR's. So pin the
    // COUNT: exactly one use, and it is not the symptom chart's.
    expect(symptomChartSource()).not.toMatch(/chartSubLabelImproving/);
    const uses = readCode('components/home/TrendZone.tsx').match(/chartSubLabelImproving/g) ?? [];
    expect(uses).toHaveLength(2); // the style definition + the one FeedingChart use
  });

  it('does not read the prior-window symptom count at all', () => {
    // The field is retained in `TrendData` as data for CUL-383, but this card
    // rendering it is the bypass. Not destructured here, not referenced here.
    expect(symptomChartSource()).not.toMatch(/lastWeekSymptomCount/);
    expect(readCode('components/home/TrendZone.tsx')).not.toMatch(/lastWeekSymptomCount/);
  });
});
