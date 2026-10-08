import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { FLOOR_LETHARGY_HOURS, FLOOR_READ_HOURS } from '../lib/incidentFloor';

import { stripSqlComments } from './sqlComments';

// ─────────────────────────────────────────────────────────────────────────────
// 089 (CUL-1671): a change on the events side takes back a stored leave to wait.
//
// `take_back_may_wait_on_record_change()` lowers `may_wait` TRUE -> NULL when a
// lethargy is logged, a cat's rated meal lands, moves or is re-rated, or an
// event is re-dated, re-typed, moved between pets or un-deleted. Each window is
// a MIRROR of the server predicate (incidentMayWait.ts): same value, same
// question (C-34). This file pins each window to the TS constant it mirrors,
// read off the shipped source, and pins the predicate lines the window is the
// answer to, so a predicate that changes what it reads reds here until 089's
// successor moves with it.
//
// It replays the migrations (the last definition of the function wins) and
// checks the body; the INVOKER / pinned / revoked posture is
// lib/functionHardening.test.ts's.
//
// WHAT IT CANNOT SEE: the live database (a dashboard edit), and the trigger's
// runtime behaviour. 089's PR proves the behaviour against a scratch Postgres 16
// (41 cases: 41 pass on 089; on 088 alone the 25 lowering cases fail and the 16
// keep cases pass; the probe is in the PR body). Every rule here and in the probe
// is mutation-proven (the PR body lists the mutants).
// The stated blind spots of the trigger itself are in 089's header.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const PREDICATE_SRC = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'incidentMayWait.ts'), 'utf8');
const EVIDENCE_SRC = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'incidentMayWaitEvidence.ts'), 'utf8');
const FN = 'take_back_may_wait_on_record_change';

interface Replay {
  body: string | null;
  /** name -> { timing, table, fn, when } for the live triggers on events / meals. */
  triggers: Map<string, { timing: string; table: string; fn: string; when: string }>;
}

function replay(): Replay {
  const out: Replay = { body: null, triggers: new Map() };
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const createFn = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi',
  );
  const createTrg =
    /CREATE\s+TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\s+([\w\s,]+?)\s+ON\s+(?:public\.)?(events|meals)\b([\s\S]*?)EXECUTE\s+FUNCTION\s+(?:public\.)?(\w+)/gi;
  const dropTrg = /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?(events|meals)\b/gi;
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    const steps: { at: number; apply: () => void }[] = [];
    for (const m of sql.matchAll(createFn)) steps.push({ at: m.index ?? 0, apply: () => { out.body = m[1]; } });
    for (const m of sql.matchAll(createTrg)) {
      steps.push({
        at: m.index ?? 0,
        apply: () => {
          out.triggers.set(m[1].toLowerCase(), {
            timing: `${m[2]} ${m[3].replace(/\s+/g, ' ').trim()}`.toUpperCase(),
            table: m[4].toLowerCase(),
            fn: m[6].toLowerCase(),
            when: m[5].replace(/\s+/g, ' ').trim(),
          });
        },
      });
    }
    for (const m of sql.matchAll(dropTrg)) steps.push({ at: m.index ?? 0, apply: () => { out.triggers.delete(m[1].toLowerCase()); } });
    steps.sort((a, b) => a.at - b.at).forEach((s) => s.apply());
  }
  return out;
}

const live = replay();
const body = live.body ?? '';
const squash = (s: string) => s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
const flat = squash(body);

// A TS constant's value, read off the shipped source: `export const NAME = <expr>`,
// where <expr> is a number, a product of numbers, or a constant this file imports.
function tsConst(src: string, name: string): number {
  const m = new RegExp(`export const ${name}\\s*=\\s*([^\\n/]+)`).exec(src);
  expect({ name, found: !!m }).toEqual({ name, found: true });
  const expr = (m?.[1] ?? '').trim();
  const known: Record<string, number> = { FLOOR_READ_HOURS, FLOOR_LETHARGY_HOURS };
  if (expr in known) return known[expr];
  const product = /^(\d+)\s*\*\s*(\d+)$/.exec(expr);
  if (product) return Number(product[1]) * Number(product[2]);
  expect(expr).toMatch(/^\d+$/);
  return Number(expr);
}

const REACH = tsConst(PREDICATE_SRC, 'MAY_WAIT_NEIGHBOUR_HOURS');
const LETHARGY = tsConst(PREDICATE_SRC, 'MAY_WAIT_LETHARGY_HOURS');
const BASELINE = tsConst(PREDICATE_SRC, 'MAY_WAIT_INTAKE_BASELINE_HOURS');

