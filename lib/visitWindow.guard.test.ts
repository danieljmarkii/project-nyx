// H-11's one visit bound, pinned on both sides of the wire until HV-15 (CUL-1170).
//
// `lib/visitWindow.ts` is the rule History, the rundown and the report share: the window
// starts on the day of the latest visit strictly before today, including that day. The
// vet report still carries its own copy, `resolveScope`'s rung 1, because the report is
// not edited while its second-wave deploy is in flight (CUL-1002). Two copies that each
// happen to be right today are exactly the state B-421 grew out of, so this reads the
// report's source and fails the moment its copy stops saying the same thing. The shape
// is `lib/dietTrialDayMath.guard.test.ts`'s: a source scan, because `report.ts` is
// Deno-only and cannot be imported into jest.
//
// WHEN THIS FAILS, it is one of two things:
//   1. The report's rule changed. Then History, the rundown and the report now disagree
//      about "since your visit". Change `lib/visitWindow.ts` in the same PR, or revert.
//   2. HV-15 moved the report onto `lib/visitWindow.ts`. Then this pin has done its job:
//      replace it with an assertion that `report.ts` imports `latestVisitBefore`, and
//      delete the text half.
//
// The second half pins what makes the move possible at all: this module's import graph
// holds nothing Deno cannot load.

/// <reference types="node" />
import { readFileSync } from 'fs';
import { dirname, join, relative } from 'path';

import { blankComments } from '../guards/blankComments';

const ROOT = join(__dirname, '..');
const REPORT = 'supabase/functions/generate-report/report.ts';

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Comments blanked (one pass, C-18) and whitespace collapsed, so a reflowed line or a
 *  new trailing comment moves nothing, while a changed operator does. */
const code = (src: string) => blankComments(src).replace(/\s+/g, ' ');

/** A slice of `src` between two markers, or a thrown error naming the marker that moved.
 *  Slicing is what keeps a match from being satisfied by the same text elsewhere in a
 *  2,000-line file (C-4: slice the object under test and anchor the match). */
function between(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  if (start === -1) throw new Error(`marker moved in ${REPORT}: ${from}`);
  const end = src.indexOf(to, start + from.length);
  if (end === -1) throw new Error(`marker moved in ${REPORT}: ${to} (after ${from})`);
  return src.slice(start, end);
}

describe('the vet report still carries the same visit bound (report.ts resolveScope, rung 1)', () => {
  const src = read(REPORT);
  const resolveScope = between(src, 'export function resolveScope(', '\nfunction scopeFromRange(');
  const rung1 = code(between(resolveScope, '// Rung 1', '// Rung 2'));
  const preamble = code(between(resolveScope, 'export function resolveScope(', '// Owner override'));
  const dayNumber = code(between(src, 'function dayNumber(', '\n}'));

  it('today is the owner’s local day', () => {
    expect(preamble).toContain('const todayKey = localDayKey(input.now, tz)');
    expect(preamble).toContain('const todayNum = dayNumber(todayKey)');
  });

  it('a visit and today are compared as whole-day numbers, never as text', () => {
    expect(rung1).toContain('const vNum = dayNumber(v.visitedAt)');
    expect(dayNumber).toContain('Date.parse(`${dayKey}T00:00:00Z`)');
    expect(dayNumber).toContain('Math.round(ms / MS_PER_DAY)');
  });

  it('a visit today or later anchors nothing (strictly before today)', () => {
    // The mutation this exists for: `>=` becoming `>` would let a visit saved today
    // restart the report's window while History's and the rundown's did not.
    expect(rung1).toContain('if (vNum === null || vNum >= todayNum) continue');
  });

  it('the latest such visit wins', () => {
    expect(rung1).toContain(
      'if (lastVisit === null || vNum > (dayNumber(lastVisit) ?? -Infinity)) lastVisit = v.visitedAt',
    );
  });

  it('the window starts ON the visit’s day and runs to today', () => {
    expect(rung1).toContain('const startNum = dayNumber(lastVisit) as number');
    expect(rung1).toContain("return scopeFromRange('since_visit', startNum, todayNum,");
  });
});

// ── lib/visitWindow.ts stays loadable by Deno ───────────────────────────────────

/** Every import specifier in a source file, comments blanked first so prose quoting an
 *  import is never read as one. `import type` counts: Deno resolves type imports too. */
function importSpecifiers(src: string): string[] {
  const blanked = blankComments(src);
  return [...blanked.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g)].map(
    (m) => m[1] ?? m[2],
  );
}

/** A relative specifier Deno can load: it names its `.ts` file. */
const DENO_LOADABLE = /^\.\.?\/[\w./-]+\.ts$/;

/**
 * The whole relative import graph from `entry`: a module this one imports that later
 * grows a React Native import breaks the Edge Function just as surely. Only specifiers
 * Deno could load are followed; the rest are recorded, so the assertion below names them
 * rather than the walk crashing on a file it cannot open.
 */
function importGraph(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.shift() as string;
    if (seen.has(rel)) continue;
    const specifiers = importSpecifiers(read(rel));
    seen.set(rel, specifiers);
    for (const s of specifiers) {
      if (DENO_LOADABLE.test(s)) {
        queue.push(relative(ROOT, join(ROOT, dirname(rel), s)).split('\\').join('/'));
      }
    }
  }
  return seen;
}

describe('lib/visitWindow.ts imports nothing Deno cannot load (HV-15 imports it unchanged)', () => {
  it('walks the real graph (non-vacuity)', () => {
    expect([...importGraph('lib/visitWindow.ts').keys()]).toEqual(
      expect.arrayContaining(['lib/visitWindow.ts', 'lib/utils.ts']),
    );
  });

  it('every import is a relative path that spells its .ts extension', () => {
    // A bare specifier ('react-native', 'expo-sqlite', 'zustand') does not resolve in the
    // Edge Function graph, and Deno will not resolve an extensionless relative one.
    const offenders = [...importGraph('lib/visitWindow.ts').entries()].flatMap(
      ([file, specifiers]) =>
        specifiers.filter((s) => !DENO_LOADABLE.test(s)).map((s) => `${file} → ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
