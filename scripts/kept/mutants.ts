// Proves each check in kept.test.ts, and the sweep's reading of it, by breaking the source
// it guards (C-18: a guard is proven by mutation, not by reading the test). Each mutant
// replaces ONE exact string, runs the kept and sweep suites, expects them RED, and restores
// the file whatever happens. dispatch's reading is proven in scripts/dispatch/mutants.ts.
//
//   node --experimental-strip-types scripts/kept/mutants.ts
//
// Exit 0 when every mutant is killed; 1 when one survives or an anchor no longer matches
// exactly once (fix the mutant, never skip it).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(DIR, '../..');
type Mutant = { check: string; from: string; to: string; file?: string }; // file: repo-relative, default kept.ts

const MUTANTS: Mutant[] = [
  // The four Done-when fixtures.
  { check: 'a clinical path is stakes (by file name)', from: "stems: ['signal', 'trial',", to: "stems: ['trial'," },
  { check: 'every Edge Function is stakes', from: "prefixes: ['supabase/functions/'] },", to: "prefixes: ['supabase/functions/generate-'] }," },
  { check: 'a mock reaction is taste', from: "{ kept: 'taste', why: 'a reaction to a mock', re: /\\breactions?\\b|\\bR-\\d+\\b/ },", to: '' },
  { check: 'a reaction survives a named round', from: 'if (ratified && r.tasteVisual) continue;', to: "if (ratified && r.kept === 'taste') continue;" },
  { check: 'a forecast overrun is scope', from: 'input.forecast.built > input.forecast.rows', to: 'input.forecast.built > input.forecast.rows + 1' },
  { check: 'a CI change is none (no path rule catches workflows)', from: "prefixes: ['supabase/migrations/'] },", to: "prefixes: ['supabase/migrations/', '.github/'] }," },
  // Labels.
  { check: 'Gate: clinical is stakes', from: "  'gate:clinical': { kept: 'stakes', why: 'clinical (label Gate: clinical)' },\n", to: '' },
  { check: 'Area: Privacy/RLS is stakes', from: "  'area:privacy/rls': { kept: 'stakes', why: 'privacy (label Area: Privacy/RLS)' },\n", to: '' },
  { check: 'Area: Correctness is stakes', from: "  'area:correctness': {", to: "  'area:correctnesss': {" },
  { check: 'Gate: deploy is stakes', from: "  'gate:deploy': {", to: "  'gate:deployy': {" },
  { check: 'GA gate is scope', from: "  'gagate': { kept: 'scope',", to: "  'gagate': { kept: 'stakes'," },
  { check: 'labels ignore case and spacing', from: "const labelKey = (l: string) => l.toLowerCase().replace(/\\s+/g, '');", to: "const labelKey = (l: string) => l.toLowerCase();" },
  { check: 'Live harm alone is not held', from: "  'area:correctness': {", to: "  'liveharm': { kept: 'stakes', why: 'x' },\n  'area:correctness': {" },
  // Paths.
  { check: 'the migration flag is stakes', from: "  if (input.migration) add({ kept: 'stakes', why: 'schema (a migration)' });\n", to: '' },
  { check: 'App Store paths are stakes', from: "prefixes: ['app.json', ", to: 'prefixes: [' },
  { check: 'the widget is stakes', from: "prefixes: ['widgets/'] },", to: "prefixes: ['widgetz/'] }," },
  { check: 'privacy names are stakes', from: "stems: ['consent', 'auth', 'account',", to: "stems: ['auth', 'account'," },
  { check: 'storage names are stakes', from: "'session', 'storage', 'attachment',", to: "'session', 'attachment'," },
  { check: 'money names are stakes', from: "stems: ['monetization', 'entitlement',", to: "stems: ['entitlement'," },
  { check: 'name stems read code dirs only', from: 'const CODE_DIRS = /^(lib|store|constants|hooks|app|components)\\//;', to: 'const CODE_DIRS = /^/;' },
  { check: 'camelCase splits into words', from: ".replace(/([a-z0-9])([A-Z])/g, '$1 $2')", to: '' },
  { check: 'a mock file is taste', from: "if (/^docs\\/.*mock.*\\.html$/i.test(f) || /^docs\\/mocks?\\//.test(f)) out.push({ kept: 'taste', why: 'a mock' });", to: '' },
  { check: 'a named round frees a mock file', from: "if (!(ratified && r.why === 'a mock')) add(r);", to: 'add(r);' },
  { check: 'a named round frees Gate: design', from: "if (r && !(ratified && labelKey(l) === 'gate:design')) add(r);", to: 'if (r) add(r);' },
  { check: 'a spec edit is scope', from: "if (/^docs\\/.+\\.md$/.test(f) && !f.startsWith('docs/sessions/'))", to: 'if (false)' },
  { check: 'a session record is not a spec', from: " && !f.startsWith('docs/sessions/')", to: '' },
  { check: 'brand paths survive a named round', from: "{ kept: 'taste', why: 'brand or a visual system file', prefixes: ['assets/', ", to: "{ kept: 'taste', why: 'a mock', prefixes: ['assets/', " },
  // Text.
  { check: 'picky is clinical', from: '|\\bpicky\\b', to: '' },
  { check: 'reassurance is clinical', from: '|\\breassur\\w*', to: '' },
  { check: 'deletion in any form is stakes', from: '|\\bdelet\\w*', to: '' },
  { check: 'export in any case is stakes', from: '|\\bexport\\w*', to: '' },
  { check: 'share links in text are stakes', from: '|\\bshare[- ]?(links?|tokens?)\\b', to: '' },
  { check: 'a pets cap is money', from: '|\\b(pets?|ai|usage|free|daily|monthly) caps?\\b', to: '' },
  { check: 'money in text is stakes', from: "    why: 'money or Pets > $',\n    re:", to: "    why: 'money or Pets > $',\n    re: /$^/, _r:" },
  { check: 'ALTER TABLE is schema', from: '|\\bALTER TABLE\\b', to: '' },
  { check: 'App-Store is stakes', from: '\\bApp[- ]?Store\\b|', to: '' },
  { check: 'irreversible has a test', from: '|\\bpurge\\w*', to: '' },
  { check: 'a wipe is irreversible', from: '|\\bwip(e|es|ed|ing)\\b', to: '' },
  { check: 'a send is irreversible', from: '|\\bsend(s|ing)? (an? |the )?(emails?|push(es)?|notifications?)\\b', to: '' },
  { check: 'notify every user is irreversible', from: '|\\b(notify|email|message|push to) (all|every)\\b', to: '' },
  { check: 'copy words are not taste (the old keyword test stays gone)', from: '|\\bicons?\\b|', to: '|\\bicons?\\b|\\bstrings?\\b|\\blabels?\\b|' },
  // Uncertain and order.
  { check: 'nothing to read is stakes', from: "    add({ kept: 'stakes', why: 'nothing to read (uncertain counts as kept)' });\n", to: '' },
  { check: 'whitespace is nothing to read', from: '!text.trim()', to: '!text' },
  { check: 'a blank label is nothing to read', from: "const labels = (input.labels ?? []).map((l) => l.trim()).filter(Boolean);", to: 'const labels = input.labels ?? [];' },
  { check: 'a blank file is nothing to read', from: "const files = (input.files ?? []).map((f) => f.trim()).filter(Boolean);", to: 'const files = input.files ?? [];' },
  { check: 'a forecast alone is nothing to read', from: '!text.trim() && !input.migration) {', to: '!text.trim() && !input.migration && !input.forecast) {' },
  { check: 'stakes outranks taste and scope', from: "export const KEPT_ORDER: Kept[] = ['stakes', 'taste', 'scope', 'none'];", to: "export const KEPT_ORDER: Kept[] = ['scope', 'taste', 'stakes', 'none'];" },
  // The reversal rule.
  { check: 'over 10% returns a class', from: 'if (s.reversed / s.calls > REVERSAL_LIMIT) {', to: 'if (s.reversed / s.calls > REVERSAL_LIMIT * 2) {' },
  { check: 'exactly 10% stays a team call', from: 'if (s.reversed / s.calls > REVERSAL_LIMIT) {', to: 'if (s.reversed / s.calls >= REVERSAL_LIMIT) {' },
  { check: 'the window is four weeks', from: 'export const REVERSAL_WINDOW_DAYS = 28;', to: 'export const REVERSAL_WINDOW_DAYS = 30;' },
  { check: 'a moved class keeps its calls', from: 'if (input.backToKept.includes(cls)) add(', to: 'if (false) add(' },
  { check: 'copy returns as taste', from: "const BACK_TO: Record<TeamCallClass, Exclude<Kept, 'none'>> = { copy: 'taste',", to: "const BACK_TO: Record<TeamCallClass, Exclude<Kept, 'none'>> = { copy: 'scope'," },
  { check: 'a docs-only diff is the doc class', from: "files.every((f) => f.startsWith('docs/') || f.endsWith('.md'))", to: 'false' },
  // The sweep reads the module (scripts/sweep/rank.ts).
  { check: 'the sweep plans what is kept', file: 'scripts/sweep/rank.ts', from: "keptFor(c).kept !== 'none'", to: 'false' },
  { check: 'the sweep passes files to the kept list', file: 'scripts/sweep/rank.ts', from: 'keptOf({ labels: c.labels, files: c.files,', to: 'keptOf({ labels: c.labels, files: [],' },
  { check: 'the sweep passes labels to the kept list', file: 'scripts/sweep/rank.ts', from: 'keptOf({ labels: c.labels,', to: 'keptOf({ labels: [],' },
];

function suiteGreen(): boolean {
  const r = spawnSync('npx', ['jest', '--silent', 'scripts/kept/', 'scripts/sweep/'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0;
}

if (!suiteGreen()) {
  console.error('the suite is red before any mutant: fix it first');
  process.exit(1);
}

let failed = 0;
for (const m of MUTANTS) {
  const FILE = m.file ? path.join(ROOT, m.file) : path.join(DIR, 'kept.ts');
  const original = fs.readFileSync(FILE, 'utf8');
  const hits = original.split(m.from).length - 1;
  if (hits !== 1) {
    console.log(`ANCHOR  ${m.check} (matched ${hits} times)`);
    failed++;
    continue;
  }
  try {
    fs.writeFileSync(FILE, original.replace(m.from, m.to));
    const green = suiteGreen();
    console.log(`${green ? 'SURVIVED' : 'killed  '}  ${m.check}`);
    if (green) failed++;
  } finally {
    fs.writeFileSync(FILE, original);
  }
}
console.log(`${MUTANTS.length - failed} of ${MUTANTS.length} mutants killed`);
process.exit(failed ? 1 : 0);
