/**
 * Client==server parity for the logged-day / density DENOMINATORS (R3, CUL-676).
 *
 * Three declarations of one set, in two runtimes:
 *   • `CORRELATION_SYMPTOM_TYPES` (generate-signal/detection.ts) — the engine's fetch union,
 *     and by construction the set its denominators count (enforced by `isFetchedSymptom`).
 *   • `CORRELATION_SYMPTOM_TYPES` (lib/patternsTiming.ts) — the Patterns panel's mirror.
 *   • `TRIAL_RESPONSE_LOGGED_DAY_TYPES` (lib/dietTrialFacts.ts) — the trial strip's mirror,
 *     which is the same set ∪ {'meal'} because a meal is a logged day too.
 *
 * The server file is Deno-only and cannot be imported into jest, which is exactly WHY the
 * mirrors are hand-redeclared and exactly why they drift. Before this guard the trial mirror
 * was "kept in sync" by a comment. So the engine's list is read from SOURCE and compared —
 * the same source-scan shape as the §13a membership walk.
 *
 * What a failure means: the client and the server are computing `loggedDays` over different
 * sets, so `densityComparable` and the C5 density disclosures are answering a different
 * question on each side of the wire — a silent, per-surface disagreement about how
 * well-observed the same window was (the CUL-13 parity, one leaf wider).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { CORRELATION_SYMPTOM_TYPES as CLIENT_MIRROR } from '../lib/patternsTiming';

const ROOT = join(__dirname, '..');

/** The string members of an `as const` array literal, comments stripped first — so prose
 *  naming a type (this file is full of it) can never be mistaken for membership. */
function readList(relPath: string, marker: string): string[] {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`marker moved: ${marker} in ${relPath}`);
  const end = src.indexOf('] as const', start);
  if (end === -1) throw new Error(`terminator moved after ${marker} in ${relPath}`);
  const block = src
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const SERVER_FETCH = readList(
  'supabase/functions/generate-signal/detection.ts',
  'export const CORRELATION_SYMPTOM_TYPES',
);

const TRIAL_MIRROR = readList('lib/dietTrialFacts.ts', 'const TRIAL_RESPONSE_LOGGED_DAY_TYPES');

describe('logged-day denominator parity (R3, CUL-676)', () => {
  it('the scan is not vacuous — it finds the pre-taxonomy five in the engine list', () => {
    // Anti-vacuity first: every assertion below compares against SERVER_FETCH, so a broken
    // scan returning [] would make the rest trivially satisfiable in one direction.
    expect(SERVER_FETCH).toEqual(expect.arrayContaining(['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction']));
    expect(SERVER_FETCH).toContain('cough');
  });

  it('the Patterns mirror is exactly the engine fetch union', () => {
    expect([...CLIENT_MIRROR]).toEqual(SERVER_FETCH);
  });

  it('the trial-response mirror is the engine fetch union plus meal', () => {
    expect(TRIAL_MIRROR).toEqual([...SERVER_FETCH, 'meal']);
  });

  it('no mirror carries a type the engine does not fetch (the sneeze trap)', () => {
    // The discriminating direction. `sneeze` is TYPED, LABELLED and rendered on every client
    // read surface after PR-3a — so a mirror can gain it by looking complete, while the
    // server never counts a sneeze day because it never fetches one. That asymmetry is what
    // makes "just keep the lists the same" insufficient and this test necessary.
    for (const t of [...CLIENT_MIRROR, ...TRIAL_MIRROR]) {
      if (t === 'meal') continue;
      expect(SERVER_FETCH).toContain(t);
    }
  });
});
