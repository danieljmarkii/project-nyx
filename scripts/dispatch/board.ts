// The Board dispatch writes on the plan page, and the parse that refuses a bad one
// (CUL-1615, scope items 2 and 3). Pure.
//
// Two shapes. D4 ("do you open the Board on the page, or read the digests?") was ruled
// the digests on 2026-10-06 (CUL-1622), so `digest` is the CLI's default; `table` stays
// for a run that asks for it:
//   - `table`: today's Board with its three 2026-10-05 defects designed out. Every line is
//     built from parsed cells (no link tag can be split: `| 12 | </pull-request> |`);
//     "waiting on" names only an unmerged PR or the hold itself, never a merged one (PR-61
//     "waiting on PR-53"); every merged PR on a critical path carries its ✓ (the bare
//     "to GA" path that lost five).
//   - `digest`: six lines in the PM's words (Needs you, Running, Next, Unblock, For you,
//     Waves done), no table, no critical-path reprint, plain ids.
// Either way the section is replaced whole, and nothing in it is a link tag.

import { normRow, type RowId } from './page.ts';
import type { Plan, Verdict } from './plan.ts';

export type BoardShape = 'table' | 'digest';

export type BoardInput = {
  plan: Plan;
  now: string; // the clock, read in the same turn (`date -u`)
  shape: BoardShape;
  unblock?: string[]; // this run's unapplied U lines, one clause each (judgment, from step 5b)
  index?: string; // the ruling index issue, `CUL-NNN`
};

