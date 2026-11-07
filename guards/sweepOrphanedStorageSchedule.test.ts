// The orphaned-storage sweep's schedule matches the function's run gate
// (CUL-2475; rls-privacy-reviewer pass 2 on CUL-2421, R3).
//
// WHY A GUARD. sweep-orphaned-storage starts a run only when the body is
// {"run": RUN_MARKER} and the call lands within RUN_WINDOW_MIN after
// RUN_HOUR_UTC:RUN_MINUTE_UTC (plan.ts gate()). Every other call is a 400 that
// sweeps nothing. So a schedule that drifts from those constants fails
// SILENTLY: pg_cron reports the job succeeded every day, and no orphaned file
// is ever removed. Nothing at runtime turns that red; this file does.
//
// WHAT IT PROVES, reading migration 120 from disk (comments stripped by the
// shared lexer, so the header's prose cannot satisfy it):
//   1. no migration but 120 names 'sweep-orphaned-storage' beside any cron
//      call (schedule, alter_job, unschedule; positional or named arguments,
//      any quoting), no migration calls cron.alter_job at all (it takes a job
//      id, so a name check cannot see it), and 120 holds exactly one cron call
//      whose command is the http_post and nothing after it;
//   2. its expression is `${RUN_MINUTE_UTC} ${RUN_HOUR_UTC} * * *`, plain
//      integers, every day;
//   3. its body parses to exactly { run: RUN_MARKER }, and the real gate()
//      answers 'run' for that body at the scheduled instant (so the window
//      check is the function's own, not re-derived here);
//   4. it POSTs to this project's /functions/v1/sweep-orphaned-storage with
//      the anon key, byte for byte the one eas.json ships (so a pasted typo or
//      a stale key, which production would 401 daily, reds here);
//   5. pg_net waits longer than the Edge request limit, so the response row
//      records the run's real answer.
//
// MUTANTS, driven below against copies of the real file, every one killed:
//   ✗ the minute moved ('24 9 * * *')       ✗ the hour moved ('23 10 * * *')
//   ✗ a weekday restriction ('23 9 * * 1')  ✗ the marker misspelled
//   ✗ the body key renamed ({"sweep": …})   ✗ an extra body key
//   ✗ the URL pointed at another function   ✗ a service_role key
//   ✗ the timeout cut to 118's 30 s         ✗ the job renamed
//   ✗ the whole call commented out          ✗ a second call appended in 120
//   ✗ a clause after the http_post           ✗ a corrupted key signature
//   ✗ a later migration re-pointing the job: plain-quoted cron.schedule,
//     cron.alter_job by id, named arguments (rls-privacy-reviewer R1, R4)
// And the constants side: gate() is driven at window start and window end, so
// a RUN_WINDOW_MIN of 0 or a moved RUN_HOUR_UTC fails case 3 or 2.
//
// BLIND SPOTS, stated. It reads the repo, not production: an unapplied 120,
// a changed cron.timezone, a job edited by hand in the SQL Editor, or a key
// rotated without a migration are invisible here (120's VERIFY block covers
// them after `apply 120`). It does not prove the job fires or that a run
// swept anything; the function's run line does, and an alarm on a missing
// run line is filed separately (rls-privacy-reviewer R2).

import * as fs from 'fs';
import * as path from 'path';
import { stripSqlComments } from './sqlComments';
import {
  RUN_HOUR_UTC,
  RUN_MARKER,
  RUN_MINUTE_UTC,
  RUN_WINDOW_MIN,
  gate,
} from '../supabase/functions/sweep-orphaned-storage/plan';
import { SWEEP_REQUEST_LIMIT_MS } from '../supabase/functions/delete-account/plan';

const MIGRATIONS = path.resolve(__dirname, '..', 'supabase', 'migrations');
const FILE = '120_sweep_orphaned_storage_schedule.sql';
const JOB = 'sweep-orphaned-storage';
const PROJECT_REF = 'aigchluqluzuhtbfllgh';
const REPO_ROOT = path.resolve(__dirname, '..');

