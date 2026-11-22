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
// CUL-2897: migration 123 schedules the daily CHECK the same way ('sweep-orphaned-
// storage-check', {"check": CHECK_MARKER} at CHECK_MINUTE_UTC CHECK_HOUR_UTC), and
// every proof above runs over it too, against the check's own gate verdict. Its
// table, sweep_check_results, is pinned server-only (RLS on, no policy, client
// grants revoked), since the result read lets any anon caller reach what it holds
// through the function, and a client grant would add a second, ungated door.
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
  CHECK_HOUR_UTC,
  CHECK_MARKER,
  CHECK_MINUTE_UTC,
  CHECK_WINDOW_MIN,
  RUN_HOUR_UTC,
  RUN_MARKER,
  RUN_MINUTE_UTC,
  RUN_WINDOW_MIN,
  gate,
} from '../supabase/functions/sweep-orphaned-storage/plan';
import { SWEEP_REQUEST_LIMIT_MS } from '../supabase/functions/delete-account/plan';

const MIGRATIONS = path.resolve(__dirname, '..', 'supabase', 'migrations');
const FILE = '120_sweep_orphaned_storage_schedule.sql';
const CHECK_FILE = '123_sweep_orphaned_storage_check_schedule.sql';
const JOB = 'sweep-orphaned-storage';
const CHECK_JOB = 'sweep-orphaned-storage-check';
// The function both jobs POST to (the check job's name is not the function's).
const FUNCTION = 'sweep-orphaned-storage';

interface JobSpec {
  file: string;
  job: string;
  hour: number;
  minute: number;
  body: Record<string, string>;
  verdict: 'run' | 'check';
}

const RUN_SPEC: JobSpec = { file: FILE, job: JOB, hour: RUN_HOUR_UTC, minute: RUN_MINUTE_UTC, body: { run: RUN_MARKER }, verdict: 'run' };
const CHECK_SPEC: JobSpec = {
  file: CHECK_FILE,
  job: CHECK_JOB,
  hour: CHECK_HOUR_UTC,
  minute: CHECK_MINUTE_UTC,
  body: { check: CHECK_MARKER },
  verdict: 'check',
};
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

