// The vet report never carries a care state, a tap, a call or a note (Engines v3 PR-23,
// CUL-1417; docs/nyx-care-state-requirements.md §3.4 and AC 9; critique GAP-27).
//
// WHY. "With your vet" is the owner's answer about her own app, never a clinical fact, and a
// report that printed it would hand a clinician the owner's reading of the vet back as if it
// were the vet's. The report states dated facts (visits, courses, trials, counts with their
// coverage) and nothing an owner tapped. Today nothing in `generate-report` could do otherwise:
// it runs detection itself (report.ts) and never runs the Signal's shell or its care-state step.
// That is a property of an import graph nobody is looking at, which is exactly when it gets lost.
//
// THE RULE, as a scan over every non-test source under `supabase/functions/generate-report/`:
//   · no name of the three care tables (`care_acknowledgements`, `vet_calls`,
//     `vet_call_follow_ups`), in a string or an identifier;
//   · no `careState` identifier, no import of `generate-signal/careState.ts`, and no import of
//     `generate-signal/pipeline.ts` (the one module that runs the step);
//   · and the two generate-signal modules the report DOES import (detection.ts, protein.ts)
//     import neither, so the step cannot ride in on them.
// The allow-set is EMPTY, and the empty set is the assertion (C-32).
//
// WHAT IT DOES NOT CLAIM (C-38):
//   · Syntactic. A name assembled at runtime is invisible to it; `guards/visitReaders.test.ts`
//     registers every dynamic `.from()` with the reason its name cannot reach these tables.
//   · It reads the report's own sources and two named imports, not the whole transitive closure
//     of `lib/` the report reaches; the C-26 closure review covers that.
//   · It cannot see the rendered PDF. The report is rendered from what these sources compute,
//     which is the reason a source scan is enough here.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'supabase/functions/generate-report');
const REPORT_IMPORTS_FROM_SIGNAL = ['supabase/functions/generate-signal/detection.ts', 'supabase/functions/generate-signal/protein.ts'];

const FORBIDDEN: { what: string; re: RegExp }[] = [
  { what: 'a care table', re: /\b(?:care_acknowledgements|vet_calls|vet_call_follow_ups)\b/ },
  { what: 'the careState field', re: /\bcareState\b/ },
  { what: 'the care-state step', re: /from\s+['"][^'"]*generate-signal\/careState(?:\.ts)?['"]|from\s+['"]\.\/careState(?:\.ts)?['"]/ },
  { what: 'the Signal pipeline', re: /from\s+['"][^'"]*generate-signal\/pipeline(?:\.ts)?['"]|from\s+['"]\.\/pipeline(?:\.ts)?['"]/ },
];

/** Every forbidden reference in `src`, comments blanked (a sentence ABOUT the rule is not a breach). */
export function careStateLeaks(src: string): { line: number; what: string }[] {
  const lines = blankComments(src).split('\n');
  const out: { line: number; what: string }[] = [];
  lines.forEach((l, i) => {
    for (const f of FORBIDDEN) if (f.re.test(l)) out.push({ line: i + 1, what: f.what });
  });
  return out;
}

function reportSources(dir = REPORT_DIR): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...reportSources(abs));
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(abs);
  }
  return out;
}

describe('the vet report never carries a care state (AC 9)', () => {
  it('scans real files (non-vacuity: the report\'s entry, its pure layer and its renderer)', () => {
    const rel = reportSources().map((f) => path.relative(ROOT, f));
    for (const f of ['index.ts', 'report.ts', 'render.ts']) {
      expect(rel).toContain(`supabase/functions/generate-report/${f}`);
    }
  });

  it('no report source names a care table, the careState field, the step or the pipeline', () => {
    const hits = reportSources().flatMap((f) =>
      careStateLeaks(fs.readFileSync(f, 'utf8')).map((h) => `${path.relative(ROOT, f)}:${h.line} ${h.what}`),
    );
    expect(hits).toEqual([]);
  });

  it('the generate-signal modules the report imports never import the step', () => {
    for (const rel of REPORT_IMPORTS_FROM_SIGNAL) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(careStateLeaks(src).filter((h) => h.what === 'the care-state step' || h.what === 'the Signal pipeline')).toEqual([]);
    }
  });

  it('the detector sees each breach, and not a comment about one (proven)', () => {
    expect(careStateLeaks(`const x = await sb.from('care_acknowledgements').select('id')`)).toEqual([{ line: 1, what: 'a care table' }]);
    expect(careStateLeaks(`const s = finding.careState?.state`)).toEqual([{ line: 1, what: 'the careState field' }]);
    expect(careStateLeaks(`import { EN9_CARE_STATE_STEP } from '../generate-signal/careState.ts'`).map((h) => h.what)).toContain('the care-state step');
    expect(careStateLeaks(`import { runSignalPipeline } from '../generate-signal/pipeline.ts'`).map((h) => h.what)).toEqual(['the Signal pipeline']);
    expect(careStateLeaks(`// the report never reads vet_calls or careState\nconst a = 1`)).toEqual([]);
  });
});
