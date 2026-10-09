import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { FLOOR_READ_HOURS } from '../lib/incidentFloor';

import { stripSqlComments } from './sqlComments';

// ─────────────────────────────────────────────────────────────────────────────
// 092 (CUL-1682): a photo landing, leaving or moving takes back a stored leave
// to wait. The server grants `may_wait` TRUE only over photos it read
// (`photoReadSettled`: the payload's `read_photo_set_key` must equal the photo
// set NOW, on the read and on every photographed neighbour), but it checks that
// only when it writes. A photo the retry queue lands later asks for nothing, so
// `take_back_may_wait_on_photo_change()` lowers TRUE -> NULL on the touched
// event's own TRUE and, for a vomit / stool, on every TRUE of the pet within
// 090's incident window.
//
// This file replays the migrations (the last definition wins) and pins: the two
// triggers and when they fire, the lower-only write, the self / neighbour /
// fail-closed clauses, the window against the TS constant it mirrors (C-34),
// the incident types against the reader's, and the predicate lines the trigger
// is the answer to, so a predicate that stops reading photo sets reds here.
// The INVOKER / pinned / revoked posture is lib/functionHardening.test.ts's.
//
// WHAT IT CANNOT SEE: the live database, and the trigger's runtime behaviour.
// The PR proves the behaviour against a scratch Postgres 16 (30 cases: 30 pass
// with 092; without it the 13 lowering cases fail and the 17 keep cases pass;
// 13 mutants, each killed; the probe is in the PR body).
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const PREDICATE_SRC = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'incidentMayWait.ts'), 'utf8');
const EVIDENCE_SRC = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'incidentMayWaitEvidence.ts'), 'utf8');
const FN = 'take_back_may_wait_on_photo_change';

interface Trigger { timing: string; fn: string; when: string }

function replay(): { body: string | null; triggers: Map<string, Trigger> } {
  let body: string | null = null;
  const triggers = new Map<string, Trigger>();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const createFn = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi',
  );
  const createTrg =
    /CREATE\s+TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\s+([\w\s,]+?)\s+ON\s+(?:public\.)?event_attachments\b([\s\S]*?)EXECUTE\s+FUNCTION\s+(?:public\.)?(\w+)/gi;
  const dropTrg = /DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?event_attachments\b/gi;
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    const steps: { at: number; apply: () => void }[] = [];
    for (const m of sql.matchAll(createFn)) steps.push({ at: m.index ?? 0, apply: () => { body = m[1]; } });
    for (const m of sql.matchAll(createTrg)) {
      steps.push({
        at: m.index ?? 0,
        apply: () => {
          triggers.set(m[1].toLowerCase(), {
            timing: `${m[2]} ${m[3].replace(/\s+/g, ' ').trim()}`.toUpperCase(),
            fn: m[5].toLowerCase(),
            when: m[4].replace(/\s+/g, ' ').trim(),
          });
        },
      });
    }
    for (const m of sql.matchAll(dropTrg)) steps.push({ at: m.index ?? 0, apply: () => { triggers.delete(m[1].toLowerCase()); } });
    steps.sort((a, b) => a.at - b.at).forEach((s) => s.apply());
  }
  return { body, triggers };
}

const live = replay();
const body: string = live.body ?? '';
const squash = (s: string) => s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
const flat = squash(body);
const mine = [...live.triggers.entries()].filter(([, t]) => t.fn === FN);

describe('092: the function and its two triggers', () => {
  it('the function exists at the end of the replay', () => {
    expect(live.body).not.toBeNull();
  });

  it('runs on exactly the two planned triggers, both AFTER, both this function', () => {
    expect(mine.map(([n, t]) => `${n}: ${t.timing}`).sort()).toEqual([
      'trg_event_attachments_may_wait_photo: AFTER INSERT OR DELETE',
      'trg_event_attachments_may_wait_photo_move: AFTER UPDATE OF EVENT_ID, PET_ID',
    ]);
  });

  it('insert and delete fire unconditionally: every photo landing or leaving counts', () => {
    expect(live.triggers.get('trg_event_attachments_may_wait_photo')?.when).toBe('FOR EACH ROW');
  });

  // The client writes attachments with `upsert(…, { onConflict: 'id' })`, so a
  // retry of a landed row is an ON CONFLICT DO UPDATE naming both columns with
  // the same values: an unguarded UPDATE OF would lower a settled TRUE on it.
  it('the move fires only when a column it names actually moves', () => {
    const t = live.triggers.get('trg_event_attachments_may_wait_photo_move');
    const listed = /UPDATE OF (.*)/.exec(t?.timing ?? '')?.[1].toLowerCase().split(/\s*,\s*/).sort() ?? [];
    const named = [...(t?.when ?? '').matchAll(/OLD\.(\w+) IS DISTINCT FROM NEW\.(\w+)/g)].map((m) => {
      expect(m[1]).toBe(m[2]);
      return m[1];
    });
    expect(named.sort()).toEqual(listed);
    expect(listed).toEqual(['event_id', 'pet_id']);
  });

  // Derived, not restated: every event_attachments column the evidence reader
  // keys a photo set on is one a move watches.
  it('the move watches every column the evidence reader reads off event_attachments', () => {
    const cols = new Set<string>();
    for (const chain of EVIDENCE_SRC.split(".from('event_attachments')").slice(1)) {
      const head = chain.slice(0, 400);
      const sel = /\.select\('([^']*)'\)/.exec(head)?.[1] ?? '';
      for (const c of sel.split(',')) if (c.trim()) cols.add(c.trim());
      for (const f of head.matchAll(/\.(?:eq|in)\('(\w+)'/g)) cols.add(f[1]);
    }
    cols.delete('id');
    // Non-vacuity: the reader is known to group photos by their event.
    expect([...cols]).toContain('event_id');
    const listed = /UPDATE OF (.*)/.exec(live.triggers.get('trg_event_attachments_may_wait_photo_move')?.timing ?? '')?.[1]
      .toLowerCase().split(/\s*,\s*/) ?? [];
    for (const c of cols) expect({ column: c, watched: listed.includes(c) }).toEqual({ column: c, watched: true });
  });

  it('every role fires: no current_user gate (no server path re-checks after an attachment write)', () => {
    expect(body).not.toMatch(/current_user/i);
  });

  it('both sides of a move are touched (OLD on delete and update, NEW on insert and update)', () => {
    expect(flat).toContain("IF TG_OP IN ('INSERT', 'UPDATE') THEN v_events := v_events || NEW.event_id; v_pets := v_pets || NEW.pet_id; END IF;");
    expect(flat).toContain("IF TG_OP IN ('DELETE', 'UPDATE') THEN v_events := v_events || OLD.event_id; v_pets := v_pets || OLD.pet_id; END IF;");
  });
});

