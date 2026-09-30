// The care record: the call's note reaches no Edge Function, and the three tables stay
// append-only (Engines v3 PR-21; CUL-1415, CUL-1416; migration 082;
// docs/nyx-care-state-requirements.md §8.4, AC 12 and AC 13).
//
// WHAT THE RULES ARE.
//   1. THE NOTE. `vet_calls.note` is the owner's own words about a phone call to her vet.
//      "No model reads a note" (§6.6), and the report does not print call notes (§3.4,
//      GAP-27). Every model and every off-device render lives in `supabase/functions/`,
//      so no source there may ask for the note. The allow-set is EMPTY, and the empty set
//      is the assertion (C-32). The lookNotes guard's own allow-set holds
//      `generate-report/` for Appendix G; this one holds nothing.
//   2. EXPLICIT COLUMNS. The note scan is syntactic and cannot see a `select('*')` that
//      sweeps the note up. So every server read of the three tables must name its
//      columns, and a `*` or a missing select reds. The same holds for an embed from
//      another table (`vet_calls(*)`).
//   3. APPEND-ONLY BY RLS ALONE. These are pins over the migration FILES, replayed in
//      order, because a later migration that adds an UPDATE policy, re-grants a verb, or
//      hangs a DELETE trigger on a table would each quietly undo what 082 set up.
//   4. THE SIGN SET. `care_acknowledgements.symptom_type`'s CHECK must equal the signs
//      that can BE a concern: the chronicity lane's cell ∪ the worsening lane's cell
//      (§3.1). A lane that widens reds here until a migration widens the CHECK.
//      Otherwise the owner's answer about the new sign would be refused at rest with a
//      terminal 23514.
//
// ── WHAT IT DOES NOT CLAIM (C-38: a blind spot left unstated reads as coverage) ─────
//   · Syntactic. A table or column name assembled at runtime is invisible to it, and so
//     is a `.from(variable)`. `guards/visitReaders.test.ts` registers every dynamic
//     `.from()` in the product tree with the reason its name cannot reach a vet table.
//     A raw SQL `SELECT *` in a string is not flagged; a row swept into JSON is.
//   · The note scan is statement-scoped (to the enclosing `;` or blank line). A read
//     split across a blank line inside one chain would split the statement too.
//   · It scans `supabase/functions/` only. A shared `lib/` module an Edge Function
//     imports (the C-26 closure) is outside it; review covers that closure.
//   · Database-side reads are covered for migrations from 082 on: no VIEW over the three
//     tables and no function but the guard may name them. A reader defined by hand in the
//     dashboard is the B-505 class, below.
//   · A row-id existence oracle remains, and it is platform-generic: an INSERT reusing
//     another account's primary key fails with 23505 where a fresh id succeeds. It needs
//     an unguessable UUID that no path hands out. The pet-pair membership oracle is the
//     one 082 closes (rls-privacy-reviewer, 2026-09-30).
//   · Server-side only. The app legitimately shows the owner her own note (PR-36),
//     and no model runs on the device.
//   · It reads migration files, so it cannot see a policy changed by hand in the
//     dashboard (the B-505 class). The VERIFY block at the foot of 082 and `get_advisors`
//     cover that.
//   · It cannot execute plpgsql. The behavioural proof (every refusal, the oracle and its
//     mutant, the cascades) was run on a PG16 replay and is recorded in the PR.

import * as fs from 'fs';
import * as path from 'path';

import { LANE_SYMPTOM_TYPES } from '../supabase/functions/generate-signal/detection';
import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';
import { stripSqlComments } from './sqlComments';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const MIGRATION = '082_care_record.sql';

const TABLES = ['care_acknowledgements', 'vet_calls', 'vet_call_follow_ups'] as const;
const TABLE_ALT = TABLES.join('|');

/** Files excused from the note rule, each with its reason. Empty, and it stays empty
 *  until a PM ruling says a server surface may carry the owner's call note. */
const NOTE_ALLOWED: Readonly<Record<string, string>> = {};

export interface Hit {
  line: number;
  excerpt: string;
}

