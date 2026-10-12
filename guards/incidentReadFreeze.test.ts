import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { FLOOR_READ_HOURS } from '../lib/incidentFloor';

import { stripSqlComments } from './sqlComments';

// ─────────────────────────────────────────────────────────────────────────────
// The columns a client may not move on `event_ai_analysis`, read from the LAST
// definition of `freeze_event_ai_analysis_stamps()` across the migration replay
// (Engines v3 PR-25, CUL-1133; rls-privacy-reviewer L4 on 079).
//
// lib/functionHardening.test.ts proves the function's POSTURE (INVOKER, pinned,
// no client EXECUTE) and would stay green if a later CREATE OR REPLACE copied
// 075's body forward and dropped 079's `tier` line, or if the trigger were
// dropped. Either would let a client rewrite a call-now read to `logged` on its
// own row, and readers' max(tier, recommendation) would still show a quieter
// call than the server gave. This reads what the body FREEZES and that the
// trigger still calls it.
//
// SERVER_OWNED is a decision, not a derivation: each entry is a column the
// server decides on (075's stamps, 079's tier). Adding a server-owned column to
// the table means adding it here and to the body. Each entry is checked against
// the migrations' ADD COLUMNs, so a stale name reds too.
//
// 088 (CUL-1668) adds the owner-edit take-back: a client edit of a read lowers
// `may_wait` TRUE -> NULL on the row and its neighbours within 72 h. The freeze
// opens exactly that one transition so the sweep can run as the owner. The
// second half of this file pins the exception's shape, the edit's column set
// (derived from the server predicate's own reads, not restated), both triggers,
// the client-role gate, the lower-only sweep, and the 72 h mirror.
//
// WHAT IT CANNOT SEE: the live database (a dashboard edit), a writer that
// reaches the row as a role the body exempts (the deny-list shape 075 chose),
// and the trigger's runtime behaviour (088's PR proves that against a scratch
// Postgres 16; the probe is in the PR body).
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const FN = 'freeze_event_ai_analysis_stamps';
const TRIGGER = 'trg_event_ai_analysis_stamps_frozen';
const TAKE_BACK_FN = 'take_back_may_wait_on_owner_edit';
const PREDICATE_SRC = join(__dirname, '..', 'supabase', 'functions', '_shared', 'incidentMayWait.ts');

const SERVER_OWNED = [
  'photo_set_key', // 075
  'model_id', // 075
  'prompt_hash', // 075
  'rule_version', // 075
  'engine_flags', // 075
  'tier', // 079, CUL-1133
  'intake_correction_at', // 085, CUL-1406
  'intake_correction_meals', // 085, CUL-1406
  'intake_correction_most_or_all', // 085, CUL-1406
  'intake_correction_unrated', // 086, CUL-1406
  'intake_read_at', // 086, CUL-1406
  'may_wait', // 087, CUL-1627 (088: TRUE -> NULL open, lower-only)
  'ai_raw_payload', // 088, CUL-1668 (013's column; PM ruled A)
  'visual_flags', // 088, CUL-1668 (013's column; PM ruled A)
  'may_wait_decided_at', // 094, CUL-1707
] as const;

// The one exception the freeze carries: a client may lower `may_wait` TRUE ->
// NULL, nothing else (088). Whitespace-normalised before comparing.
const MAY_WAIT_EXCEPTION =
  '(NEW.may_wait IS DISTINCT FROM OLD.may_wait AND NOT (OLD.may_wait IS TRUE AND NEW.may_wait IS NULL))';

interface Replay {
  lastBody: string | null;
  lastBodyFile: string | null;
  triggerLive: boolean;
  addedColumns: Set<string>;
  takeBackBody: string | null;
  /** Every live trigger on event_ai_analysis: name -> `<timing> <events>` and the function. */
  triggers: Map<string, { timing: string; fn: string }>;
}

