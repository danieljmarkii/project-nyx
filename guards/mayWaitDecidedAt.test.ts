import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// ─────────────────────────────────────────────────────────────────────────────
// `event_ai_analysis.may_wait_decided_at` is set ONCE, by the database (094,
// Engines v3 PR-27l, CUL-1707; PM ruling A 2026-10-09).
//
// The phone ends "first thing tomorrow" at the first 6 AM after this stamp
// (lib/mayWaitLine.ts `leaveDecidedAt`). A stamp that moved with each passing
// read would let a re-read of an old call today start a second night; a writer
// that set it itself could set it late. So the stamp has one writer, the
// trigger, and it only ever fills an empty stamp on a transition to TRUE.
//
// This reads the LAST definition of the trigger's function and the trigger
// across the migration replay and pins: the four branches (insert, keep,
// transition, otherwise none), the timing, the firing order (after the freeze,
// so a client's attempt is refused loudly, and after 088's owner-edit lower, so
// it sees the may_wait the row will hold; before updated_at), and that no Edge
// Function names the column (a writer there would be overwritten, and its
// presence would mean someone thinks they own it).
//
// WHAT IT CANNOT SEE: the trigger's runtime behaviour. 094's PR proved that on
// a scratch Postgres 16 (nine cases and two mutants, in the PR body). The live
// database (a dashboard edit) is the advisors' and the PM's apply check.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const FN = 'stamp_may_wait_decided_at';
const TRIGGER = 'trg_event_ai_analysis_stamps_may_wait_once';
const FREEZE_TRIGGER = 'trg_event_ai_analysis_stamps_frozen';
const OWNER_EDIT_TRIGGER = 'trg_event_ai_analysis_may_wait_edit_row';
const UPDATED_AT_TRIGGER = 'trg_event_ai_analysis_updated_at';

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function replay(): { body: string | null; trigger: { timing: string; fn: string } | null } {
  let body: string | null = null;
  let trigger: { timing: string; fn: string } | null = null;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    const events: { at: number; apply: () => void }[] = [];
    const fnRe = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi');
    for (const m of sql.matchAll(fnRe)) events.push({ at: m.index ?? 0, apply: () => { body = m[1]; } });
    const trgRe = new RegExp(`CREATE\\s+TRIGGER\\s+${TRIGGER}\\s+(BEFORE|AFTER)\\s+([\\w\\s]+?)\\s+ON\\s+(?:public\\.)?event_ai_analysis\\b[\\s\\S]*?EXECUTE\\s+FUNCTION\\s+(?:public\\.)?(\\w+)`, 'gi');
    for (const m of sql.matchAll(trgRe)) {
      events.push({ at: m.index ?? 0, apply: () => { trigger = { timing: squash(`${m[1]} ${m[2]}`).toUpperCase(), fn: m[3].toLowerCase() }; } });
    }
    const dropRe = new RegExp(`DROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${TRIGGER}\\b`, 'gi');
    for (const m of sql.matchAll(dropRe)) events.push({ at: m.index ?? 0, apply: () => { trigger = null; } });
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return { body, trigger };
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const live = replay();
const body = squash(live.body ?? '');

describe('may_wait_decided_at: one writer, set once (094, CUL-1707)', () => {
  it('the function and its trigger are live at the end of the replay', () => {
    expect(live.body).not.toBeNull();
    expect(live.trigger).toEqual({ timing: 'BEFORE INSERT OR UPDATE', fn: FN });
  });

  it('an insert stamps only a TRUE, and only with the database clock', () => {
    expect(body).toContain("IF TG_OP = 'INSERT' THEN NEW.may_wait_decided_at := CASE WHEN NEW.may_wait IS TRUE THEN now() END;");
  });

  it('a stamp, once set, is never moved by any write (a re-read, a lower, a writer naming it)', () => {
    expect(body).toContain('ELSIF OLD.may_wait_decided_at IS NOT NULL THEN NEW.may_wait_decided_at := OLD.may_wait_decided_at;');
  });

  it('an update stamps only the transition to TRUE (never a TRUE that already stood)', () => {
    expect(body).toContain('ELSIF NEW.may_wait IS TRUE AND OLD.may_wait IS NOT TRUE THEN NEW.may_wait_decided_at := now();');
    expect(body).toContain('ELSE NEW.may_wait_decided_at := NULL; END IF;');
  });

  it('the branches run in that order: keep before transition', () => {
    expect(body.indexOf('OLD.may_wait_decided_at IS NOT NULL')).toBeLessThan(body.indexOf('AND OLD.may_wait IS NOT TRUE'));
  });

  it('fires after the freeze and 088\'s owner-edit lower, before updated_at (BEFORE triggers fire in name order)', () => {
    const order = [OWNER_EDIT_TRIGGER, FREEZE_TRIGGER, TRIGGER, UPDATED_AT_TRIGGER];
    expect([...order].sort()).toEqual(order);
  });

  it('no Edge Function names the column: the trigger is its only writer', () => {
    const files = tsFiles(FUNCTIONS_DIR);
    expect(files.length).toBeGreaterThan(20);
    const writers = files.filter((f) => readFileSync(f, 'utf8').includes('may_wait_decided_at'));
    expect(writers).toEqual([]);
  });
});