const plainIds = (s: string) => s.replace(/<(issue|pull-request)\b[^>]*>([\s\S]*?)<\/\1>/g, '$2');
const cell = (s: string) => plainIds(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const md = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

// The hold in five words or fewer, for a Board cell.
export function shortReason(reason: string): string {
  const rules: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^after PR-(\S+), not merged/, (m) => `PR-${m[1]}`],
    [/^after (PR-[\w]+)[^"]* in "/, (m) => `${m[1]} (in order)`],
    [/^one at a time with (PR-\w+)/, (m) => `${m[1]} (one at a time)`],
    [/^a live claim on (CUL-\d+)/, (m) => `a claim on ${m[1]}`],
    [/^hotspot (\S+) is held by (#\d+)/, (m) => `${m[2]} (${m[1].split('/').filter(Boolean).pop()})`],
    [/^hotspot (\S+) is held by ([^,]+)/, (m) => m[2]],
    [/^a ruling: "(.*)"/, (m) => `ruling: ${m[1].split(/\s+/).slice(0, 3).join(' ')}`],
    [/^a PM action: "(.*)"/, (m) => `you: ${m[1].replace(/\*/g, '').split(/\s+/).slice(0, 3).join(' ')}`],
    [/^after (CUL-\d+), not done/, (m) => m[1]],
    [/^a release gate/, () => 'the release gate'],
    [/^a GA gate/, () => 'a GA gate'],
    [/^a partial or conditional After/, () => 'a partial After'],
    [/^a lane or group/, () => 'a group of work'],
    [/^its issue waits: \S+ is blocked by (CUL-\d+)/, (m) => m[1]],
    [/^its issue says it waits/, () => 'its issue (a comment)'],
    [/^waiting on the PM: /, () => 'the PM queue (full)'],
    [/^writes production: /, () => 'production writes (full)'],
    [/^migrations: /, () => 'the migration slot'],
    [/^migration (\d+) clashes/, (m) => `renumbering migration ${m[1]}`],
    [/^unmatched/, () => 'an unmatched shipped title'],
    [/^running since/, () => 'running'],
  ];
  for (const [re, f] of rules) {
    const m = re.exec(reason);
    if (m) return f(m);
  }
  return reason.split(/\s+/).slice(0, 5).join(' ');
}

function stateCell(v: Verdict): string {
  switch (v.state.kind) {
    case 'merged':
      return `✓ #${v.state.pr}`;
    case 'open':
      return `in review #${v.state.pr}`;
    case 'parked':
      return `parked #${v.state.pr}`;
    case 'running':
      return `running (since ${md(v.state.since)})`;
  }
  if (v.ready) return 'ready';
  return `waiting on ${shortReason(v.reasons[0] ?? 'something unread')}`;
}

function waveLines(plan: Plan): { wave: string; done: number; of: number }[] {
  const out: { wave: string; done: number; of: number }[] = [];
  for (const r of plan.page.rows) {
    if (!r.id) continue;
    let w = out.find((x) => x.wave === r.wave);
    if (!w) out.push((w = { wave: r.wave, done: 0, of: 0 }));
    w.of++;
    if (plan.verdicts.find((v) => v.row === r.id)?.state.kind === 'merged') w.done++;
  }
  return out;
}

const list = (xs: string[]) => (xs.length ? xs.join('; ') : 'nothing');

function heads(plan: Plan) {
  const live = plan.verdicts.filter((v) => v.row && v.state.kind !== 'merged');
  const running = live.filter((v) => v.state.kind === 'running').map((v) => `PR-${v.row} (${v.issue}, since ${md((v.state as { since: string }).since)})`);
  const waiting = live
    .filter((v) => v.state.kind === 'open' || v.state.kind === 'parked')
    .map((v) => `PR-${v.row} (#${(v.state as { pr: number }).pr}${v.state.kind === 'parked' ? ', parked' : ''}${v.flags.filter((f) => f.startsWith('merge gate')).map((f) => `, ${f}`).join('')})`);
  const ready = [
    ...plan.proposal.map((r) => `PR-${r} (proposed)`),
    ...plan.overCap.map((r) => `PR-${r} (over the cap)`),
  ];
  // "Then": held rows whose only reasons are unmerged PRs in After.
  const then = live
    .filter((v) => !v.ready && v.state.kind === 'none' && v.reasons.length && v.reasons.every((x) => /^after PR-\S+, not merged/.test(x)))
    .map((v) => `PR-${v.row} after ${v.reasons.map((x) => /^after (PR-\S+),/.exec(x)![1]).join(', ')}`);
  const forYou = plan.pmHolds.slice(0, 3).map((h) => `${cell(h.text)} (frees ${h.freesOutright.length})`);
  return { running, waiting, ready, then, forYou };
}

// Every merged PR on a critical path carries ✓, every unmerged one carries none.
export function markPath(text: string, merged: (row: RowId) => boolean): string {
  return cell(text)
    .replace(/(\bPR-(\d{2}[a-z]?))(?: ✓)?/g, (_m, tok: string, id: string) => (merged(normRow(id)) ? `${tok} ✓` : tok))
    .replace(/\.\s*Shipped [^.]*\.?$/, '');
}

export function renderBoard(input: BoardInput): string {
  const { plan, now, shape } = input;
  const h = heads(plan);
  const unblock = input.unblock?.length ? input.unblock.map(cell).join('; ') : 'nothing';
  const forYou = h.forYou.length ? `${h.forYou.join('; ')}${input.index ? ` → ${input.index}` : ''}` : 'nothing';
  const stamp = `_Generated by /dispatch at ${now}, replaced whole every run. Write guidance in the build notes, never here._`;
  if (shape === 'digest') {
    const waves = waveLines(plan).map((w) => (w.done === w.of ? `${cell(w.wave)} ✓` : `${cell(w.wave)}: ${w.done} of ${w.of}`));
    return [
      '## Board',
      '',
      stamp,
      '',
      `* **Needs you:** ${list([...h.waiting, ...(plan.proposal.length ? [`a pick: ${plan.proposal.map((r) => `PR-${r}`).join(', ')}`] : [])])}`,
      `* **Running:** ${list(h.running)}`,
      `* **Next:** ${list([...h.ready, ...h.then])}`,
      `* **Unblock:** ${unblock}`,
      `* **For you:** ${forYou}`,
      `* **Waves done:** ${waves.join('; ')}`,
      '',
    ].join('\n');
  }
  const merged = (r: RowId) => plan.verdicts.find((v) => v.row === r || v.row.split(' + ').includes(r))?.state.kind === 'merged';
  const lines = ['## Board', '', stamp, ''];
  lines.push(`* **Running:** ${list(h.running)}`);
  lines.push(`* **Waiting on you:** ${list(h.waiting)}`);
  lines.push(`* **Ready:** ${list(h.ready)}`);
  lines.push(`* **Then:** ${list(h.then)}`);
  lines.push(`* **Unblock:** ${unblock}`);
  lines.push(`* **For you:** ${forYou}`);
  lines.push('', '| PR | Issue | State |', '| -- | -- | -- |');
  let wave: string | undefined;
  const waves = waveLines(plan);
  for (const r of plan.page.rows) {
    if (r.wave !== wave) {
      wave = r.wave;
      const w = waves.find((x) => x.wave === wave);
      if (w) lines.push(`| **${cell(wave)}** | | ${w.done === w.of ? '✓ shipped' : `in progress: ${w.done} of ${w.of} merged`} |`);
    }
    const v = plan.verdicts.find((x) => x.row === r.id && x.issue === r.issues[0] && x.what === r.what);
    const issue = r.issues.length ? r.issues.join(' + ') : '—';
    if (!r.id) {
      // Only the grammar's own non-row cells are printed; anything else (`?`, an unreadable
      // cell) is `—`, so the Board the renderer writes always parses.
      lines.push(`| ${/^(PM|parked)$/.test(r.cell) ? r.cell : '—'} | ${cell(issue)} | not a row |`);
      continue;
    }
    lines.push(`| ${cell(r.id)} | ${cell(issue)} | ${v ? cell(stateCell(v)) : 'unread'} |`);
  }
  lines.push('');
  if (plan.page.pathLines.length)
    lines.push(`**Critical paths:** ${plan.page.pathLines.map((p) => `${cell(p.label.replace(/^Critical path\s*/, '').replace(/^\((.*)\)$/, '$1')) || 'main'}: ${markPath(p.text, merged)}`).join(' · ')}`, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------
// Validation on write (scope item 3): a Board that does not parse is never written.

export type BoardFacts = { now: string; merged: Set<RowId>; rows: Set<RowId> };

export function validateBoard(text: string, facts: BoardFacts): string[] {
  const errors: string[] = [];
  const lines = text.split('\n');
  if (lines[0] !== '## Board') errors.push('the first line is not "## Board"');
  const stamp = /^_Generated by \/dispatch at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z), replaced whole every run\./.exec(lines.find((l) => l.startsWith('_Generated')) ?? '');
  if (!stamp) errors.push('no generated stamp with a UTC time');
  else if (new Date(stamp[1]).getTime() > new Date(facts.now).getTime() + 60_000) errors.push(`the stamp ${stamp[1]} is ahead of the clock (${facts.now})`);
  if (/<\/?(issue|pull-request)\b/.test(text)) errors.push('a link tag (or a fragment of one) is in the Board');
  const digest = lines.some((l) => l.startsWith('* **Needs you:**'));
  const want = digest
    ? ['Needs you', 'Running', 'Next', 'Unblock', 'For you', 'Waves done']
    : ['Running', 'Waiting on you', 'Ready', 'Then', 'Unblock', 'For you'];
  const got = lines.filter((l) => /^\* \*\*[^*]+:\*\*/.test(l)).map((l) => /^\* \*\*([^*]+):\*\*/.exec(l)![1]);
  if (got.join('|') !== want.join('|')) errors.push(`the bullets are [${got.join(', ')}], not [${want.join(', ')}]`);
  for (const l of lines.filter((x) => x.startsWith('|'))) {
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 3 || !l.endsWith('|')) {
      errors.push(`a malformed table line: "${l}"`);
      continue;
    }
    if (cells[0] === 'PR' || /^-+$/.test(cells[0]) || /^\*\*.*\*\*$/.test(cells[0])) continue;
    if (!/^\d{2}[a-z]?( \+ \d{2}[a-z]?)?$|^(—|PM|parked)$/.test(cells[0])) errors.push(`a row cell that is not a row id: "${cells[0]}"`);
    if (cells[1] !== '—' && !/^CUL-\d+( \+ CUL-\d+)*$/.test(cells[1])) errors.push(`an issue cell that is not plain ids: "${cells[1]}"`);
    const w = /^waiting on PR-(\d{2}[a-z]?)\b/.exec(cells[2]);
    if (w && facts.merged.has(normRow(w[1]))) errors.push(`row ${cells[0]} is "waiting on" PR-${w[1]}, which has merged`);
    if (/^✓/.test(cells[2]) && !/^✓ #\d+$/.test(cells[2])) errors.push(`row ${cells[0]}'s ✓ carries no PR number: "${cells[2]}"`);
  }
  const cp = lines.find((l) => l.startsWith('**Critical paths:**'));
  if (cp)
    for (const m of cp.matchAll(/\bPR-(\d{2}[a-z]?)( ✓)?/g)) {
      const id = normRow(m[1]);
      if (facts.merged.has(id) && !m[2]) errors.push(`PR-${m[1]} has merged and carries no ✓ on the critical path`);
      if (!facts.merged.has(id) && m[2] && facts.rows.has(id)) errors.push(`PR-${m[1]} carries a ✓ and has not merged`);
    }
  return errors;
}

export function summaryLine(firstSentence: string, plan: Plan, hasBoard: boolean): string {
  const running = plan.verdicts.filter((v) => v.state.kind === 'running').map((v) => `PR-${v.row}`);
  const ready = plan.proposal.map((r) => `PR-${r}`);
  const tail = hasBoard ? 'Board in the description.' : 'Run order in the description.';
  const full = `${firstSentence} Running: ${running.join(', ') || 'nothing'}; ready: ${ready.join(', ') || 'nothing'}. ${tail}`;
  return full.length > 255 ? full.slice(0, full.length - tail.length - 1) : full;
}
