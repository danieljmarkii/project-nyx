import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// ─────────────────────────────────────────────────────────────────────────────
// `event_ai_analysis.call_said_at` has one writer, the database (099, CUL-1754).
//
// A dated call now (PR-30c, lib/callNowDated.ts) counts its first 24 hours from the later of
// the event and this stamp. It moves only when the read's call level changes into a call, or
// a read at the same call level changes its flags (a new reason); it is kept on every other
// write (a Hide, an owner edit, a failed re-read, a may_wait write), which is the whole point:
// `updated_at`, which those writes move, was what PR-30c's adversarial passes 2-4 broke on.
//
// This replays the migrations and pins: the function's whole body, by equality (an extra arm,
// such as a re-stamp on any write, is the realistic regression); that its trigger is live,
// enabled and BEFORE INSERT OR UPDATE; the firing order read off the replay's own triggers
// (the freeze first, so a client's attempt is loud; updated_at after); that the freeze lists
// the column; and that no Edge Function WRITES the column (reading it is the point).
//
// WHAT IT CANNOT SEE: the trigger's runtime behaviour. 099's PR proved that on a scratch
// Postgres 16 (the cases are in the PR body). The live database is the advisors' and the
// PM's apply check.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const FN = 'stamp_call_said_at';
const TRIGGER = 'trg_event_ai_analysis_stamps_said_at';
const FREEZE_TRIGGER = 'trg_event_ai_analysis_stamps_frozen';
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

// The whole body, pinned by equality. Changing the body means changing this, in the same PR,
// on purpose.
const EXPECTED_BODY = squash(`
DECLARE
  new_level integer;
  old_level integer;
BEGIN
  new_level := CASE
    WHEN NEW.tier = 'call_now' THEN 2
    WHEN NEW.tier = 'call_today' OR NEW.recommendation::text = 'worth_a_call' THEN 1
    ELSE 0
  END;

  IF TG_OP = 'INSERT' THEN
    NEW.call_said_at := CASE WHEN new_level > 0 THEN now() END;
    RETURN NEW;
  END IF;

  old_level := CASE
    WHEN OLD.tier = 'call_now' THEN 2
    WHEN OLD.tier = 'call_today' OR OLD.recommendation::text = 'worth_a_call' THEN 1
    ELSE 0
  END;

  IF new_level = 0 THEN
    NEW.call_said_at := NULL;
  ELSIF new_level <> old_level
     OR NEW.visual_flags IS DISTINCT FROM OLD.visual_flags
     OR NEW.contextual_flags IS DISTINCT FROM OLD.contextual_flags THEN
    NEW.call_said_at := now();
  ELSE
    NEW.call_said_at := OLD.call_said_at;
  END IF;
  RETURN NEW;
END;`);

const beforeTriggers = () =>
  [...live.triggers].filter(([, t]) => t.timing.startsWith('BEFORE')).map(([name]) => name).sort();

function lastFreezeBody(): string | null {
  let found: string | null = null;
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?freeze_event_ai_analysis_stamps\s*\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/gi)) {
      found = m[1];
    }
  }
  return found;
}

describe('call_said_at: one writer, moved only when the call is said (099, CUL-1754)', () => {
  it('the function is live and its body is exactly the level rule', () => {
    expect(live.body).not.toBeNull();
    expect(body).toBe(EXPECTED_BODY);
  });

  it('its trigger is live and enabled, BEFORE INSERT OR UPDATE, calling it', () => {
    expect(live.triggers.get(TRIGGER)).toEqual({ timing: 'BEFORE INSERT OR UPDATE', fn: FN });
  });

  it('the freeze fires before it (a client attempt is refused, not silently held), updated_at after', () => {
    const order = beforeTriggers();
    expect(order).toContain(FREEZE_TRIGGER);
    expect(order).toContain(UPDATED_AT_TRIGGER);
    expect(order.indexOf(FREEZE_TRIGGER)).toBeLessThan(order.indexOf(TRIGGER));
    expect(order.indexOf(TRIGGER)).toBeLessThan(order.indexOf(UPDATED_AT_TRIGGER));
  });

  it('the freeze refuses a client UPDATE that moves the stamp', () => {
    expect(squash(lastFreezeBody() ?? '')).toContain('OR NEW.call_said_at IS DISTINCT FROM OLD.call_said_at');
  });

  it('no Edge Function writes the column: the trigger is its only writer (reads are allowed)', () => {
    const files = tsFiles(FUNCTIONS_DIR);
    expect(files.length).toBeGreaterThan(20);
    // An object-literal key or an assignment is a write; a select string or an optional type
    // field (`call_said_at?:`) is not.
    const writers = files.filter((f) => /['"]?\bcall_said_at['"]?\s*(?::(?!\s*(?:string|null|undefined)\b)|=(?!=))/.test(readFileSync(f, 'utf8')));
    expect(writers).toEqual([]);
  });
});