function replay(): Replay {
  const out: Replay = {
    lastBody: null, lastBodyFile: null, triggerLive: false, addedColumns: new Set(), takeBackBody: null, triggers: new Map(),
  };
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const createFn = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi',
  );
  const createTrg = new RegExp(`CREATE\\s+TRIGGER\\s+${TRIGGER}\\b[\\s\\S]*?EXECUTE\\s+FUNCTION\\s+(?:public\\.)?(\\w+)`, 'gi');
  const dropTrg = new RegExp(`DROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${TRIGGER}\\b`, 'gi');
  const createTakeBack = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${TAKE_BACK_FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi',
  );
  const anyTrg =
    /CREATE\s+TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\s+([\w\s]+?)\s+ON\s+(?:public\.)?event_ai_analysis\b[\s\S]*?EXECUTE\s+FUNCTION\s+(?:public\.)?(\w+)/gi;
  const anyDrop = /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?event_ai_analysis\b/gi;

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));

    // Statement order within a file matters for the trigger; collect positions.
    const events: { at: number; apply: () => void }[] = [];
    for (const m of sql.matchAll(createFn)) {
      events.push({ at: m.index ?? 0, apply: () => { out.lastBody = m[1]; out.lastBodyFile = file; } });
    }
    for (const m of sql.matchAll(createTrg)) {
      events.push({ at: m.index ?? 0, apply: () => { out.triggerLive = m[1].toLowerCase() === FN; } });
    }
    for (const m of sql.matchAll(dropTrg)) {
      events.push({ at: m.index ?? 0, apply: () => { out.triggerLive = false; } });
    }
    for (const m of sql.matchAll(createTakeBack)) {
      events.push({ at: m.index ?? 0, apply: () => { out.takeBackBody = m[1]; } });
    }
    for (const m of sql.matchAll(anyTrg)) {
      const timing = `${m[2]} ${m[3].replace(/\s+/g, ' ')}`.toUpperCase();
      events.push({ at: m.index ?? 0, apply: () => { out.triggers.set(m[1].toLowerCase(), { timing, fn: m[4].toLowerCase() }); } });
    }
    for (const m of sql.matchAll(anyDrop)) {
      events.push({ at: m.index ?? 0, apply: () => { out.triggers.delete(m[1].toLowerCase()); } });
    }
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());

    // The columns 013's CREATE TABLE declares (ai_raw_payload, visual_flags, edited_at, colour…).
    for (const create of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?event_ai_analysis\s*\(([\s\S]*?)\n\);/gi)) {
      for (const col of create[1].matchAll(/^\s*([a-z_]\w*)\s+[A-Za-z]/gim)) {
        const name = col[1].toLowerCase();
        if (!['constraint', 'primary', 'unique', 'check', 'foreign'].includes(name)) out.addedColumns.add(name);
      }
    }

    // ADD COLUMN names inside an ALTER TABLE on event_ai_analysis.
    for (const alter of sql.matchAll(/ALTER\s+TABLE\s+(?:public\.)?event_ai_analysis\b([\s\S]*?);/gi)) {
      for (const col of alter[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
        out.addedColumns.add(col[1].toLowerCase());
      }
    }
  }
  return out;
}

const live = replay();