// The sweep's window clause for one kind, `(t.kind = '<kind>' AND …)`, up to the
// next kind's clause or the end of the WHERE.
function windowOf(kind: string): string {
  const start = flat.indexOf(`(t.kind = '${kind}' AND`);
  expect({ kind, found: start > -1 }).toEqual({ kind, found: true });
  const next = flat.indexOf(' OR (t.kind = ', start + 1);
  return flat.slice(start, next === -1 ? flat.indexOf(';', start) : next);
}

describe('089: the function and its four triggers', () => {
  it('the function exists at the end of the replay', () => {
    expect(live.body).not.toBeNull();
  });

  it('runs on exactly the four planned triggers, all AFTER, all this function', () => {
    const mine = [...live.triggers.entries()].filter(([, t]) => t.fn === FN);
    expect(mine.map(([n, t]) => `${n}: ${t.timing} ON ${t.table}`).sort()).toEqual([
      'trg_events_may_wait_record_ins: AFTER INSERT ON events',
      'trg_events_may_wait_record_upd: AFTER UPDATE OF OCCURRED_AT, OCCURRED_AT_CONFIDENCE, PET_ID, EVENT_TYPE, DELETED_AT ON events',
      'trg_meals_may_wait_record_ins: AFTER INSERT ON meals',
      'trg_meals_may_wait_record_upd: AFTER UPDATE OF INTAKE_RATING, EVENT_ID, PET_ID ON meals',
    ]);
  });

  it('the insert triggers fire on a lethargy and on a rated meal', () => {
    expect(live.triggers.get('trg_events_may_wait_record_ins')?.when).toMatch(/WHEN \(NEW\.event_type = 'lethargy'\)/);
    expect(live.triggers.get('trg_meals_may_wait_record_ins')?.when).toMatch(/WHEN \(NEW\.intake_rating IS NOT NULL\)/);
  });

  it('the update triggers fire on every column they name moving (and only then)', () => {
    for (const name of ['trg_events_may_wait_record_upd', 'trg_meals_may_wait_record_upd']) {
      const t = live.triggers.get(name);
      const listed = /UPDATE OF (.*)/.exec(t?.timing ?? '')?.[1].toLowerCase().split(/\s*,\s*/).sort() ?? [];
      const named = [...(t?.when ?? '').matchAll(/OLD\.(\w+) IS DISTINCT FROM NEW\.(\w+)/g)].map((m) => {
        expect(m[1]).toBe(m[2]);
        return m[1];
      });
      expect({ name, when: named.sort() }).toEqual({ name, when: listed });
    }
  });

  // Derived, not restated (adversarial pass on 089: a hand-written list left
  // `occurred_at_confidence` unwatched while the floor keys T1 / T2 on it). Every
  // column the server's evidence reader reads off `events`, selected or filtered,
  // must be one the events trigger watches; every `meals` column it embeds, one the
  // meals trigger watches.
  function readerColumns(): { events: string[]; meals: string[] } {
    const start = EVIDENCE_SRC.indexOf('export async function readMayWaitRecord(');
    expect(start).toBeGreaterThan(-1);
    const fnSrc = EVIDENCE_SRC.slice(start, EVIDENCE_SRC.indexOf('\n}\n', start));
    const events = new Set<string>();
    const meals = new Set<string>();
    for (const chain of fnSrc.split(".from('").slice(1).filter((c) => c.startsWith("events')"))) {
      const body = chain.slice(0, chain.search(/ as unknown as /));
      const sel = /\.select\('([^']*)'\)/.exec(body)?.[1] ?? '';
      for (const embed of sel.matchAll(/(\w+)\(([^)]*)\)/g)) {
        expect(embed[1]).toBe('meals');
        for (const c of embed[2].split(',')) meals.add(c.trim());
      }
      for (const c of sel.replace(/\w+\([^)]*\)/g, '').split(',')) if (c.trim()) events.add(c.trim());
      for (const f of body.matchAll(/\.(?:eq|is|in|gte|lte)\('(\w+)'/g)) events.add(f[1]);
    }
    events.delete('id');
    return { events: [...events].sort(), meals: [...meals].sort() };
  }

  it('the events trigger watches every column the evidence reader reads off events', () => {
    const { events } = readerColumns();
    // Non-vacuity: the columns the reader is known to read.
    for (const known of ['occurred_at', 'occurred_at_confidence', 'event_type', 'pet_id', 'deleted_at']) expect(events).toContain(known);
    const listed = /UPDATE OF (.*)/.exec(live.triggers.get('trg_events_may_wait_record_upd')?.timing ?? '')?.[1].toLowerCase().split(/\s*,\s*/) ?? [];
    for (const c of events) expect({ column: c, watched: listed.includes(c) }).toEqual({ column: c, watched: true });
    // And each counts as a move (deleted_at counts only on an un-delete).
    for (const c of events.filter((x) => x !== 'deleted_at')) {
      expect(flat).toMatch(new RegExp(`v_moved := [^;]*NEW\\.${c} IS DISTINCT FROM OLD\\.${c}`));
    }
  });

  it('the meals trigger watches every meals column the reader embeds, and the join key', () => {
    const { meals } = readerColumns();
    expect(meals).toEqual(['intake_rating']);
    const listed = /UPDATE OF (.*)/.exec(live.triggers.get('trg_meals_may_wait_record_upd')?.timing ?? '')?.[1].toLowerCase().split(/\s*,\s*/) ?? [];
    for (const c of [...meals, 'event_id']) expect({ column: c, watched: listed.includes(c) }).toEqual({ column: c, watched: true });
  });

  it('every role fires: no current_user gate (no server path re-checks after an events write)', () => {
    expect(body).not.toMatch(/current_user/i);
  });
});

