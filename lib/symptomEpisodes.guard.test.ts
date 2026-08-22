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
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Source with whole-line comments removed — the modules guarded here NAME the defect
 *  they fixed in their own headers, so matching raw source would make a good comment
 *  fail a `not.toMatch`. */
const readCode = (p: string) =>
  read(p)
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
const GAP_MS_ARITHMETIC = /\b(gapMs|gapHours|episodeGap|EPISODE_GAP_HOURS\s*=)\b/;

describe('the symptom-episode collapse has one implementation (B-067)', () => {
  it('the Home Trend hook delegates and carries no collapse of its own', () => {
    const src = readCode('hooks/useTrend.ts');
    expect(src).toMatch(/collapseToEpisodeOnsets\(/);
    expect(src).toMatch(/from '\.\.\/lib\/symptomEpisodes'/);
    // The whole derivation is absent, which is stronger than "it delegates": there is
    // nothing left here to drift.
    expect(src).not.toMatch(GAP_MS_ARITHMETIC);
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

  it('no OTHER app source re-implements the collapse', () => {
    // Belt and braces against a third consumer appearing the way the vet report's
    // third off-diet predicate did (diet-trial §5.3).
    for (const p of ['lib/analytics.ts', 'lib/daySummary.ts', 'components/home/TrendZone.tsx']) {
      expect(readCode(p)).not.toMatch(GAP_MS_ARITHMETIC);
    }
  });
});

describe('the Trend card states no week-over-week verdict (B-067)', () => {
  // The safety half of the fix. `TrendZone.test.tsx` asserts the rendered absence;
  // this asserts the strings are gone from the source, so they cannot come back via a
  // branch the render tests do not happen to exercise.
  it('carries no direction copy for the symptom chart', () => {
    const src = readCode('components/home/TrendZone.tsx');
    expect(src).not.toMatch(/improving/);
    expect(src).not.toMatch(/last week — /);
    expect(src).not.toMatch(/Same as last week \(/);
    expect(src).not.toMatch(/None this week or last/);
  });

  it('does not read the prior-window symptom count at all', () => {
    // The field is retained in `TrendData` as data for CUL-383, but this card
    // rendering it is the bypass. Not destructured here, not referenced here.
    expect(readCode('components/home/TrendZone.tsx')).not.toMatch(/lastWeekSymptomCount/);
  });
});
