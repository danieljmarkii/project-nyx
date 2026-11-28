// The self merge replay (CUL-2874): the deny list's verdict over every squash merge on
// main in a window, as if each had been judged by it. CUL-2874's PR carries the table this
// prints; PR-09's two week look (CUL-2883) runs it again.
//
//   node --experimental-strip-types scripts/steward/selfMerge-replay.ts --since 2026-10-26 --labels <dir> [--json <out>]
//
// <dir> holds one file per held label, the issue numbers that carry it, whitespace
// separated: clinical.txt (Gate: clinical), liveharm.txt, privacy.txt (Gate: privacy and
// Area: Privacy/RLS), correctness.txt (Area: Correctness). They are read from Linear by
// the session that runs this; the script reads no network.
//
// For each merge it reports: the old rule (a production line: deploys, or edits a gate
// file), the new verdict and its reasons, and whether a later merge reverted or fixed it.
// Section two lists every merge behind a Gate: clinical or Live harm issue, or that
// touched owner or vet facing health text, with its side.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { CLINICAL_WORDS } from '../kept/kept.ts';
import { readLanding } from './landing.ts';
import { selfMerge } from './selfMerge.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i < 0 ? undefined : args[i + 1];
};
const since = opt('--since');
const labelsDir = opt('--labels');
if (!since || !labelsDir) {
  console.error('usage: selfMerge-replay.ts --since <date> --labels <dir> [--json <out>]');
  process.exit(3);
}
const git = (a: string[]) => execFileSync('git', ['-c', 'core.quotePath=false', ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const ids = (f: string) => new Set(fs.readFileSync(path.join(labelsDir, f), 'utf8').split(/\s+/).filter(Boolean).map((n) => `CUL-${n}`));
const LABELS: [string, Set<string>][] = [
  ['Gate: clinical', ids('clinical.txt')],
  ['Live harm', ids('liveharm.txt')],
  ['Gate: privacy', ids('privacy.txt')],
  ['Area: Correctness', ids('correctness.txt')],
];

// The old rule's gate paths (merge-check.sh before CUL-2874).
const OLD_GATE = /^\.claude\/hooks\/|^\.claude\/settings[^/]*\.json$|^\.github\/workflows\/edge-deploy\.yml$|^scripts\/deploy-edge\.sh$|^scripts\/edge-deploy\/|^scripts\/steward\/(merge-check\.sh|deploys(-cli)?\.ts|rollback(-cli)?\.ts)$|^\.claude\/skills\/steward\/SKILL\.md$|^\.claude\/commands\/(dispatch|wrap)\.md$/;
const PRODUCT = /^(app|components|constants|hooks|lib|store|supabase|widgets)\//;

type Row = {
  sha: string;
  pr: string;
  subject: string;
  issues: string[];
  labels: string[];
  files: number;
  deploys: string[];
  deployUnread: string;
  oldWord: boolean;
  verdict: 'open' | 'held';
  reasons: string[];
  healthText: boolean;
  laterFix: string[];
};

const log = git(['log', '--first-parent', `--since=${since}`, '--format=%H%x1f%s%x1f%b%x1e', 'origin/main']).split('\x1e').map((s) => s.trim()).filter(Boolean);
const rows: Row[] = [];
for (const entry of log) {
  const [sha, subject, body] = entry.split('\x1f');
  const pr = (subject.match(/\(#(\d+)\)\s*$/) ?? [])[1] ?? '';
  const text = `${subject}\n${body ?? ''}`;
  // The issues the PR finishes are the ones its title and body name; a trailer's URL is not one.
  const issues = [...new Set(text.match(/CUL-\d+/g) ?? [])];
  const labels = [...new Set(LABELS.filter(([, s]) => issues.some((i) => s.has(i))).map(([l]) => l))];
  const { files, changedLines } = readLanding(`${sha}^`, sha);
  const d = spawnSync('node', ['--experimental-strip-types', '--no-warnings', path.join(ROOT, 'scripts/steward/deploys-cli.ts'), `${sha}^`, sha], { cwd: ROOT, encoding: 'utf8' });
  const deploys = d.status === 0 ? d.stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[0]) : [];
  const deployUnread = d.status === 0 ? '' : (d.stderr.trim().split('\n')[0] || `exit ${d.status}`);
  const r = selfMerge({ files, deploys, deployUnread: deployUnread || undefined, changedLines, labels, applied: null });
  // Any changed product line with a clinical word, quoted or not (JSX text has no quote).
  const healthText = changedLines.some((l) => PRODUCT.test(l.file) && CLINICAL_WORDS.test(l.line));
  rows.push({
    sha,
    pr,
    subject,
    issues,
    labels,
    files: files.length,
    deploys,
    deployUnread,
    oldWord: deploys.length > 0 || Boolean(deployUnread) || files.some((f) => OLD_GATE.test(f)),
    verdict: r.verdict,
    reasons: r.reasons,
    healthText,
    laterFix: [],
  });
  process.stderr.write('.');
}
process.stderr.write('\n');

// A later merge that reverts or rolls back one, or names it while fixing.
for (const r of rows) {
  if (!r.pr) continue;
  for (const later of rows) {
    if (later === r) continue;
    const t = later.subject;
    const named = new RegExp(`#${r.pr}\\b`).test(t) || new RegExp(`${r.sha.slice(0, 7)}`).test(t);
    if (named && /\b(revert|rollback|roll back|hotfix|fix(es|ed)?|regression|repair|restore)/i.test(t)) r.laterFix.push(`#${later.pr}`);
  }
}

if (opt('--json')) fs.writeFileSync(opt('--json') as string, JSON.stringify(rows, null, 1));

const open = rows.filter((r) => r.verdict === 'open');
const held = rows.filter((r) => r.verdict === 'held');
const cat = (why: string) => {
  if (/the gate's own files/.test(why)) return 'the gate\'s own files';
  if (/migration/.test(why)) return 'a migration';
  if (/labelled|labels were not/.test(why)) return 'a held label';
  if (/changed string holds a clinical word/.test(why)) return 'a clinical string in a changed line';
  if (/^supabase\/functions\/|Edge Function|server configuration/.test(why)) return 'an Edge Function or supabase/';
  if (/clinical/.test(why)) return 'a clinical path';
  if (/privacy|Storage|deletion|export|share/.test(why)) return 'a privacy path';
  if (/money|Pets/.test(why)) return 'money';
  if (/App Store|legal/.test(why)) return 'App Store or legal';
  if (/cannot place|does not know|without its folder|outside the tooling/.test(why)) return 'a path the list cannot place';
  if (/deploy/.test(why)) return 'a deploy unread or owed';
  return 'other stakes';
};
const tally = new Map<string, number>();
for (const r of held) for (const c of new Set(r.reasons.map(cat))) tally.set(c, (tally.get(c) ?? 0) + 1);

const out: string[] = [];
out.push(`Replay: ${rows.length} squash merges on main since ${since}.`, '');
out.push('| | merges | of which deploy |', '|---|---|---|');
out.push(`| would self merge | ${open.length} | ${open.filter((r) => r.deploys.length).length} |`);
out.push(`| held for the PM's word | ${held.length} | ${held.filter((r) => r.deploys.length || r.deployUnread).length} |`);
out.push(`| needed a typed word under the old rule | ${rows.filter((r) => r.oldWord).length} | |`);
out.push(`| needed one then, self merge now | ${open.filter((r) => r.oldWord).length} | |`);
out.push(`| self merged then, held now | ${held.filter((r) => !r.oldWord).length} | |`);
out.push('', 'Held, by reason (a merge counts once per reason):', '', '| reason | merges |', '|---|---|');
for (const [c, n] of [...tally].sort((a, b) => b[1] - a[1])) out.push(`| ${c} | ${n} |`);
out.push('', 'Reverted or fixed by a later merge:', '', '| PR | fixed by | side | why |', '|---|---|---|---|');
for (const r of rows.filter((x) => x.laterFix.length)) out.push(`| #${r.pr} | ${r.laterFix.join(', ')} | ${r.verdict} | ${r.reasons[0] ?? '—'} |`);
out.push('', '**Section two: the changes that mattered** (behind a Gate: clinical or Live harm issue, or touching owner or vet facing health text):', '');
const mattered = rows.filter((r) => r.labels.includes('Gate: clinical') || r.labels.includes('Live harm') || r.healthText);
out.push(`${mattered.length} merges; on the self merge side: ${mattered.filter((r) => r.verdict === 'open').length}.`, '');
out.push('| PR | why it mattered | side | first reason |', '|---|---|---|---|');
for (const r of mattered) {
  const why = [r.labels.filter((l) => l === 'Gate: clinical' || l === 'Live harm').join(', '), r.healthText ? 'health text' : ''].filter(Boolean).join('; ');
  out.push(`| #${r.pr} | ${why} | ${r.verdict} | ${(r.reasons[0] ?? '—').replace(/\|/g, '\\|')} |`);
}
out.push('', 'Would self merge:', '', '| PR | title | deploys |', '|---|---|---|');
for (const r of open) out.push(`| #${r.pr} | ${r.subject.replace(/\(#\d+\)\s*$/, '').replace(/\|/g, '\\|')} | ${r.deploys.join(', ') || '—'} |`);
console.log(out.join('\n'));