// Every anon key eas.json ships (one per build profile). They must agree, and
// the schedule's key must be that one.
function shippedAnonKeys(): string[] {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'eas.json'), 'utf8');
  return [...new Set([...text.matchAll(/"EXPO_PUBLIC_SUPABASE_ANON_KEY"\s*:\s*"([^"]+)"/g)].map((m) => m[1]))];
}

// Files that touch this job, by any cron call in any argument form. A pure
// function over (name -> sql) so the mutants below need no fixture on disk.
function jobTouchers(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([, sql]) => {
      const code = stripSqlComments(sql);
      return /cron\.alter_job\s*\(/.test(code) || (/cron\.\w+\s*\(/.test(code) && code.includes(JOB));
    })
    .map(([name]) => name)
    .sort();
}

interface Schedule {
  name: string;
  expr: string;
  command: string;
}

// cron.schedule('<name>', '<expr>', $tag$ … $tag$). Comments are gone before
// this runs, so a commented-out call is not a schedule.
function schedulesIn(sql: string): Schedule[] {
  const re = /cron\.schedule\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*\$(\w*)\$([\s\S]*?)\$\3\$\s*\)/g;
  const out: Schedule[] = [];
  for (const m of stripSqlComments(sql).matchAll(re)) {
    out.push({ name: m[1], expr: m[2], command: m[4] });
  }
  return out;
}

function jwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Every way 120's text can disagree with the function, as named problems.
// An empty list is the only pass.
function scheduleProblems(sql: string): string[] {
  const problems: string[] = [];
  const mine = schedulesIn(sql).filter((s) => s.name === JOB);
  if (mine.length !== 1) return [`expected one cron.schedule('${JOB}', …), found ${mine.length}`];
  const { expr, command } = mine[0];

  const cronCalls = stripSqlComments(sql).match(/cron\.\w+\s*\(/g) ?? [];
  if (cronCalls.length !== 1) problems.push(`expected one cron call in 120, found ${cronCalls.length}`);
  if (!/^\s*SELECT\s+net\.http_post\s*\([\s\S]*\)\s*;\s*$/.test(command)) {
    problems.push('the job command is not a bare net.http_post(...);');
  }

  const want = `${RUN_MINUTE_UTC} ${RUN_HOUR_UTC} * * *`;
  if (expr !== want) problems.push(`cron expression '${expr}' is not '${want}'`);

  const bodyMatch = command.match(/body\s*:=\s*'([^']*)'::jsonb/);
  let body: unknown = null;
  if (!bodyMatch) problems.push('no jsonb body literal');
  else {
    try {
      body = JSON.parse(bodyMatch[1]);
    } catch {
      problems.push('body is not JSON');
    }
    const keys = body && typeof body === 'object' ? Object.keys(body as object) : [];
    if (keys.length !== 1 || (body as { run?: unknown }).run !== RUN_MARKER) {
      problems.push(`body ${bodyMatch[1]} is not {"run": "${RUN_MARKER}"}`);
    }
    // The function's own gate, at the instant the expression fires.
    const fires = Date.UTC(2026, 10, 5, Number(expr.split(' ')[1]), Number(expr.split(' ')[0]));
    if (gate(body, fires) !== 'run') problems.push(`gate() refuses this body at ${new Date(fires).toISOString()}`);
  }

  const url = command.match(/url\s*:=\s*'([^']*)'/)?.[1];
  const wantUrl = `https://${PROJECT_REF}.supabase.co/functions/v1/${JOB}`;
  if (url !== wantUrl) problems.push(`url ${url} is not ${wantUrl}`);

  const token = command.match(/'Bearer ([^']*)'/)?.[1];
  const claims = token ? jwtPayload(token) : null;
  if (!claims || claims.role !== 'anon' || claims.ref !== PROJECT_REF) {
    problems.push(`Authorization is not this project's anon key (role ${String(claims?.role)})`);
  }
  const shipped = shippedAnonKeys();
  if (shipped.length !== 1 || token !== shipped[0]) {
    problems.push(`Authorization is not the anon key eas.json ships (${shipped.length} distinct there)`);
  }

  const timeout = Number(command.match(/timeout_milliseconds\s*:=\s*(\d+)/)?.[1] ?? NaN);
  if (!(timeout > SWEEP_REQUEST_LIMIT_MS)) {
    problems.push(`timeout_milliseconds ${timeout} does not outlast the ${SWEEP_REQUEST_LIMIT_MS} ms request limit`);
  }
  return problems;
}

const real = fs.readFileSync(path.join(MIGRATIONS, FILE), 'utf8');

describe('migration 120 schedules the sweep inside its gate', () => {
  it('has no problems', () => {
    expect(scheduleProblems(real)).toEqual([]);
  });

  it('is the only migration that touches the job', () => {
    const files: Record<string, string> = {};
    for (const f of fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
      files[f] = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    }
    expect(Object.keys(files).length).toBeGreaterThan(100); // non-vacuity: the real directory was read
    expect(jobTouchers(files)).toEqual([FILE]);
  });

  it('fires inside the window the gate opens, not at its edge', () => {
    // The constants side: a zero window or a moved hour cannot pass here.
    const start = Date.UTC(2026, 10, 5, RUN_HOUR_UTC, RUN_MINUTE_UTC);
    const marker = { run: RUN_MARKER };
    expect(RUN_WINDOW_MIN).toBeGreaterThanOrEqual(5);
    expect(gate(marker, start)).toBe('run');
    expect(gate(marker, start + (RUN_WINDOW_MIN - 1) * 60_000)).toBe('run');
    expect(gate(marker, start + RUN_WINDOW_MIN * 60_000)).toBe('outside_window');
    expect(gate(marker, start - 60_000)).toBe('outside_window');
  });
});

