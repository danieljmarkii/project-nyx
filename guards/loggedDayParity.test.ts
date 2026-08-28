/**
 * Client==server parity for the COMPARISON-GATE denominators (R3, CUL-676).
 *
 * THE SET THIS GUARDS IS NOT THE FETCH UNION, and that distinction is the whole point after
 * the 2026-08-28 re-ruling. The engine has two denominator predicates:
 *   • `isFetchedSymptom` — the fetch union (now includes `cough`). Used where COVERAGE is the
 *     question, e.g. ⑦'s span-halves eligibility.
 *   • `countsTowardComparisonGate` — the ③/④ lane cell (`LANE_SYMPTOM_TYPES.symptomDelta`,
 *     which excludes cough). Used where the denominator gates whether a FALLING comparison
 *     may be published at all.
 * The two client mirrors below feed the second kind, so they must track the second set. A
 * cough day is real coverage; it just cannot vouch for vomit observation, which is the only
 * thing these denominators are for.
 *
 * Three declarations of one set, in two runtimes:
 *   • `LANE_SYMPTOM_TYPES.symptomDelta` (generate-signal/detection.ts) — the authority.
 *   • `CORRELATION_SYMPTOM_TYPES` (lib/patternsTiming.ts) — the Patterns panel's mirror.
 *   • `TRIAL_RESPONSE_LOGGED_DAY_TYPES` (lib/dietTrialFacts.ts) — the trial strip's mirror,
 *     the same set ∪ {'meal'} because a meal is a logged day too.
 *
 * The server file is Deno-only and cannot be imported into jest, which is exactly WHY the
 * mirrors are hand-redeclared and exactly why they drift. Before this guard the trial mirror
 * was "kept in sync" by a comment. So the engine's list is read from SOURCE and compared —
 * the same source-scan shape as the §13a membership walk.
 *
 * What a failure means: client and server are computing `loggedDays` over different sets, so
 * `densityComparable` and the C5 density disclosures answer a different question on each side
 * of the wire (the CUL-13 parity). A mirror that drifts TOWARD the fetch union is the specific
 * regression that re-opens the published-reassurance break — hence the explicit cough case.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { CORRELATION_SYMPTOM_TYPES as CLIENT_MIRROR } from '../lib/patternsTiming';

const ROOT = join(__dirname, '..');

/** The string members of an `as const` array literal, comments stripped first — so prose
 *  naming a type (this file is full of it) can never be mistaken for membership. */
function readList(relPath: string, marker: string, terminator = '] as const'): string[] {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`marker moved: ${marker} in ${relPath}`);
  const end = src.indexOf(terminator, start);
  if (end === -1) throw new Error(`terminator moved after ${marker} in ${relPath}`);
  const block = src
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** The engine's COMPARISON-GATE cell — `symptomDelta` inside the LANE_SYMPTOM_TYPES block.
 *  Read from the cell's own line so a change to a DIFFERENT lane cell cannot satisfy it. */
function readSymptomDeltaCell(): string[] {
  const src = readFileSync(join(ROOT, 'supabase/functions/generate-signal/detection.ts'), 'utf8');
  const start = src.indexOf('export const LANE_SYMPTOM_TYPES');
  if (start === -1) throw new Error('LANE_SYMPTOM_TYPES marker moved');
  const cell = src.indexOf('symptomDelta:', start);
  if (cell === -1) throw new Error('symptomDelta cell moved');
  const end = src.indexOf('\n', cell);
  const line = src.slice(cell, end);
  // The cell is `symptomDelta: PRE_TAXONOMY_LANE_TYPES` — an alias, not a literal — so resolve
  // it. A future cell that spells its own literal is read directly.
  if (line.includes('PRE_TAXONOMY_LANE_TYPES') && !line.includes('[')) {
    // The alias block closes on a bare `]`, not `] as const` — passing the wrong terminator
    // silently scanned 94 strings out of the rest of the file and made every assertion here
    // compare against garbage. Caught because the non-vacuity check above failed first.
    return readList('supabase/functions/generate-signal/detection.ts', 'const PRE_TAXONOMY_LANE_TYPES', '\n]');
  }
  return [...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const SERVER_GATE = readSymptomDeltaCell();
const SERVER_FETCH = readList(
  'supabase/functions/generate-signal/detection.ts',
  'export const CORRELATION_SYMPTOM_TYPES',
);

const TRIAL_MIRROR = readList('lib/dietTrialFacts.ts', 'const TRIAL_RESPONSE_LOGGED_DAY_TYPES');

describe('comparison-gate denominator parity (R3, CUL-676)', () => {
  it('both scans are non-vacuous, and the gate set is genuinely NARROWER than the fetch', () => {
    // Anti-vacuity first: a broken scan returning [] would make the equality assertions below
    // trivially satisfiable. The second expectation is the one that keeps this guard honest —
    // if the two sets ever coincide again, every case below stops discriminating and this
    // fails loudly rather than passing quietly.
    expect(SERVER_GATE).toEqual(['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']);
    expect(SERVER_FETCH).toContain('cough');
    expect(SERVER_FETCH.length).toBeGreaterThan(SERVER_GATE.length);
  });

  it('the Patterns mirror is exactly the engine COMPARISON-GATE set', () => {
    expect([...CLIENT_MIRROR]).toEqual(SERVER_GATE);
  });

  it('the trial-response mirror is the comparison-gate set plus meal', () => {
    expect(TRIAL_MIRROR).toEqual([...SERVER_GATE, 'meal']);
  });

  it('no mirror drifts toward the FETCH union — the published-reassurance regression', () => {
    // The specific way this breaks again. `cough` and `sneeze` are typed, labelled and
    // rendered on every client read surface after PR-3a, so a mirror can gain either by
    // looking "complete" — and cough in particular re-opens the break the re-ruling closed:
    // cough-only logged days inflate the trial/reflection denominator, flip densityComparable
    // false→true, and publish a falling comparison the guard was correctly withholding.
    for (const t of [...CLIENT_MIRROR, ...TRIAL_MIRROR]) {
      if (t === 'meal') continue;
      expect(SERVER_GATE).toContain(t);
    }
    expect([...CLIENT_MIRROR, ...TRIAL_MIRROR]).not.toContain('cough');
    expect([...CLIENT_MIRROR, ...TRIAL_MIRROR]).not.toContain('sneeze');
  });
});
