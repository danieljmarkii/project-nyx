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
// This replays the migrations and pins: the function's whole body, by equality
// (an extra arm is the realistic regression); that its trigger is live, enabled
// and BEFORE INSERT OR UPDATE (a later DROP FUNCTION … CASCADE, DROP TRIGGER,
// DISABLE TRIGGER or RENAME removes it from the live set); the firing order read
// off the replay's own triggers; and that no Edge Function names the column (a
// writer there would be overwritten, and its presence would mean someone thinks
// they own it).
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

interface Replay {
  body: string | null;
  /** Every live, enabled trigger on event_ai_analysis: name -> timing and function. */
  triggers: Map<string, { timing: string; fn: string }>;
}

function replay(): Replay {
  const out: Replay = { body: null, triggers: new Map() };
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    const events: { at: number; apply: () => void }[] = [];
    const on = (re: RegExp, apply: (m: RegExpMatchArray) => void) => {
      for (const m of sql.matchAll(re)) events.push({ at: m.index ?? 0, apply: () => apply(m) });
    };
    on(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi'), (m) => {
      out.body = m[1];
    });
    // A dropped function takes its trigger with it (CASCADE), or the drop fails; either way
    // the stamp is no longer what this file pins.
    on(new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${FN}\\b`, 'gi'), () => {
      out.body = null;
      for (const [name, t] of out.triggers) if (t.fn === FN) out.triggers.delete(name);
    });
    on(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\s+([\w\s,]+?)\s+ON\s+(?:public\.)?event_ai_analysis\b[\s\S]*?EXECUTE\s+FUNCTION\s+(?:public\.)?(\w+)/gi, (m) => {
      out.triggers.set(m[1].toLowerCase(), { timing: squash(`${m[2]} ${m[3]}`).toUpperCase(), fn: m[4].toLowerCase() });
    });
    on(/DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?event_ai_analysis\b/gi, (m) => {
      out.triggers.delete(m[1].toLowerCase());
    });
    // A disabled or renamed trigger is not the one this file pins: drop it from the live set.
    on(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?event_ai_analysis\s+DISABLE\s+TRIGGER\s+(\w+)/gi, (m) => {
      const name = m[1].toLowerCase();
      if (name === 'all' || name === 'user') out.triggers.clear();
      else out.triggers.delete(name);
    });
    on(/ALTER\s+TRIGGER\s+(\w+)\s+ON\s+(?:public\.)?event_ai_analysis\s+RENAME\s+TO\s+(\w+)/gi, (m) => {
      const t = out.triggers.get(m[1].toLowerCase());
      out.triggers.delete(m[1].toLowerCase());
      if (t) out.triggers.set(m[2].toLowerCase(), t);
    });
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return out;
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

// The whole body, pinned by equality: an extra arm (a re-stamp on some condition) is the
// realistic regression, and per-arm `toContain` checks cannot see one (second adversarial pass,
// M1). Changing the body means changing this, in the same PR, on purpose.
const EXPECTED_BODY = squash(`
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.may_wait_decided_at := CASE WHEN NEW.may_wait IS TRUE THEN now() END;
  ELSIF OLD.may_wait_decided_at IS NOT NULL THEN
    NEW.may_wait_decided_at := OLD.may_wait_decided_at;
  ELSIF NEW.may_wait IS TRUE AND OLD.may_wait IS NOT TRUE THEN
    NEW.may_wait_decided_at := now();
  ELSE
    NEW.may_wait_decided_at := NULL;
  END IF;
  RETURN NEW;
END;`);

const beforeTriggers = () =>
  [...live.triggers].filter(([, t]) => t.timing.startsWith('BEFORE')).map(([name]) => name).sort();

describe('may_wait_decided_at: one writer, set once (094, CUL-1707)', () => {
  it('the function is live and its body is exactly the four arms (insert, keep, transition, none)', () => {
    expect(live.body).not.toBeNull();
    expect(body).toBe(EXPECTED_BODY);
  });

  it('its trigger is live and enabled, BEFORE INSERT OR UPDATE, calling it', () => {
    expect(live.triggers.get(TRIGGER)).toEqual({ timing: 'BEFORE INSERT OR UPDATE', fn: FN });
  });

  it('the freeze fires before it (so a client attempt is refused, not silently held), updated_at after', () => {
    // Read off the replay's live BEFORE triggers, not off constants restated here. The order
    // is not what holds the stamp (every role is overwritten by the keep arm); it decides
    // whether a client's attempt is LOUD (42501) and that updated_at is set after the stamp.
    const order = beforeTriggers();
    expect(order).toContain(FREEZE_TRIGGER);
    expect(order).toContain(UPDATED_AT_TRIGGER);
    expect(order.indexOf(FREEZE_TRIGGER)).toBeLessThan(order.indexOf(TRIGGER));
    expect(order.indexOf(TRIGGER)).toBeLessThan(order.indexOf(UPDATED_AT_TRIGGER));
    if (order.includes(OWNER_EDIT_TRIGGER)) expect(order.indexOf(OWNER_EDIT_TRIGGER)).toBeLessThan(order.indexOf(TRIGGER));
  });

  it('no Edge Function names the column: the trigger is its only writer', () => {
    const files = tsFiles(FUNCTIONS_DIR);
    expect(files.length).toBeGreaterThan(20);
    const writers = files.filter((f) => readFileSync(f, 'utf8').includes('may_wait_decided_at'));
    expect(writers).toEqual([]);
  });
});
