// /sweep's I/O shell (CUL-2651). Reads ONE facts file the sweep wrote from its reads, runs
// rank.ts, and prints. It makes no network call and writes nothing; the sweep makes the
// writes it prints, with the reasons it prints.
//
//   node --experimental-strip-types scripts/sweep/cli.ts rank <facts.json>
//   node --experimental-strip-types scripts/sweep/cli.ts metrics <metrics.json>
//   node --experimental-strip-types scripts/sweep/cli.ts readback <readback.json>
//   node --experimental-strip-types scripts/sweep/cli.ts prompts <facts.json>
//
// facts.json: SweepInput (rank.ts) plus `now` (from `date -u`) and `nextRow` (one past the
// highest PR number on the Loose ends page; 1 on a new page).
// metrics.json: `{ launched, merged, abandoned, launchToMergeHours: number[] }`.
// readback.json: ReadbackInput (readback.ts): the last batch, read back before ranking (CUL-2700).
// prompts: the same facts as rank, plus `teach` (false when a row in flight carries it);
// it prints each pick's branch, claim comment, session title and prompt, and the never-line.

import * as fs from 'node:fs';

import { SWEEP_NEVER_LINE, renderPrompts } from './prompt.ts';
import { readBack, type ReadbackInput } from './readback.ts';
import { FINDINGS_CAP, MAX_SESSIONS, WAITING_ON_PM_LIMIT, metricsLine, pageRows, rankSweep, sessionTitle, sweepRunTitle, type SweepInput } from './rank.ts';

const [cmd, file] = process.argv.slice(2);
const say = (s = '') => process.stdout.write(`${s}\n`);

function main(): number {
  if (!file || !fs.existsSync(file)) { say(`usage: cli.ts rank|metrics <file.json>`); return 2; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cmd === 'metrics') { say(metricsLine(data)); return 0; }
  if (cmd === 'readback') return printReadback(data as ReadbackInput);
  if (cmd !== 'rank' && cmd !== 'prompts') { say(`unknown command ${cmd}`); return 2; }

  const input = data as SweepInput & { now: string; nextRow?: number };
  if (!input.now) { say('facts refused: no `now` (take it from date -u)'); return 2; }
  let r;
  let page;
  try { r = rankSweep(input); page = pageRows(r.picks, input.nextRow ?? 1); } catch (e) { say((e as Error).message); return 1; }
  if (cmd === 'prompts') {
    const beside = input.inFlight.map((f) => `${f.holder}: ${f.files.join(', ') || 'files not named'}`);
    const out = renderPrompts(r.picks, input.nextRow ?? 1, input.now, beside, (data as { teach?: boolean }).teach !== false);
    out.forEach((o, i) => {
      say(`=== PR-${o.row} · ${o.mode} · ${sessionTitle(r.picks[i])} ===`);
      say(`branch: ${o.branch}`);
      say(`launch line: PR-${o.row} · ${r.picks[i].issues[0]} · session <id> · branch ${o.branch} · ${input.now} · picked`);
      say('--- claim ---');
      say(o.claim);
      say('--- prompt ---');
      say(o.prompt);
      say(`=== end PR-${o.row} ===`);
    });
    say('--- never-line (append_system_prompt, every session) ---');
    say(SWEEP_NEVER_LINE);
    return 0;
  }

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

function printReadback(input: ReadbackInput): number {
  let b;
  try { b = readBack(input); } catch (e) { say((e as Error).message); return 1; }
  say('Last batch:');
  for (const r of b.rows) say(` PR-${r.row} · ${r.issue} · ${r.outcome}: ${r.detail}`);
  if (!b.rows.length) say(' none (no launch lines in the updates given)');
  say();
  say(`Needs you (${b.needsYou.length}):`);
  b.needsYou.forEach((x) => say(` ${x}`));
  if (!b.needsYou.length) say(' nothing');
  say();
  say('Releases (post each on its issue):');
  b.releases.forEach((x) => say(` ${x.issue}: ${x.comment}`));
  if (!b.releases.length) say(' nothing');
  say();
  say(`Prune from the page (merged over a week ago): ${b.prune.map((x) => `PR-${x}`).join(', ') || 'nothing'}`);
  say(`nextRow: ${b.nextRow}`);
  say(`waitingOnPm (this project): ${b.waitingOnPm}`);
  say(`inFlight (for the rank facts): ${JSON.stringify(b.inFlight)}`);
  say(b.metrics);
  return 0;
}

process.exit(main());
