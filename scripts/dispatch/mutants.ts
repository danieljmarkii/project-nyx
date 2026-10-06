// Proves each of the suite's checks by breaking the source it guards (CUL-1615's "each
// check proven by mutation"; CLAUDE.md C-18: a guard is proven by mutation, not by
// reading the test). Each mutant replaces ONE exact string, runs this directory's jest
// suite, expects it RED, and restores the file whatever happens.
//
//   node --experimental-strip-types scripts/dispatch/mutants.ts
//
// Exit 0 when every mutant is killed; 1 when one survives or a mutant's anchor no longer
// matches exactly once (the anchor drifted from the source: fix the mutant, never skip it).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(DIR, '../..');

type Mutant = { check: string; file: string; from: string; to: string };

const MUTANTS: Mutant[] = [
  // The 21:10Z slot arithmetic.
  { check: 'slots are cap minus in flight', file: 'plan.ts', from: 'const rawSlots = cap - inFlight.length;', to: 'const rawSlots = cap - inFlight.length + 1;' },
  { check: 'a parked PR takes no slot', file: 'plan.ts', from: '    if (pr && parkedPrs.has(pr.number)) continue;\n', to: '' },
  { check: 'in flight is deduplicated by issue and branch', file: 'plan.ts', from: 'if (f.issues.some((i) => seenIssue.has(i)) || (f.branch && seenBranch.has(f.branch))) return;', to: 'if (false) return;' },
  { check: 'a stale claim is not live', file: 'plan.ts', from: 'return now - ms(c.at) < DAY || open;', to: 'return true;' },
  { check: 'a first dispatch has one slot', file: 'plan.ts', from: 'firstDispatch ? Math.min(1, rawSlots) : rawSlots', to: 'rawSlots' },
  { check: 'two sub-issues of one parent are two in flight', file: 'plan.ts', from: '      issues: named,', to: "      issues: [...named, ...named.map((i) => input.issues[i]?.parentId ?? '')].filter(Boolean)," },
  { check: 'a combined row obeys rules naming its parts', file: 'plan.ts', from: 'const mine = partsOf(row.id).filter', to: 'const mine = [row.id].filter' },
  // The 084 clash.
  { check: 'the lower PR (or main) keeps a clashing number', file: 'plan.ts', from: '({ number, keeps: h[0], renumbers: h.slice(1) })', to: '({ number, keeps: h[h.length - 1], renumbers: h.slice(0, -1) })' },
  { check: 'a clashing row is held', file: 'plan.ts', from: "if (r.startsWith(`#${state.pr} `) || r === `#${state.pr}`) v.reasons.push", to: 'if (false) v.reasons.push' },
  { check: 'the next migration number is past every reserved one', file: 'plan.ts', from: 'String(top + 1).padStart(3, ', to: 'String(top).padStart(3, ' },
  { check: 'migrations are one at a time', file: 'plan.ts', from: 'used.migrations >= SUB_LIMITS.migrations', to: 'used.migrations > SUB_LIMITS.migrations' },
  // Selection.
  { check: 'a merged row is never proposed', file: 'plan.ts', from: "verdicts.filter((v) => v.row && v.state.kind !== 'merged' && !v.reasons.length)", to: 'verdicts.filter((v) => v.row && !v.reasons.length)' },
  { check: 'an unmerged After PR holds', file: 'plan.ts', from: 'if (!merged(a.row)) v.reasons.push', to: 'if (false) v.reasons.push' },
  { check: 'defect 2: a merged After PR never holds ("waiting on PR-53")', file: 'plan.ts', from: 'if (!merged(a.row)) v.reasons.push', to: 'if (true) v.reasons.push' },
  { check: 'a hotspot an open PR holds holds the row', file: 'plan.ts', from: '.filter(([f]) => f === h ||', to: '.filter(([f]) => false ||' },
  { check: 'merged rows leave Auto', file: 'plan.ts', from: '.map(normRow).filter((r) => !mergedRow(r))', to: '.map(normRow)' },
  { check: 'a live claim holds its row', file: 'plan.ts', from: "if (c && state.kind !== 'open') v.reasons.push", to: 'if (false) v.reasons.push' },
  // The Board's three defects.
  { check: 'defect 1: rows are built from parsed cells', file: 'board.ts', from: 'lines.push(`| ${cell(r.id)} | ${cell(issue)} |', to: "lines.push(`| ${r.rawLine.split('|')[1].trim()} | ${cell(issue)} |" },
  { check: 'a row with no PR number renders a parsable line', file: 'board.ts', from: "${/^(PM|parked)$/.test(r.cell) ? r.cell : '—'}", to: "${cell(r.cell || '—')}" },
  { check: 'defect 3: a merged PR on a path carries ✓', file: 'board.ts', from: '(merged(normRow(id)) ? `${tok} ✓` : tok)', to: '(false ? `${tok} ✓` : tok)' },
  { check: 'the parse refuses "waiting on" a merged PR', file: 'board.ts', from: 'if (w && facts.merged.has(normRow(w[1])))', to: 'if (false)' },
  { check: 'the parse refuses a merged PR with no ✓', file: 'board.ts', from: 'if (facts.merged.has(id) && !m[2])', to: 'if (false)' },
  { check: 'the parse refuses a link tag', file: 'board.ts', from: 'if (/<\\/?(issue|pull-request)\\b/.test(text))', to: 'if (false)' },
  { check: 'the parse refuses a stamp ahead of the clock', file: 'board.ts', from: '> new Date(facts.now).getTime() + 60_000) errors.push(`the stamp', to: '> new Date(facts.now).getTime() + 86_400_000) errors.push(`the stamp' },
  { check: 'the parse refuses a malformed line', file: 'board.ts', from: "if (cells.length !== 3 || !l.endsWith('|'))", to: 'if (false)' },
  // Validation on write and memory.
  { check: 'a launch line needs a session id', file: 'status.ts', from: 'if (!l.session) errors.push', to: 'if (false) errors.push' },
  { check: 'a launch line needs a branch', file: 'status.ts', from: 'if (!l.branch) errors.push', to: 'if (false) errors.push' },
  { check: 'a timestamp ahead of the clock is refused', file: 'status.ts', from: 'if (new Date(t).getTime() > now + 60_000)', to: 'if (false)' },
  { check: 'an Auto row that merged is refused', file: 'status.ts', from: "if (facts.mergedRows.has(r)) errors.push(`Auto:", to: "if (false) errors.push(`Auto:" },
  { check: 'the check-in is read from the routines', file: 'status.ts', from: '.filter((x) => (x.prompt ?? x.message ??', to: '.filter((x) => true || (x.prompt ?? x.message ??' },
  { check: 'memory names a launch never recorded', file: 'status.ts', from: 'if (!known.has(b)) {', to: 'if (false) {' },
  { check: 'memory names a merged Auto row', file: 'status.ts', from: 'if (n) out.push(`Auto: still names', to: 'if (false) out.push(`Auto: still names' },
  { check: 'an issue id never reaches a PR body whole', file: 'status.ts', from: '(keep.includes(m.toUpperCase()) ? m : `${k}\\u2011${n}`)', to: '(keep.includes(m.toUpperCase()) ? m : m)' },
  // The reader.
  { check: 'the Board is never read back as plan', file: 'page.ts', from: 'const plain = stripTags(withoutBoard(rawLines).join', to: 'const plain = stripTags(rawLines.join' },
  { check: 'a merge gate reads past the dots in a version', file: 'page.ts', from: '/Merge gate:\\s*(.*?)(?:\\.(?=\\s|$)|$)/', to: '/Merge gate:\\s*([^.]*)/' },
  { check: 'Linear escapes are undone before a title match', file: 'page.ts', from: 'out.shippedTitle = unescapeMd(stripTags(tagTitle).trim())', to: 'out.shippedTitle = stripTags(tagTitle).trim()' },
];

function suiteGreen(): boolean {
  const r = spawnSync('npx', ['jest', '--silent', 'scripts/dispatch/'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0;
}

if (!suiteGreen()) {
  console.error('the suite is red before any mutant: fix it first');
  process.exit(1);
}

let failed = 0;
for (const m of MUTANTS) {
  const file = path.join(DIR, m.file);
  const original = fs.readFileSync(file, 'utf8');
  const hits = original.split(m.from).length - 1;
  if (hits !== 1) {
    console.log(`ANCHOR  ${m.check} (${m.file}: matched ${hits} times)`);
    failed++;
    continue;
  }
  try {
    fs.writeFileSync(file, original.replace(m.from, m.to));
    const green = suiteGreen();
    console.log(`${green ? 'SURVIVED' : 'killed  '}  ${m.check}`);
    if (green) failed++;
  } finally {
    fs.writeFileSync(file, original);
  }
}
console.log(`${MUTANTS.length - failed} of ${MUTANTS.length} mutants killed`);
process.exit(failed ? 1 : 0);
