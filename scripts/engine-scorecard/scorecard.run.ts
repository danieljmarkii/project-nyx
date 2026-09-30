// The engine scorecard's runner (Engines v3 PR-16, EN-1, CUL-1131). Run through
// jest.scorecard.config.js, never the app's `npm test`: see that file's header for why jest.
//
// It runs PR-15's committed synthetic pets through the shipped Signal pipeline, with each card's
// ask read from Home's row (`signalHomeLine(f).ask`, which is `signalHomeAsk` behind Home's safety gate), scores them (supabase/functions/generate-signal/eval/), and prints
// the diff against the committed scorecard plus every pass line's rows. REPORTED, NEVER GATING:
// a moved row is information, and the test fails only when the harness itself breaks (it throws,
// or it measured nothing). Environment:
//
//   SCORECARD_SEEDS    'ci' (default: each scenario's committed ciSeeds), N (seeds 10000..10000+N-1),
//                      or 'A-B' (a shard of that range, for running the go-live size in parallel)
//   SCORECARD_FLAGS    comma-separated engine keys on for this arm (default none: flag off)
//   SCORECARD_WRITE=1  overwrite the committed file (CI seeds, flag off only)
//   SCORECARD_OUT      also write this run's scorecard to a path (the offline check keeps its arms)
//   SCORECARD_OFF      a flag-off scorecard file to hold this (flag-on) run against, for the pass lines
//   SCORECARD_SCENARIOS  comma-separated scenario ids (default: the whole corpus)

import * as fs from 'fs';
import * as path from 'path';
import { signalHomeLine } from '../../lib/signalHomeLine';
import type { SignalFinding } from '../../lib/signal';
import { ENGINE_KEYS, type EngineKey } from '../../supabase/functions/_shared/engineFlags';
import { TRAJECTORY_CORPUS, type ScenarioSpec } from '../../supabase/functions/_shared/engineCorpus/trajectory/index';
import { makeSignalObserver } from '../../supabase/functions/generate-signal/eval/observer';
import { evaluatePassLines, formatPassLines } from '../../supabase/functions/generate-signal/eval/passLines';
import { runCorpus } from '../../supabase/functions/generate-signal/eval/run';
import { diffScorecards, formatDiff, type Scorecard } from '../../supabase/functions/generate-signal/eval/scorecard';

const COMMITTED = path.join(__dirname, '../../supabase/functions/generate-signal/eval/scorecard.json');
const OFFLINE_BASE_SEED = 10_000;

function seedsFrom(spec: string): { seeds: (s: ScenarioSpec) => readonly number[]; label: string } {
  if (spec === 'ci') return { seeds: (s) => s.ciSeeds, label: 'ciSeeds' };
  const range = spec.match(/^(\d+)-(\d+)$/);
  const [from, to] = range ? [Number(range[1]), Number(range[2])] : [0, Number(spec) - 1];
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new Error(`SCORECARD_SEEDS: cannot read "${spec}"`);
  const seeds = Array.from({ length: to - from + 1 }, (_, i) => OFFLINE_BASE_SEED + from + i);
  return { seeds: () => seeds, label: `${OFFLINE_BASE_SEED + from}..${OFFLINE_BASE_SEED + to}` };
}

function flagsFrom(spec: string | undefined): EngineKey[] {
  if (!spec) return [];
  const keys = spec.split(',').map((k) => k.trim()).filter(Boolean);
  for (const k of keys) if (!(ENGINE_KEYS as readonly string[]).includes(k)) throw new Error(`SCORECARD_FLAGS: no engine key "${k}"`);
  return (keys as EngineKey[]).sort();
}

test('the engine scorecard (reported, never gating)', () => {
  const env = process.env;
  const on = flagsFrom(env.SCORECARD_FLAGS);
  const arm = on.length === 0 ? 'flag_off' : `flag_on:${on.join('+')}`;
  const { seeds, label } = seedsFrom(env.SCORECARD_SEEDS ?? 'ci');
  const only = env.SCORECARD_SCENARIOS?.split(',').map((s: string) => s.trim());
  const scenarios = only ? TRAJECTORY_CORPUS.filter((s) => only.includes(s.id)) : TRAJECTORY_CORPUS;
  const unknown = only?.filter((id: string) => !TRAJECTORY_CORPUS.some((s) => s.id === id)) ?? [];
  if (unknown.length > 0) throw new Error(`SCORECARD_SCENARIOS: no scenario ${unknown.join(', ')}`);
  if (scenarios.length === 0) throw new Error('no scenario selected');

  const started = Date.now();
  const { scorecard } = runCorpus({
    observer: () => makeSignalObserver({ askOf: (f) => signalHomeLine(f as unknown as SignalFinding)?.ask ?? null, engineFlags: { on, readOk: true } }),
    arm,
    flagsOn: on,
    seeds,
    seedsLabel: label,
    scenarios,
  });
  // A run that measured nothing must not print "no row moved" as if it had looked (CUL-1276's lesson).
  expect(Object.keys(scorecard.rows).length).toBeGreaterThan(scenarios.length * 5);

  const committed: Scorecard = JSON.parse(fs.readFileSync(COMMITTED, 'utf8'));
  const report: string[] = [];
  const whole = !only && label === 'ciSeeds' && arm === 'flag_off';
  if (env.SCORECARD_WRITE === '1') {
    if (!whole) throw new Error('SCORECARD_WRITE rewrites the committed file, which holds the whole corpus at CI seeds, flag off');
    fs.writeFileSync(COMMITTED, `${JSON.stringify(scorecard, null, 1)}\n`);
    report.push(`Wrote ${path.relative(process.cwd(), COMMITTED)} (${Object.keys(scorecard.rows).length} rows).`);
  } else if (whole) {
    report.push(formatDiff(diffScorecards(committed, scorecard), committed, scorecard));
  } else {
    report.push(`Not the committed shape (arm ${arm}, seeds ${label}${only ? `, ${scenarios.length} scenarios` : ''}): no diff printed.`);
  }
  if (env.SCORECARD_OUT) fs.writeFileSync(env.SCORECARD_OUT, `${JSON.stringify(scorecard, null, 1)}\n`);

  const off: Scorecard | null = env.SCORECARD_OFF ? JSON.parse(fs.readFileSync(env.SCORECARD_OFF, 'utf8')) : null;
  const results = off ? evaluatePassLines(off, scorecard) : evaluatePassLines(scorecard);
  report.push('', formatPassLines(results));
  report.push(`Ran in ${Math.round((Date.now() - started) / 1000)} s.`);
  const text = report.join('\n');
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
});