describe('092: lower-only', () => {
  it('the one write is may_wait = NULL on a TRUE', () => {
    const updates = [...body.matchAll(/UPDATE\s+public\.(\w+)\s+a\s+SET\s+([\s\S]*?)\s+WHERE\s+([\s\S]*?);/gi)];
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toBe('event_ai_analysis');
    expect(squash(updates[0][2])).toBe('may_wait = NULL');
    expect(squash(updates[0][3])).toMatch(/^a\.may_wait IS TRUE AND /);
    expect(body.match(/\bINSERT\s+INTO\b|\bDELETE\s+FROM\b/gi) ?? []).toHaveLength(0);
  });

  it('the touched event\'s own TRUE is lowered, whatever its type (self)', () => {
    expect(flat).toContain('AND (a.event_id = ANY (v_events) OR EXISTS (');
  });

  it('either row\'s pet matches, against either the attachment\'s or the event\'s pet (CUL-882)', () => {
    expect(flat).toContain('WHERE (a.pet_id = t.pet OR a.pet_id = p.pet_id OR n.pet_id = t.pet OR n.pet_id = p.pet_id)');
  });

  it('fails closed: an unreadable touched event or TRUE anchor lowers', () => {
    expect(flat).toContain('AND (p.id IS NULL OR (');
    expect(flat).toContain('AND (n.occurred_at IS NULL OR (');
    expect(flat).toContain('LEFT JOIN public.events p ON p.id = t.event_id');
    expect(flat).toContain('LEFT JOIN public.events n ON n.id = a.event_id');
  });
});

describe('092: it answers the predicate (C-34)', () => {
  it('the predicate grants leave only over a photo set it read, on the read and on every neighbour', () => {
    // The lines this trigger is the database-side answer to. If the predicate
    // stops comparing photo sets, this trigger's reason changes with it.
    expect(PREDICATE_SRC).toMatch(/export const READ_PHOTO_SET_KEY = 'read_photo_set_key'/);
    expect(PREDICATE_SRC).toMatch(/return typeof readKey === 'string' && readKey === currentPhotoSetKey/);
    expect(PREDICATE_SRC).toMatch(/if \(n\.hasPhoto && !photoReadSettled\(a, n\.photoSetKey\)\) return true/);
    expect(EVIDENCE_SRC).toMatch(/settled: !r\.error && \(!params\.hasPhoto \|\| photoReadSettled\(r, params\.photoSetKey\)\)/);
  });

  it('the neighbour window is 090\'s incident window: twice MAY_WAIT_NEIGHBOUR_HOURS either side', () => {
    expect(PREDICATE_SRC).toMatch(/export const MAY_WAIT_NEIGHBOUR_HOURS = FLOOR_READ_HOURS\b/);
    // Non-vacuity: the value the window is derived from.
    expect(FLOOR_READ_HOURS).toBe(72);
    expect(EVIDENCE_SRC).toMatch(/\.gte\('occurred_at', iso\(anchorMs - 2 \* reach\)\)/);
    expect(EVIDENCE_SRC).toMatch(/\.lte\('occurred_at', iso\(anchorMs \+ 2 \* reach\)\)/);
    expect(flat).toContain(
      `n.occurred_at >= p.occurred_at - 2 * interval '${FLOOR_READ_HOURS} hours' AND n.occurred_at <= p.occurred_at + 2 * interval '${FLOOR_READ_HOURS} hours'`,
    );
    const hours = [...body.matchAll(/interval\s+'(\d+)\s+hours'/gi)].map((m) => Number(m[1]));
    expect(hours).toEqual([FLOOR_READ_HOURS, FLOOR_READ_HOURS]);
  });

  it('a neighbour is an incident the predicate reads (MAY_WAIT_INCIDENT_TYPES)', () => {
    const m = /export const MAY_WAIT_INCIDENT_TYPES = \[([^\]]*)\]/.exec(EVIDENCE_SRC);
    expect(m).not.toBeNull();
    const ts = [...(m?.[1] ?? '').matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
    expect(ts).toEqual(['diarrhea', 'stool_normal', 'vomit']);
    const site = /p\.event_type::text IN \(([^)]*)\)/.exec(flat);
    expect(site).not.toBeNull();
    expect([...(site?.[1] ?? '').matchAll(/'(\w+)'/g)].map((x) => x[1]).sort()).toEqual(ts);
  });
});
