// A saved report never changes, so nothing an owner reads may offer to update one (Vet report v2
// PR-21, CUL-2301; spec §11.3; critique WBC-4).
//
// WBC-4's counterexample: Jordan taps "Update this report", believes the copy Dr. Chen already
// has will refresh, and skips re-sending. The library's action is "New report through today",
// with "The Oct 30 copy stays exactly as sent" beneath it. This guard reds on the banned phrase
// anywhere in owner-facing source, whatever surface reintroduces it.
//
// SCOPE, STATED (C-38): a source scan of string literals and code with comments blanked, over the
// app's roots and the report function. It cannot see copy assembled from fragments ("Update " +
// "this report"), and it bans the phrase, not every way of saying it.

import * as fs from 'fs';
import * as path from 'path';
import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';

const REPO_ROOT = path.join(__dirname, '..');
const ROOTS = ['app', 'components', 'lib', 'hooks', 'store', 'constants', path.join('supabase', 'functions')];
const SOURCE_FILE = /\.tsx?$/;
const NOT_SOURCE = /\.test\.tsx?$|\.testutil\.ts$|\.d\.ts$/;
const BANNED = /update\s+(this|the|your)\s+report/i;

function walk(root: string, rel: string, out: string[]): void {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) walk(root, childRel, out);
    else if (SOURCE_FILE.test(entry.name) && !NOT_SOURCE.test(entry.name)) out.push(childRel);
  }
}

function violations(root: string): string[] {
  const files: string[] = [];
  for (const r of ROOTS) walk(root, r, files);
  return files.flatMap((rel) =>
    blankComments(fs.readFileSync(path.join(root, rel), 'utf8'))
      .split('\n')
      .flatMap((line, i) => (BANNED.test(line) ? [`${rel.split(path.sep).join('/')}:${i + 1}`] : [])),
  );
}

describe('no owner-facing copy offers to update a saved report (WBC-4)', () => {
  it('the live tree says it nowhere', () => {
    expect(violations(REPO_ROOT)).toEqual([]);
  });

  it('a surface that says it reds; a comment explaining the ban does not', () => {
    const root = createFixtureRoot('reportUpdateCopy');
    try {
      writeFixture(root, 'app/reports/bad.tsx', "export const LABEL = 'Update this report';\n");
      writeFixture(root, 'lib/fine.ts', "// never say 'Update this report' (WBC-4)\nexport const LABEL = 'New report through today';\n");
      expect(violations(root)).toEqual(['app/reports/bad.tsx:1']);
    } finally {
      removeFixtureRoot(root);
    }
  });
});