// Every way a schedule file's text can disagree with the function, as named
// problems. An empty list is the only pass.
function scheduleProblems(sql: string, spec: JobSpec = RUN_SPEC): string[] {
  const problems: string[] = [];
  const mine = schedulesIn(sql).filter((s) => s.name === spec.job);
  if (mine.length !== 1) return [`expected one cron.schedule('${spec.job}', …), found ${mine.length}`];
  const { expr, command } = mine[0];

  const cronCalls = stripSqlComments(sql).match(/cron\.\w+\s*\(/g) ?? [];
  if (cronCalls.length !== 1) problems.push(`expected one cron call in ${spec.file}, found ${cronCalls.length}`);
  if (!/^\s*SELECT\s+net\.http_post\s*\([\s\S]*\)\s*;\s*$/.test(command)) {
    problems.push('the job command is not a bare net.http_post(...);');
  }

  const want = `${spec.minute} ${spec.hour} * * *`;
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
    const [wantKey, wantValue] = Object.entries(spec.body)[0];
    if (keys.length !== 1 || (body as Record<string, unknown>)[wantKey] !== wantValue) {
      problems.push(`body ${bodyMatch[1]} is not ${JSON.stringify(spec.body)}`);
    }
    // The function's own gate, at the instant the expression fires.
    const fires = Date.UTC(2026, 10, 5, Number(expr.split(' ')[1]), Number(expr.split(' ')[0]));
    if (gate(body, fires) !== spec.verdict) problems.push(`gate() refuses this body at ${new Date(fires).toISOString()}`);
  }

  const url = command.match(/url\s*:=\s*'([^']*)'/)?.[1];
  const wantUrl = `https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION}`;
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
    expect(jobTouchers(files)).toEqual([FILE, CHECK_FILE].sort());
  });

  it('123 schedules the check inside its gate (CUL-2897)', () => {
    expect(scheduleProblems(fs.readFileSync(path.join(MIGRATIONS, CHECK_FILE), 'utf8'), CHECK_SPEC)).toEqual([]);
  });

  it('120 holds no check job and 123 no run job', () => {
    expect(schedulesIn(real).map((s) => s.name)).toEqual([JOB]);
    expect(schedulesIn(fs.readFileSync(path.join(MIGRATIONS, CHECK_FILE), 'utf8')).map((s) => s.name)).toEqual([CHECK_JOB]);
  });

  it('the check fires inside its window, which is the run\'s fifteen minutes', () => {
    const start = Date.UTC(2026, 10, 5, CHECK_HOUR_UTC, CHECK_MINUTE_UTC);
    const marker = { check: CHECK_MARKER };
    expect(CHECK_WINDOW_MIN).toBe(RUN_WINDOW_MIN);
    expect(gate(marker, start)).toBe('check');
    expect(gate(marker, start + (CHECK_WINDOW_MIN - 1) * 60_000)).toBe('check');
    expect(gate(marker, start + CHECK_WINDOW_MIN * 60_000)).toBe('outside_window');
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

// CUL-2897: migration 123, the check's schedule and the table it stores into.
const checkSql = fs.readFileSync(path.join(MIGRATIONS, CHECK_FILE), 'utf8');

function tableProblems(sql: string): string[] {
  const code = stripSqlComments(sql);
  const problems: string[] = [];
  if (!/CREATE TABLE IF NOT EXISTS public\.sweep_check_results\s*\(/.test(code)) problems.push('no sweep_check_results table');
  if (!/ALTER TABLE public\.sweep_check_results ENABLE ROW LEVEL SECURITY;/.test(code)) problems.push('RLS not enabled');
  if (/CREATE POLICY/i.test(code)) problems.push('a policy opens the table to a client role');
  if (/\bGRANT\b/i.test(code)) problems.push('a GRANT in 123');
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
    if (!new RegExp(`REVOKE ALL ON TABLE public\\.sweep_check_results FROM ${role};`).test(code)) {
      problems.push(`grants not revoked from ${role}`);
    }
  }
  if (!/REVOKE DELETE, TRUNCATE ON TABLE public\.sweep_check_results FROM service_role;/.test(code)) {
    problems.push('service_role can erase a day\'s answer');
  }
  return problems;
}

describe('migration 123 keeps the check answer server-only (CUL-2897)', () => {
  it('has no table problems', () => {
    expect(tableProblems(checkSql)).toEqual([]);
  });

  it.each([
    ['RLS line removed', 'ALTER TABLE public.sweep_check_results ENABLE ROW LEVEL SECURITY;', ''],
    ['anon revoke removed', 'REVOKE ALL ON TABLE public.sweep_check_results FROM anon;', ''],
    ['authenticated revoke removed', 'REVOKE ALL ON TABLE public.sweep_check_results FROM authenticated;', ''],
    ['a read policy added', 'COMMENT ON TABLE', 'CREATE POLICY x ON public.sweep_check_results FOR SELECT USING (true);\nCOMMENT ON TABLE'],
    ['a grant added', 'COMMENT ON TABLE', 'GRANT SELECT ON public.sweep_check_results TO anon;\nCOMMENT ON TABLE'],
    ['service_role delete kept', 'REVOKE DELETE, TRUNCATE ON TABLE public.sweep_check_results FROM service_role;', ''],
  ])('mutant: %s', (_label, from, to) => {
    expect(checkSql.includes(from)).toBe(true);
    expect(tableProblems(checkSql.replace(from, to)).length).toBeGreaterThan(0);
  });

  const callStart = checkSql.indexOf('\nSELECT cron.schedule(');
  const callEnd = checkSql.indexOf('$job$\n);', callStart);
  const inCall = (from: string, to: string): string =>
    checkSql.slice(0, callStart) + checkSql.slice(callStart, callEnd).replace(from, to) + checkSql.slice(callEnd);

  it.each([
    ['minute moved', `'7 12 * * *'`, `'8 12 * * *'`],
    ['back to GitHub\'s late hour', `'7 12 * * *'`, `'7 18 * * *'`],
    ['the run body (a check job that deletes)', `{"check": "overdue"}`, `{"run": "sweep-orphaned-storage"}`],
    ['the result body (stores nothing)', `{"check": "overdue"}`, `{"result": "overdue"}`],
    ['URL to another function', `/functions/v1/sweep-orphaned-storage'`, `/functions/v1/reap-report-drafts'`],
    ['timeout cut', 'timeout_milliseconds := 160000', 'timeout_milliseconds := 30000'],
    ['job renamed', `'sweep-orphaned-storage-check',`, `'sweep-check',`],
  ])('mutant: %s', (_label, from, to) => {
    expect(callStart).toBeGreaterThan(0);
    expect(checkSql.slice(callStart, callEnd).includes(from)).toBe(true);
    expect(scheduleProblems(inCall(from, to), CHECK_SPEC).length).toBeGreaterThan(0);
  });
});
