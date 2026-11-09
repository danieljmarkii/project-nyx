// /sweep's I/O shell (CUL-2651). Reads ONE facts file the sweep wrote from its reads, runs
// rank.ts, and prints. It makes no network call and writes nothing; the sweep makes the
// writes it prints, with the reasons it prints.
//
//   node --experimental-strip-types scripts/sweep/cli.ts rank <facts.json>
//   node --experimental-strip-types scripts/sweep/cli.ts metrics <metrics.json>
//
// facts.json: SweepInput (rank.ts) plus `now` (from `date -u`) and `nextRow` (one past the
// highest PR number on the Loose ends page; 1 on a new page).
// metrics.json: `{ launched, merged, abandoned, launchToMergeHours: number[] }`.

import * as fs from 'node:fs';

import { FINDINGS_CAP, MAX_SESSIONS, WAITING_ON_PM_LIMIT, metricsLine, pageRows, rankSweep, sessionTitle, sweepRunTitle, type SweepInput } from './rank.ts';

const [cmd, file] = process.argv.slice(2);
const say = (s = '') => process.stdout.write(`${s}\n`);

function main(): number {
  if (!file || !fs.existsSync(file)) { say(`usage: cli.ts rank|metrics <file.json>`); return 2; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cmd === 'metrics') { say(metricsLine(data)); return 0; }
  if (cmd !== 'rank') { say(`unknown command ${cmd}`); return 2; }

  const input = data as SweepInput & { now: string; nextRow?: number };
  if (!input.now) { say('facts refused: no `now` (take it from date -u)'); return 2; }
  let r;
  let page;
  try { r = rankSweep(input); page = pageRows(r.picks, input.nextRow ?? 1); } catch (e) { say((e as Error).message); return 1; }

  say(`Picks (${r.picks.length} of ${Math.min(MAX_SESSIONS, input.slotsFree)} free slots; waiting on the PM before this run: ${input.waitingOnPm} of ${WAITING_ON_PM_LIMIT}):`);
  r.picks.forEach((p, i) => {
    say(` ${i + 1}. [${p.kind}${p.liveHarm ? ', Live harm' : ''}] ${p.issues.join(' + ')} · ${p.what} · size ${p.size}`);
    say(`    why: ${p.why}`);
    say(`    files: ${p.files.join(', ') || 'none (shaping)'}`);
    for (const t of p.team) say(`    ${t.persona}: ${t.rec}`);
    say(`    session: ${sessionTitle(p)}`);
  });
  if (!r.picks.length) say(' none');
  say();
  say('Held:');
  for (const h of r.held) say(` ${h.id} — ${h.reason}`);
  if (!r.held.length) say(' nothing');
  say();
  say('Linear writes (relevance, on evidence only):');
  for (const w of r.writes) say(` ${w.id} → ${w.action}${'of' in w ? ` of ${w.of}` : ''}: ${w.why}`);
  if (!r.writes.length) say(' nothing');
  for (const w of r.warnings) say(`⚠ ${w}`);
  say();
  const { rows, notes, doneMeans } = page;
  say('--- page rows ---');
  rows.forEach((x) => say(x));
  say(doneMeans);
  notes.forEach((x) => say(x));
  say('--- end page rows ---');
  say();
  say(`Findings cap per session: ${FINDINGS_CAP} new non-harm issues.`);
  say(`This session's title once launched: ${sweepRunTitle(new Date(input.now), r.picks.length)}`);
  return 0;
}

process.exit(main());