describe('089: lower-only', () => {
  it('the one write is may_wait = NULL on a TRUE', () => {
    const updates = [...body.matchAll(/UPDATE\s+public\.(\w+)\s+a\s+SET\s+([\s\S]*?)\s+WHERE\s+([\s\S]*?);/gi)];
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toBe('event_ai_analysis');
    expect(squash(updates[0][2])).toBe('may_wait = NULL');
    expect(squash(updates[0][3])).toMatch(/^a\.may_wait IS TRUE AND /);
    expect(body.match(/\bINSERT\s+INTO\b|\bDELETE\s+FROM\b/gi) ?? []).toHaveLength(0);
  });

  it('the moved event\'s own TRUE is lowered (self)', () => {
    expect(flat).toContain('(a.event_id = ANY (v_self) OR EXISTS (');
    expect(flat).toMatch(/IF v_moved THEN v_self := v_self \|\| NEW\.id;/);
  });

  it('either row\'s pet matches (CUL-882, both directions)', () => {
    expect(flat).toContain('AND (a.pet_id = t.pet OR n.pet_id = t.pet)');
  });

  it('fails closed: an unreadable anchor or touch time lowers', () => {
    expect(flat).toContain('AND (n.occurred_at IS NULL OR t.at IS NULL OR (t.kind =');
    expect(flat).toContain('LEFT JOIN public.events n ON n.id = a.event_id');
  });
});

