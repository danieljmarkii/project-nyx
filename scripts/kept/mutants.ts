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
  { check: 'every server file is stakes', from: "else if (f.startsWith('supabase/')) push(", to: "else if (f.startsWith('supabase/functions/generate')) push(" },
  { check: 'a mock reaction is taste', from: "{ kept: 'taste', why: 'a reaction to a mock', re: /\\breactions?\\b|\\bR-\\d+\\b/ },", to: '' },
  { check: 'a reaction survives a named round', from: 'if (ratified && r.tasteVisual) continue;', to: "if (ratified && r.kept === 'taste') continue;" },
  { check: 'a forecast overrun is scope', from: 'input.forecast.built > input.forecast.rows', to: 'input.forecast.built > input.forecast.rows + 1' },
  { check: 'a CI change is none (only deploy workflows keep)', from: "(deploy|release|submit|eas|store|testflight|prod)/i.test(f)", to: "/i.test(f)" },
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
  { check: 'App Store paths are stakes', from: "if (/^(app\\.json|eas\\.json|", to: "if (/^(eas\\.json|" },
  { check: 'the widget is stakes', from: "if (f.startsWith('widgets/')) push(", to: "if (f.startsWith('widgetz/')) push(" },
  { check: 'privacy names are stakes', from: "stems: ['consent', 'auth', 'account',", to: "stems: ['auth', 'account'," },
  { check: 'storage names are stakes', from: "'session', 'storage', 'attachment',", to: "'session', 'attachment'," },
  { check: 'money names are stakes', from: "stems: ['monetization', 'entitlement',", to: "stems: ['entitlement'," },
  { check: 'product code keeps by default', from: "else push('stakes', `product code the list cannot place ${UNCERTAIN}`);", to: '' },
  { check: 'a screen keeps as taste by default', from: "if (!ratified) push('taste', `a screen or component outside a named mock round ${UNCERTAIN}`);", to: '' },
  { check: 'a script outside the tooling folders keeps', from: "push('stakes', `a script outside the tooling folders ${UNCERTAIN}`);", to: '' },
  { check: 'a file with no folder keeps', from: "      add({ kept: 'stakes', why: `a file named without its folder ${UNCERTAIN}` });", to: '' },
  { check: 'a file-less input keeps', from: "add({ kept: 'stakes', why: `no files named, so the surface is unread ${UNCERTAIN}` });", to: '' },
  { check: 'a round must be named', from: 'const ratified = ROUND.test(input.ratifiedRound ?? \'\');', to: "const ratified = !!input.ratifiedRound?.trim();" },
  { check: 'UI mechanics are a team call', from: "'lib/utils.ts', 'lib/haptics.ts',", to: "'lib/utils.ts'," },
  { check: 'root files are placed paths', from: "const isBare = (f: string) => !f.includes('/') && !ROOT_FILES.test(f);", to: "const isBare = (f: string) => !f.includes('/');" },
  { check: 'pathsIn keeps the leading dot', from: "const WRAP = /^[\\s*_`'\"<>()[\\]{}|!?,;:", to: "const WRAP = /^[\\s*_`'\"<>()[\\]{}|!?.,;:" },
  { check: 'pathsIn strips a line anchor', from: ".replace(/#L\\d+(-L?\\d+)?/g, '')", to: '' },
  { check: 'the sweep reads the description', file: 'scripts/sweep/rank.ts', from: '[c.title, c.description, ', to: '[c.title, ' },
  { check: 'camelCase splits into words', from: ".replace(/([a-z0-9])([A-Z])/g, '$1 $2')", to: '' },
  { check: 'a mock file is taste', from: "if (/^docs\\/.*mock.*\\.html$/i.test(f) || /^docs\\/mocks?\\//.test(f)) push('taste', 'a mock');", to: '' },
  { check: 'a named round frees a mock file', from: "if (!(ratified && r.why === 'a mock')) add(r);", to: 'add(r);' },
  { check: 'a named round frees Gate: design', from: "if (r && !(ratified && labelKey(l) === 'gate:design')) add(r);", to: 'if (r) add(r);' },
  { check: 'a spec edit is scope', from: "push('scope', 'a Tier-2 doc edit');", to: '' },
  { check: 'a session record is not a spec', from: " && !f.startsWith('docs/sessions/')", to: '' },
  { check: 'brand paths survive a named round', from: "push('taste', 'brand or a visual system file');", to: "push('taste', 'a mock');" },
  // Text.
  { check: 'picky is clinical', from: '|\\bpicky\\b', to: '' },
  { check: 'reassurance is clinical', from: '|\\breassur\\w*', to: '' },
  { check: 'deletion in any form is stakes', from: '|\\bdelet\\w*', to: '' },
  { check: 'export in any case is stakes', from: '|\\bexport\\w*', to: '' },
  { check: 'share links in text are stakes', from: '|\\bshare[- ]?(links?|tokens?|sheets?)\\b', to: '' },
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
  { check: 'nothing to read is stakes', from: "add({ kept: 'stakes', why: `nothing to read ${UNCERTAIN}` });", to: "add({ kept: 'stakes', why: `no files named, so the surface is unread ${UNCERTAIN}` });" },
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