describe('event_ai_analysis: the server-owned columns stay frozen for clients', () => {
  it('finds the freeze function and the migration that last defined it', () => {
    expect(live.lastBody).not.toBeNull();
    expect(live.lastBodyFile).toMatch(/^\d{3}_.*\.sql$/);
  });

  it('the freeze trigger exists at the end of the replay and calls the function', () => {
    expect(live.triggerLive).toBe(true);
  });

  it('every server-owned column is a real column on the table', () => {
    for (const col of SERVER_OWNED) expect(live.addedColumns).toContain(col);
  });

  it.each(SERVER_OWNED)('the last freeze body refuses a client change to %s', (col) => {
    const body = live.lastBody ?? '';
    expect(body).toMatch(new RegExp(`NEW\\.${col}\\s+IS\\s+DISTINCT\\s+FROM\\s+OLD\\.${col}\\b`, 'i'));
  });

  it('the body still judges by client role and raises the privilege error', () => {
    const body = live.lastBody ?? '';
    expect(body).toMatch(/current_user\s+IN\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)/i);
    expect(body).toMatch(/ERRCODE\s*=\s*'42501'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 088: an owner edit takes back the leave to wait.
// ─────────────────────────────────────────────────────────────────────────────

const squash = (s: string) => s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

// The columns the server's may_wait predicate reads off a stored row: the
// blood / foreign-material / colour columns (`columnBlockers`), what a settled
// photo read needs (`photoReadSettled`), and what a neighbour is judged on
// (`neighbourRefuses`). Read off the source so a column the predicate starts
// reading reds here until it is frozen or in the edit set.
function predicateColumns(): string[] {
  const src = readFileSync(PREDICATE_SRC, 'utf8');
  const slice = (fn: string, varName: string): string[] => {
    const start = src.indexOf(`export function ${fn}(`);
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n}\n', start);
    return [...src.slice(start, end).matchAll(new RegExp(`\\b${varName}\\.(\\w+)`, 'g'))].map((m) => m[1]);
  };
  const cols = [...slice('columnBlockers', 'row'), ...slice('photoReadSettled', 'row'), ...slice('neighbourRefuses', 'a')];
  return [...new Set(cols)].sort();
}

// The edit set the take-back reacts to, read off the body's `IF NOT (...) THEN RETURN NEW` gate.
function editColumns(body: string): string[] {
  const gate = /IF\s+NOT\s*\(([\s\S]*?)\)\s*THEN\s+RETURN\s+NEW\s*;/i.exec(body);
  expect(gate).not.toBeNull();
  return [...(gate?.[1] ?? '').matchAll(/NEW\.(\w+)\s+IS\s+DISTINCT\s+FROM\s+OLD\.(\w+)/gi)]
    .map((m) => {
      expect(m[1].toLowerCase()).toBe(m[2].toLowerCase());
      return m[1].toLowerCase();
    })
    .sort();
}

describe('event_ai_analysis: the freeze opens TRUE -> NULL on may_wait and nothing else (088)', () => {
  it('the may_wait clause is exactly the lower-only exception', () => {
    expect(squash(live.lastBody ?? '')).toContain(squash(MAY_WAIT_EXCEPTION));
  });

  it('no other frozen column carries an exception', () => {
    const body = squash(live.lastBody ?? '');
    expect(body.match(/\bAND NOT\b/gi) ?? []).toHaveLength(1);
    for (const col of SERVER_OWNED.filter((c) => c !== 'may_wait')) {
      expect(body).toMatch(new RegExp(`(?:\\(|OR )NEW\\.${col} IS DISTINCT FROM OLD\\.${col}(?= OR |\\))`, 'i'));
    }
  });
});

describe('event_ai_analysis: an owner edit takes back may_wait on the row and its neighbours (088)', () => {
  const body = live.takeBackBody ?? '';

  it('the take-back function exists at the end of the replay', () => {
    expect(live.takeBackBody).not.toBeNull();
  });

  it('runs on BEFORE UPDATE and AFTER UPDATE triggers', () => {
    const timings = [...live.triggers.values()].filter((t) => t.fn === TAKE_BACK_FN).map((t) => t.timing).sort();
    expect(timings).toEqual(['AFTER UPDATE', 'BEFORE UPDATE']);
  });

  it('judges client roles only: a server write keeps its own may_wait', () => {
    expect(body).toMatch(/IF\s+current_user\s+NOT\s+IN\s*\(\s*'anon'\s*,\s*'authenticated'\s*\)\s+THEN\s+RETURN\s+NEW\s*;/i);
  });

  it('reacts to edited_at, and every column the server predicate reads is frozen or in the edit set', () => {
    const cols = editColumns(body);
    expect(cols).toContain('edited_at');
    const reads = predicateColumns();
    // Non-vacuity: the three slices found the columns they are known to read.
    for (const known of ['colour', 'blood_present', 'status', 'contextual_flags', 'ai_raw_payload']) expect(reads).toContain(known);
    const frozen: readonly string[] = SERVER_OWNED;
    for (const c of reads) {
      expect({ column: c, covered: frozen.includes(c) || cols.includes(c) }).toEqual({ column: c, covered: true });
    }
  });

  it('never reacts to a dismissal or to may_wait itself (no recursion through the sweep)', () => {
    const cols = editColumns(body);
    expect(cols).not.toContain('dismissed_at');
    expect(cols).not.toContain('may_wait');
  });

  it('the BEFORE arm lowers only a TRUE on the edited row, to NULL', () => {
    expect(squash(body)).toMatch(/IF TG_WHEN = 'BEFORE' THEN IF NEW\.may_wait IS TRUE THEN NEW\.may_wait := NULL; END IF; RETURN NEW; END IF;/i);
  });

  it('the sweep lowers only TRUEs, to NULL, scoped to the same pet', () => {
    const sweep = /UPDATE\s+public\.event_ai_analysis\s+a\s+SET\s+([\s\S]*?)\s+WHERE\s+([\s\S]*?);/i.exec(body);
    expect(sweep).not.toBeNull();
    expect(squash(sweep?.[1] ?? '')).toBe('may_wait = NULL');
    const where = squash(sweep?.[2] ?? '');
    expect(where).toMatch(/^a\.may_wait IS TRUE AND /i);
    // Either row's pet, analysis side or event side (CUL-882 both directions).
    expect(where).toMatch(/AND \(a\.pet_id IN \(NEW\.pet_id, v_event_pet\) OR EXISTS \(SELECT 1 FROM public\.events p WHERE p\.id = a\.event_id AND p\.pet_id IN \(NEW\.pet_id, v_event_pet\)\)\) AND /i);
  });

  it('the neighbourhood is the server floor\'s reach, either side (mirrored from FLOOR_READ_HOURS)', () => {
    const src = readFileSync(PREDICATE_SRC, 'utf8');
    expect(src).toMatch(/export const MAY_WAIT_NEIGHBOUR_HOURS = FLOOR_READ_HOURS\b/);
    const bounds = [...body.matchAll(/v_anchor\s*([+-])\s*interval\s*'(\d+)\s+hours'/gi)];
    expect(bounds.map((b) => b[1]).sort()).toEqual(['+', '-']);
    for (const b of bounds) expect(Number(b[2])).toBe(FLOOR_READ_HOURS);
  });

  it('an unreadable anchor lowers every TRUE on the pet (fail closed)', () => {
    expect(squash(body)).toMatch(/AND \(v_anchor IS NULL OR EXISTS \(/i);
  });
});