describe('089: each window mirrors the server predicate (C-34)', () => {
  it('the constants are the floor\'s, as the predicate names them', () => {
    expect(PREDICATE_SRC).toMatch(/export const MAY_WAIT_NEIGHBOUR_HOURS = FLOOR_READ_HOURS\b/);
    expect(PREDICATE_SRC).toMatch(/export const MAY_WAIT_LETHARGY_HOURS = FLOOR_LETHARGY_HOURS\b/);
    // Non-vacuity: the values the windows are derived from.
    expect([REACH, LETHARGY, BASELINE]).toEqual([72, 24, 168]);
  });

  it('lethargy: anchor <= L + reach + a day, no lower bound (the predicate refuses lethargy logged since)', () => {
    // The predicate lines this window answers.
    expect(PREDICATE_SRC).toMatch(/const lethargyTo = Math\.max\(last \+ MAY_WAIT_LETHARGY_HOURS \* HOUR, record\.nowMs\)/);
    expect(PREDICATE_SRC).toMatch(/t >= first - MAY_WAIT_LETHARGY_HOURS \* HOUR && t <= lethargyTo/);
    expect(windowOf('lethargy')).toBe(
      `(t.kind = 'lethargy' AND n.occurred_at <= t.at + interval '${REACH} hours' + interval '${LETHARGY} hours')`,
    );
  });

  it('incident: anchor within twice the reach either side (the floor re-run on a neighbour)', () => {
    // The run and the floor re-run reach one window from the anchor; the reader
    // keeps neighbours inside it (the 144 h is that window twice).
    expect(PREDICATE_SRC).toMatch(/\.filter\(\(t\) => Number\.isFinite\(t\) && Math\.abs\(t - anchorMs\) <= reach\)\]/);
    expect(PREDICATE_SRC).toMatch(/if \(!Number\.isFinite\(t\) \|\| Math\.abs\(t - anchorMs\) > reach\) continue/);
    expect(EVIDENCE_SRC).toMatch(/const near = incidents\.filter\(\(e\) => e\.id !== p\.eventId && Math\.abs\(Date\.parse\(e\.occurred_at\) - anchorMs\) <= reach\)/);
    expect(EVIDENCE_SRC).toMatch(/\.gte\('occurred_at', iso\(anchorMs - 2 \* reach\)\)/);
    expect(EVIDENCE_SRC).toMatch(/\.lte\('occurred_at', iso\(anchorMs \+ 2 \* reach\)\)/);
    expect(windowOf('incident')).toBe(
      `(t.kind = 'incident' AND n.occurred_at >= t.at - 2 * interval '${REACH} hours' AND n.occurred_at <= t.at + 2 * interval '${REACH} hours')`,
    );
  });

  it('meal: [M - reach, M + reach + the week], or every TRUE when M is in the week before now', () => {
    expect(PREDICATE_SRC).toMatch(/if \(!tracksIntakeAt\(record\.meals, record\.nowMs\)\) return false/);
    expect(PREDICATE_SRC).toMatch(/for \(const t of \[\.\.\.vomitTimes, record\.nowMs\]\)/);
    // The run's vomits sit one window from the anchor (the 72 h either side of M).
    expect(PREDICATE_SRC).toMatch(/const vomitTimes = record\.vomits\.map\(\(v\) => Date\.parse\(v\.at\)\)\.filter\(\(t\) => Number\.isFinite\(t\) && Math\.abs\(t - anchorMs\) <= reach\)/);
    expect(windowOf('meal')).toBe(
      `(t.kind = 'meal' AND ((n.occurred_at >= t.at - interval '${REACH} hours' AND n.occurred_at <= t.at + interval '${REACH} hours' + interval '${BASELINE} hours') OR t.at >= now() - interval '${BASELINE} hours')))))`,
    );
  });

  it('meal: cats only, an unreadable species counts as a cat', () => {
    expect(PREDICATE_SRC).toMatch(/if \(record\.species === 'cat'\) \{/);
    expect(flat).toContain("AND (t.kind <> 'meal' OR NOT EXISTS (SELECT 1 FROM public.pets s WHERE s.id = t.pet AND s.species::text <> 'cat'))");
  });

  it('every interval in the body is one of the mirrored constants', () => {
    const hours = [...body.matchAll(/interval\s+'(\d+)\s+hours'/gi)].map((m) => Number(m[1]));
    expect(hours.length).toBeGreaterThanOrEqual(8);
    for (const h of hours) expect([REACH, LETHARGY, BASELINE]).toContain(h);
  });
});

describe('089: the kinds are the predicate\'s event types', () => {
  it('the incident types are MAY_WAIT_INCIDENT_TYPES, at both the old and the new place', () => {
    const m = /export const MAY_WAIT_INCIDENT_TYPES = \[([^\]]*)\]/.exec(EVIDENCE_SRC);
    expect(m).not.toBeNull();
    const ts = [...(m?.[1] ?? '').matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
    expect(ts).toEqual(['diarrhea', 'stool_normal', 'vomit']);
    const sites = [...flat.matchAll(/WHEN (OLD|NEW)\.event_type::text IN \(([^)]*)\) THEN 'incident'/g)];
    expect(sites.map((s) => s[1]).sort()).toEqual(['NEW', 'OLD']);
    for (const s of sites) expect([...s[2].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort()).toEqual(ts);
  });

  it('lethargy and meal are the types the predicate reads them by', () => {
    expect(EVIDENCE_SRC).toMatch(/\.eq\('event_type', 'lethargy'\)/);
    expect(EVIDENCE_SRC).toMatch(/\.eq\('event_type', 'meal'\)/);
    for (const side of ['OLD', 'NEW']) {
      expect(flat).toContain(`WHEN ${side}.event_type::text = 'lethargy' THEN 'lethargy'`);
      expect(flat).toContain(`WHEN ${side}.event_type::text = 'meal' THEN 'meal'`);
    }
  });

  it('a soft-deleted meal touches its old place; a soft-deleted vomit or lethargy touches nothing', () => {
    expect(flat).toMatch(/ELSIF OLD\.deleted_at IS NULL AND NEW\.deleted_at IS NOT NULL AND OLD\.event_type::text = 'meal' THEN/);
    expect(flat).toMatch(/OR \(OLD\.deleted_at IS NOT NULL AND NEW\.deleted_at IS NULL\);/);
  });
});