function offsetsOf(src: string, word: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`\\b${word}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m.index);
  return out;
}

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length;

/** The statement around `at`: back to the previous `;` or blank line, forward to the
 *  next one. A character window was the first draft, and a long column list pushed
 *  `note` past it (code-reviewer, measured at ~300 characters). A chain or a SQL string
 *  is one statement whichever way round it names the table and the column, and the
 *  scope grows with it. The repo's Deno files omit semicolons, so a blank line also
 *  ends a statement; otherwise a whole file would be one statement. */
function statementAround(src: string, at: number): { start: number; text: string } {
  const before = src.slice(0, at);
  const semi = before.lastIndexOf(';');
  const blank = before.search(/\n[ \t]*\n(?![\s\S]*\n[ \t]*\n)/);
  const start = Math.max(semi + 1, blank === -1 ? 0 : blank + 1);
  const after = src.slice(at);
  const ends = [after.indexOf(';'), after.search(/\n[ \t]*\n/)].filter((i) => i !== -1);
  const end = ends.length === 0 ? src.length : at + Math.min(...ends);
  return { start, text: src.slice(start, end) };
}

/** Every place this source asks for a call's note: a statement that names `vet_calls`
 *  and either names `note` (`notes`, another table's column, is not `note`) or sweeps a
 *  whole row into JSON (`to_jsonb`, `row_to_json`, `json_agg`), which carries the note
 *  without ever spelling it. */
export function findCallNoteSelects(rawSource: string): Hit[] {
  const src = blankComments(rawSource);
  const hits: Hit[] = [];
  const seen = new Set<number>();
  for (const at of offsetsOf(src, 'vet_calls')) {
    const { start, text } = statementAround(src, at);
    if (seen.has(start)) continue;
    if (/\bnote\b/.test(text) || /\b(to_jsonb?|row_to_json|jsonb?_agg)\s*\(/i.test(text)) {
      seen.add(start);
      const from = start + (text.length - text.trimStart().length);
      hits.push({ line: lineOf(src, from), excerpt: src.slice(from, from + 120).replace(/\s+/g, ' ').trim() });
    }
  }
  return hits;
}

/**
 * Every server read of the three tables that does not name its columns: a `.from()` of
 * one of them (a generic `.from<Row>(…)` included) whose chain has no string-literal
 * `.select(`, or whose select holds a `*`, and any embed of one of them whose column
 * list holds a `*` (`vet_calls(*)`, `vet_calls(id, *)`, `vet_calls!a!inner(*)`).
 *
 * The chain runs to the next `.from(`. A write with no select is not a read and passes;
 * `.insert(...).select('*')` is a read of the row and reds.
 */
export function findUnlistedReads(rawSource: string): Hit[] {
  const src = blankComments(rawSource);
  const hits: Hit[] = [];
  const fromRe = new RegExp(`\\.from(?:<[^>()]*>)?\\(\\s*['"\`](${TABLE_ALT})['"\`]\\s*\\)`, 'g');
  for (const m of src.matchAll(fromRe)) {
    const at = m.index ?? 0;
    const rest = src.slice(at + m[0].length);
    const next = rest.search(/\.from\b/);
    const chain = next === -1 ? rest : rest.slice(0, next);
    const isWrite = /^\s*\.(insert|upsert|update|delete)\(/.test(chain);
    const sel = /\.select\(\s*(['"`])([^'"`]*)\1/.exec(chain);
    const bareSelect = /\.select\(\s*\)/.test(chain);
    if ((sel && sel[2].includes('*')) || bareSelect || (!sel && !isWrite)) {
      hits.push({ line: lineOf(src, at), excerpt: src.slice(at, at + 120).replace(/\s+/g, ' ').trim() });
    }
  }
  const embedRe = new RegExp(`\\b(${TABLE_ALT})\\b(?:![\\w]+)*\\s*\\([^()]*\\*`, 'g');
  for (const m of src.matchAll(embedRe)) {
    const at = m.index ?? 0;
    hits.push({ line: lineOf(src, at), excerpt: src.slice(at, at + 120).replace(/\s+/g, ' ').trim() });
  }
  return hits;
}

function serverSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') continue;
        walk(full);
      } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
        out.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(path.join(root, 'supabase', 'functions'));
  return out.sort();
}

function scan(root: string, detector: (src: string) => Hit[], allowed: Readonly<Record<string, string>>): string[] {
  const findings: string[] = [];
  for (const rel of serverSources(root)) {
    if (rel in allowed) continue;
    for (const h of detector(fs.readFileSync(path.join(root, rel), 'utf8'))) {
      findings.push(`${rel}:${h.line} — ${h.excerpt}`);
    }
  }
  return findings;
}

describe('AC 13 — the call note reaches no Edge Function', () => {
  it('the scan has server sources to read (non-vacuity)', () => {
    expect(serverSources(ROOT).length).toBeGreaterThan(10);
  });

  it('no Edge Function selects vet_calls.note (the allow-set is empty)', () => {
    // If this fails: the note is the owner's own words and no model reads it (spec §6.6);
    // the report does not print it (§3.4). Select the columns you need and leave `note` out.
    expect(scan(ROOT, findCallNoteSelects, NOTE_ALLOWED)).toEqual([]);
  });

  it('the allow-set is empty — an entry here is a PM ruling, not a registration', () => {
    expect(Object.keys(NOTE_ALLOWED)).toEqual([]);
  });

  it('every server read of the three tables names its columns (no `*`, no bare select)', () => {
    expect(scan(ROOT, findUnlistedReads, {})).toEqual([]);
  });
});

describe('the detectors, proven (C-18; fixtures outside the repo, CUL-712)', () => {
  let root = '';
  beforeEach(() => {
    root = createFixtureRoot('care-record', ['supabase/functions/ask']);
  });
  afterEach(() => {
    removeFixtureRoot(root);
    root = '';
  });

  it('FLAGS a PostgREST read, an embed, and raw SQL naming the column first', () => {
    writeFixture(root, 'supabase/functions/ask/a.ts', `await sb.from('vet_calls').select('id, note').eq('pet_id', p)`);
    writeFixture(root, 'supabase/functions/ask/b.ts', `await sb.from('events').select('id, vet_calls(note)')`);
    writeFixture(root, 'supabase/functions/ask/c.ts', `const q = "SELECT c.note FROM vet_calls c WHERE c.pet_id = $1";`);
    expect(scan(root, findCallNoteSelects, {}).map((f) => f.split(':')[0])).toEqual([
      'supabase/functions/ask/a.ts',
      'supabase/functions/ask/b.ts',
      'supabase/functions/ask/c.ts',
    ]);
  });

  it('FLAGS a note behind a long column list, and a row swept into JSON', () => {
    // The first draft's 240-character window missed the first (code-reviewer, measured).
    const cols = Array.from({ length: 12 }, (_, i) => `column_number_${i}_padding`).join(', ');
    writeFixture(root, 'supabase/functions/ask/a.ts', `await sb.from('vet_calls').select('id, ${cols}, note')`);
    writeFixture(root, 'supabase/functions/ask/b.ts', `const q = 'SELECT to_jsonb(c) FROM vet_calls c WHERE c.pet_id = $1';`);
    expect(scan(root, findCallNoteSelects, {}).map((f) => f.split(':')[0])).toEqual([
      'supabase/functions/ask/a.ts',
      'supabase/functions/ask/b.ts',
    ]);
  });

  it('IGNORES another table\'s `notes`, a comment, and a note-free read', () => {
    writeFixture(root, 'supabase/functions/ask/a.ts', `await sb.from('vet_calls').select('id, called_on, event_id'); const x = e.notes;`);
    writeFixture(root, 'supabase/functions/ask/b.ts', `// vet_calls.note is owner-only\nconst y = 1;`);
    expect(scan(root, findCallNoteSelects, {})).toEqual([]);
  });

  it('FLAGS a star, a bare select, a select-less read and a star embed of each table', () => {
    writeFixture(root, 'supabase/functions/ask/a.ts', `await sb.from('care_acknowledgements').select('*')`);
    writeFixture(root, 'supabase/functions/ask/b.ts', `await sb.from('vet_call_follow_ups').select()`);
    writeFixture(root, 'supabase/functions/ask/c.ts', `await sb.from('vet_calls').eq('pet_id', p)`);
    writeFixture(root, 'supabase/functions/ask/d.ts', `await sb.from('events').select('id, vet_calls!vet_calls_event_id_fkey(*)')`);
    writeFixture(root, 'supabase/functions/ask/e.ts', `await sb.from('vet_calls').insert(row).select('*')`);
    writeFixture(root, 'supabase/functions/ask/f.ts', `await sb.from<Row>('vet_calls').select('*')`);
    writeFixture(root, 'supabase/functions/ask/g.ts', `await sb.from('events').select('id, vet_calls(id, *)')`);
    expect(scan(root, findUnlistedReads, {}).map((f) => f.split(':')[0])).toEqual([
      'supabase/functions/ask/a.ts',
      'supabase/functions/ask/b.ts',
      'supabase/functions/ask/c.ts',
      'supabase/functions/ask/d.ts',
      'supabase/functions/ask/e.ts',
      'supabase/functions/ask/f.ts',
      'supabase/functions/ask/g.ts',
    ]);
  });

  it('PASSES an explicit list and a plain write', () => {
    writeFixture(
      root,
      'supabase/functions/ask/a.ts',
      `await sb.from('care_acknowledgements').select('symptom_type, source, anchor_on').eq('pet_id', p);\n` +
        `await sb.from('vet_call_follow_ups').insert(row);`,
    );
    expect(scan(root, findUnlistedReads, {})).toEqual([]);
  });
});

// ── The migration, replayed ─────────────────────────────────────────────────

/** Every migration from 082 on, comments stripped, concatenated in filename order. A
 *  later migration is read too: that is where an undoing would land. Quoted identifiers
 *  are unquoted for our three tables and the schema, so `"public"."vet_calls"` reads
 *  the same as `public.vet_calls`. */
function migrationsFrom082(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f >= MIGRATION)
    .sort()
    .map((f) => stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n')
    .replace(new RegExp(`"(public|${TABLE_ALT})"`, 'g'), '$1');
}

function tableDdl(sql: string, table: string): string {
  const start = sql.search(new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`));
  if (start === -1) throw new Error(`CREATE TABLE ${table} not found`);
  return sql.slice(start, sql.indexOf('\n);', start) + 3);
}

/** Every top-level statement matching `head`, to its `;`. Function bodies are skipped
 *  first, since a `;` inside `$$ … $$` is not a statement end. */
function statements(sql: string, head: RegExp): string[] {
  const flat = sql.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, '$$BODY$$');
  return flat.split(';').map((x) => x.trim()).filter((x) => head.test(x));
}

const OWNER_PREDICATE = 'pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid()))';

describe('AC 12 — append-only by RLS alone (migration 082 and everything after it)', () => {
  const sql = migrationsFrom082();

  it('082 exists and defines all three tables (non-vacuity)', () => {
    for (const t of TABLES) expect(() => tableDdl(sql, t)).not.toThrow();
  });

  it.each(TABLES)('%s: RLS on, and never switched off or un-forced later', (t) => {
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    expect(sql).not.toMatch(new RegExp(`ALTER TABLE (?:ONLY\\s+)?public\\.${t}\\s+(DISABLE|NO FORCE) ROW LEVEL SECURITY`, 'i'));
  });

  it.each(TABLES)('%s: exactly one SELECT and one INSERT policy, each the owner predicate, never altered or dropped', (t) => {
    const onT = new RegExp(`\\bON\\s+public\\.${t}\\b`);
    const creates = statements(sql, /^CREATE POLICY\b/i).filter((x) => onT.test(x));
    const verbs = creates.map((x) => (/\bFOR\s+(\w+)/i.exec(x)?.[1] ?? 'ALL').toUpperCase()).sort();
    expect(verbs).toEqual(['INSERT', 'SELECT']);
    for (const x of creates) {
      // A widened predicate (USING (true), another account) reds here.
      expect(x.replace(/\s+/g, ' ')).toContain(OWNER_PREDICATE);
      expect(x).not.toMatch(/\bAS\s+RESTRICTIVE\b/i);
    }
    expect(statements(sql, /^(ALTER|DROP) POLICY\b/i).filter((x) => onT.test(x))).toEqual([]);
  });

  it.each(TABLES)('%s: no role is ever granted UPDATE, DELETE, TRUNCATE, ALL or a table-level INSERT', (t) => {
    const onT = new RegExp(`\\bON\\s+(?:TABLE\\s+)?(?:[\\w.]+\\s*,\\s*)*public\\.${t}\\b`);
    const grants = statements(sql, /^GRANT\b/i).filter((x) => onT.test(x));
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      const verbs = g.slice(0, g.search(/\bON\b/)).replace(/\([^)]*\)/g, '');
      expect({ g, bad: /\b(UPDATE|DELETE|TRUNCATE|ALL)\b/i.test(verbs) }).toEqual({ g, bad: false });
      // INSERT only with a column list — a bare INSERT would re-cover created_at.
      if (/\bINSERT\b/i.test(g)) expect(g).toMatch(/INSERT\s*\(/i);
    }
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${t}\\s+FROM anon, authenticated`));
    expect(sql).toMatch(new RegExp(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\\.${t}\\s+FROM service_role`));
  });

  it('no later schema-wide grant reaches them with a forbidden verb', () => {
    for (const g of statements(sql, /^GRANT\b[\s\S]*\bON ALL TABLES IN SCHEMA public\b/i)) {
      expect({ g, bad: /\b(UPDATE|DELETE|TRUNCATE|ALL|INSERT)\b/i.test(g.slice(0, g.search(/\bON\b/))) })
        .toEqual({ g, bad: false });
    }
  });

  it.each(TABLES)('%s: no INSERT column grant, in any migration, includes created_at (the server\'s clock orders "latest wins")', (t) => {
    const ins = statements(sql, /^GRANT\b/i)
      .filter((x) => new RegExp(`\\bpublic\\.${t}\\b`).test(x) && /INSERT\s*\(/i.test(x));
    expect(ins.length).toBeGreaterThan(0);
    for (const g of ins) expect(g).not.toMatch(/created_at/);
  });

  it.each(TABLES)('%s: cascades from pets, and every trigger ever made on it is BEFORE INSERT (a DELETE trigger would abort account deletion)', (t) => {
    expect(tableDdl(sql, t)).toMatch(/pet_id\s+UUID\s+NOT NULL REFERENCES public\.pets\(id\) ON DELETE CASCADE/);
    const onT = new RegExp(`\\bON\\s+public\\.${t}\\b`);
    const triggers = statements(sql, /^CREATE\s+(OR\s+REPLACE\s+)?(CONSTRAINT\s+)?TRIGGER\b/i)
      .filter((x) => onT.test(x))
      .map((x) => /TRIGGER\s+\w+\s+([\s\S]*?)\s+ON\s+public\./i.exec(x)?.[1].replace(/\s+/g, ' ').toUpperCase());
    expect(triggers).toEqual(['BEFORE INSERT']);
    expect(statements(sql, /^DROP TRIGGER\b/i).filter((x) => onT.test(x))).toEqual([]);
    expect(sql).not.toMatch(new RegExp(`ALTER TABLE (?:ONLY\\s+)?public\\.${t}\\s+DISABLE TRIGGER`, 'i'));
  });

  it('every FK in the three tables cascades or nulls, so no parent delete is blocked', () => {
    for (const t of TABLES) {
      for (const ref of tableDdl(sql, t).matchAll(/REFERENCES\s+public\.\w+\(id\)([^,\n]*)/g)) {
        expect({ t, rule: ref[1].trim() }).toEqual({ t, rule: expect.stringMatching(/^ON DELETE (CASCADE|SET NULL)$/) });
      }
    }
  });

  it('the LATEST definition of the same-pet guard keeps its ownership arm (the membership oracle stays closed)', () => {
    // Without `p.user_id = me`, a write wholly inside another account passes the trigger
    // and is refused by RLS (42501), while a mismatched pair is refused here (23514): the
    // code tells a caller whether two UUIDs belong together. Proven on the PG16 replay by
    // deleting this clause; recorded in the PR. The LAST definition is the live one, so a
    // later CREATE OR REPLACE that drops the arm reds.
    const defs = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.enforce_care_record_same_pet\(\)[\s\S]*?\$\$;/g)];
    expect(defs.length).toBeGreaterThan(0);
    const live = defs[defs.length - 1][0];
    expect(live).toMatch(/AND \(me IS NULL OR p\.user_id = me\)/);
    expect(live).toMatch(/me\s+uuid := auth\.uid\(\)/);
  });

  it('no view, and no other database function, reaches around RLS to the three tables', () => {
    // The note rule's server scan reads TypeScript. A VIEW (which runs as its owner unless
    // security_invoker) or a DEFINER function in a migration would be a read it cannot see.
    const touches = new RegExp(`\\bpublic\\.(${TABLE_ALT})\\b|\\b(${TABLE_ALT})\\b`);
    expect(statements(sql, /^CREATE\s+(OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\b/i).filter((x) => touches.test(x))).toEqual([]);
    const fns = [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+([\w.]+)\s*\([\s\S]*?\$([A-Za-z_]\w*)?\$([\s\S]*?)\$\2\$/g)]
      .filter((m) => m[1] !== 'public.enforce_care_record_same_pet' && touches.test(m[3]))
      .map((m) => m[1]);
    expect(fns).toEqual([]);
  });
});

describe('the sign set (§3.1)', () => {
  it('care_acknowledgements.symptom_type is CHECKed against chronicity ∪ worsening, exactly', () => {
    const ddl = tableDdl(migrationsFrom082(), 'care_acknowledgements');
    const m = /symptom_type\s+TEXT\s+NOT NULL CHECK \(symptom_type IN \(([^)]*)\)\)/.exec(ddl);
    expect(m).not.toBeNull();
    const inSql = [...(m as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    const lanes = [...new Set([...LANE_SYMPTOM_TYPES.chronicity, ...LANE_SYMPTOM_TYPES.symptomDelta])].sort();
    // If this fails: a lane that can make a concern gained (or lost) a sign. Widen (or
    // narrow) the CHECK in a migration, or the owner's answer about that sign is refused
    // at rest.
    expect(inSql).toEqual(lanes);
  });
});