describe('mutation proof: each drift from the gate is caught', () => {
  const mutants: Array<[string, string, string]> = [
    ['minute moved', `'23 9 * * *'`, `'24 9 * * *'`],
    ['hour moved', `'23 9 * * *'`, `'23 10 * * *'`],
    ['weekday restriction', `'23 9 * * *'`, `'23 9 * * 1'`],
    ['marker misspelled', `{"run": "sweep-orphaned-storage"}`, `{"run": "sweep-orphan-storage"}`],
    ['body key renamed', `{"run": "sweep-orphaned-storage"}`, `{"sweep": "sweep-orphaned-storage"}`],
    ['extra body key', `{"run": "sweep-orphaned-storage"}`, `{"run": "sweep-orphaned-storage", "x": 1}`],
    ['URL to another function', `/functions/v1/sweep-orphaned-storage'`, `/functions/v1/reap-report-drafts'`],
    ['timeout cut to 30 s', 'timeout_milliseconds := 160000', 'timeout_milliseconds := 30000'],
    ['job renamed', `'sweep-orphaned-storage',\n  '23 9`, `'sweep-orphans',\n  '23 9`],
    ['call commented out', '\nSELECT cron.schedule(', '\n-- SELECT cron.schedule('],
    ['a clause after the http_post', '160000\n  );', '160000\n  ) WHERE false;'],
  ];

  // Each mutant edits the live call only. The header and VERIFY comments quote
  // the same strings, and a mutant that lands there changes nothing.
  const callStart = real.indexOf('\nSELECT cron.schedule(');
  const callEnd = real.indexOf('$job$\n);', callStart);
  const inCall = (from: string, to: string): string =>
    real.slice(0, callStart) + real.slice(callStart, callEnd).replace(from, to) + real.slice(callEnd);

  it('the call is where the mutants look', () => {
    expect(callStart).toBeGreaterThan(0);
    expect(callEnd).toBeGreaterThan(callStart);
  });

  it.each(mutants)('%s', (_label, from, to) => {
    expect(real.slice(callStart, callEnd).includes(from)).toBe(true);
    expect(scheduleProblems(inCall(from, to)).length).toBeGreaterThan(0);
  });

  it('a second call appended in 120', () => {
    const extra = `${real}\nSELECT cron.schedule('${JOB}', '0 3 * * *', 'SELECT 1');\n`;
    expect(scheduleProblems(extra).length).toBeGreaterThan(0);
  });

  it('a corrupted key signature', () => {
    const token = real.match(/'Bearer ([^']*)'/)![1];
    const [h, p] = token.split('.');
    expect(scheduleProblems(real.replace(token, `${h}.${p}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).length).toBeGreaterThan(0);
  });

  it.each([
    ['plain-quoted cron.schedule', `SELECT cron.schedule('${JOB}', '0 3 * * *', 'SELECT 1');`],
    ['cron.alter_job by name lookup', `SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = '${JOB}'), schedule := '0 3 * * *');`],
    ['cron.alter_job by bare id', `SELECT cron.alter_job(7, schedule := '0 3 * * *');`],
    ['named arguments', `SELECT cron.schedule(job_name := '${JOB}', schedule := '0 3 * * *', command := $c$SELECT 1$c$);`],
    ['cron.unschedule', `SELECT cron.unschedule('${JOB}');`],
  ])('a later migration re-pointing the job: %s', (_label, sql) => {
    expect(jobTouchers({ [FILE]: real, '121_later.sql': sql })).toEqual(['121_later.sql', FILE].sort());
  });

  it('a later migration about another job is not flagged', () => {
    const other = `SELECT cron.schedule('some-other-job', '0 4 * * *', $j$SELECT 1$j$);`;
    expect(jobTouchers({ [FILE]: real, '121_other.sql': other })).toEqual([FILE]);
  });

  it('a service_role key', () => {
    const token = real.match(/'Bearer ([^']*)'/)![1];
    const [h, , s] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ iss: 'supabase', ref: PROJECT_REF, role: 'service_role' }),
    ).toString('base64url');
    expect(scheduleProblems(real.replace(token, `${h}.${forged}.${s}`)).length).toBeGreaterThan(0);
  });
});
