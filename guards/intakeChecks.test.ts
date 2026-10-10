// intake_checks, the stored answer to "Has she eaten?": the R-5 privacy line and the
// soft-delete-only posture (Engines v3 PR-30m; CUL-1723; migration 097; MFU-6).
//
// WHAT THE RULES ARE.
//   1. NO FREE TEXT AT REST. Every text column of the table is bounded by a CHECK to a
//      fixed set, so nothing an owner types can be stored here, and nothing here can
//      reach a model as prose. A later migration that adds an unbounded text column
//      (a note) reds here: that is a Trust & Safety decision with its own privacy line,
//      never a quiet ALTER.
//   2. NO READER YET, AND NEVER THE REPORT OR ASK. No Edge Function names the table in
//      this PR. READERS is EMPTY and the empty set is the assertion (C-32): PR-30q adds
//      analyze-vomit, which must name its columns (no `*`, no bare select).
//      generate-report and ask may never name it: whether the vet report or Ask shows an
//      intake answer is not ruled, so an entry for either is a PM ruling, not a
//      registration.
//   3. SOFT DELETE ONLY. Over every migration from 097 on: no DELETE policy, no GRANT of
//      DELETE or TRUNCATE, and no table-level GRANT INSERT / UPDATE (which would
//      re-cover created_at, the server's column).
//
// ── WHAT IT DOES NOT CLAIM (C-38: a blind spot left unstated reads as coverage) ─────
//   · Syntactic. A table name assembled at runtime, or a `.from(variable)`, is invisible
//     to it; guards/visitReaders.test.ts registers every dynamic `.from()`.
//   · It scans `supabase/functions/` only. A shared `lib/` module an Edge Function
//     imports (the C-26 closure) is outside it; review covers that closure.
//   · It reads migration files, so a policy or grant changed by hand in the dashboard is
//     the B-505 class: the VERIFY block at the foot of 097 and `get_advisors` cover it.
//   · It cannot execute plpgsql. The guard trigger's behaviour (every refusal, the
//     ownership arm's oracle and its mutant, the frozen columns, the cascade) was run on
//     a PG16 replay and is recorded in the PR.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';
import { stripSqlComments } from './sqlComments';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const MIGRATION = '097_intake_checks.sql';
const TABLE = 'intake_checks';

/** Edge Function files that may read the table, each with its reason. EMPTY until
 *  PR-30q's analyze-vomit reader lands (C-32). */
const READERS: Readonly<Record<string, string>> = {};

/** Directories that may never name the table, whatever READERS says. */
const NEVER = ['supabase/functions/generate-report/', 'supabase/functions/ask/'];

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length;

/** Every mention of the table in a source, comments blanked. */
export function findMentions(rawSource: string): number[] {
  const src = blankComments(rawSource);
  return [...src.matchAll(new RegExp(`\\b${TABLE}\\b`, 'g'))].map((m) => lineOf(src, m.index ?? 0));
}

/** Every read of the table that does not name its columns: a `.from('intake_checks')`
 *  whose chain (to the next `.from(`) has no string-literal select, or a select holding
 *  a `*`, or an embed `intake_checks(*)`. A write with no select is not a read. */
export function findUnlistedReads(rawSource: string): number[] {
  const src = blankComments(rawSource);
  const hits: number[] = [];
  for (const m of src.matchAll(new RegExp(`\\.from(?:<[^>()]*>)?\\(\\s*['"\`]${TABLE}['"\`]\\s*\\)`, 'g'))) {
    const at = m.index ?? 0;
    const rest = src.slice(at + m[0].length);
    const next = rest.search(/\.from\b/);
    const chain = next === -1 ? rest : rest.slice(0, next);
    const isWrite = /^\s*\.(insert|upsert|update|delete)\(/.test(chain);
    const sel = /\.select\(\s*(['"`])([^'"`]*)\1/.exec(chain);
    const bare = /\.select\(\s*\)/.test(chain);
    if ((sel && sel[2].includes('*')) || bare || (!sel && !isWrite)) hits.push(lineOf(src, at));
  }
  for (const m of src.matchAll(new RegExp(`\\b${TABLE}\\b(?:!\\w+)*\\s*\\([^()]*\\*`, 'g'))) {
    hits.push(lineOf(src, m.index ?? 0));
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
        if (ent.name !== 'node_modules') walk(full);
      } else if (/\.tsx?$/.test(ent.name) && !ent.name.includes('.test.')) {
        out.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(path.join(root, 'supabase', 'functions'));
  return out.sort();
}

/** The reader rule: a mention outside READERS reds, a mention under NEVER reds even if
 *  registered, and a registered reader must name its columns. */
export function readerFindings(root: string, readers: Readonly<Record<string, string>>): string[] {
  const findings: string[] = [];
  for (const rel of serverSources(root)) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    const mentions = findMentions(src);
    if (mentions.length === 0) continue;
    if (NEVER.some((d) => rel.startsWith(d))) {
      findings.push(`${rel}:${mentions[0]} — names ${TABLE}; the report and Ask may not (unruled)`);
    } else if (!(rel in readers)) {
      findings.push(`${rel}:${mentions[0]} — names ${TABLE} and is not a registered reader`);
    } else {
      for (const line of findUnlistedReads(src)) findings.push(`${rel}:${line} — reads ${TABLE} without naming its columns`);
    }
  }
  return findings;
}

/** The migrations from 097 on, in filename order, comments stripped. */
function migrationsFrom097(dir: string): string {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f >= MIGRATION)
    .sort()
    .map((f) => stripSqlComments(fs.readFileSync(path.join(dir, f), 'utf8')))
    .join('\n');
}

/** The text columns of `CREATE TABLE public.intake_checks (...)` that carry no inline
 *  `CHECK (<col> IN (...))`. Also returns the column count, for non-vacuity. */
export function unboundedTextColumns(sql: string): { columns: number; unbounded: string[] } {
  const m = new RegExp(`CREATE\\s+TABLE\\s+(?:public\\.)?${TABLE}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql);
  if (!m) return { columns: 0, unbounded: [] };
  const lines = m[1].split('\n').map((l) => l.trim()).filter((l) => /^[a-z_]+\s+[A-Z]/.test(l) && !/^CONSTRAINT\b/i.test(l));
  const unbounded = lines
    .filter((l) => /^\w+\s+(TEXT|VARCHAR|CHARACTER VARYING|CITEXT|JSONB?)\b/i.test(l))
    .filter((l) => {
      const col = l.split(/\s+/)[0];
      return !new RegExp(`CHECK\\s*\\(\\s*${col}\\s+IN\\s*\\(`, 'i').test(l);
    })
    .map((l) => l.split(/\s+/)[0]);
  // A text column added later by ALTER TABLE is unbounded unless its own line says CHECK … IN.
  for (const a of sql.matchAll(new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${TABLE}\\s+ADD\\s+(?:COLUMN\\s+)?(\\w+)\\s+(TEXT|VARCHAR|CITEXT|JSONB?)\\b([^;]*)`, 'gi'))) {
    if (!new RegExp(`CHECK\\s*\\(\\s*${a[1]}\\s+IN\\s*\\(`, 'i').test(a[3])) unbounded.push(a[1]);
  }
  return { columns: lines.length, unbounded };
}

/** Soft-delete-only breaches over the replayed SQL. */
export function deleteBreaches(sql: string): string[] {
  const out: string[] = [];
  const t = `(?:public\\.)?${TABLE}\\b`;
  if (new RegExp(`CREATE\\s+POLICY[^;]*ON\\s+${t}[^;]*FOR\\s+(DELETE|ALL)\\b`, 'i').test(sql)) out.push('a DELETE (or ALL) policy');
  if (new RegExp(`GRANT[^;]*\\b(DELETE|TRUNCATE|ALL)\\b[^;]*ON\\s+(?:TABLE\\s+)?${t}`, 'i').test(sql)) out.push('a GRANT of DELETE / TRUNCATE / ALL');
  if (new RegExp(`GRANT\\s+(?:SELECT\\s*,\\s*)?(INSERT|UPDATE)\\b(?!\\s*\\()[^;]*ON\\s+(?:TABLE\\s+)?${t}`, 'i').test(sql)) out.push('a table-level GRANT INSERT / UPDATE');
  return out;
}

describe('R-5 — intake_checks holds no free text', () => {
  const sql = migrationsFrom097(MIGRATIONS_DIR);

  it('the table is found and has columns (non-vacuity)', () => {
    expect(unboundedTextColumns(sql).columns).toBeGreaterThanOrEqual(8);
  });

  it('every text column is CHECK-bounded to a fixed set', () => {
    // If this fails: a note or free answer on this table is a new data class. It needs a
    // privacy line (who reads it, whether a model may) and a Trust & Safety ruling first.
    expect(unboundedTextColumns(sql).unbounded).toEqual([]);
  });

  it('catches an unbounded column, inline or added later (proof)', () => {
    const base = 'CREATE TABLE public.intake_checks (\n  id UUID PRIMARY KEY,\n  form TEXT NOT NULL CHECK (form IN (\'a\')),\n  note TEXT\n);';
    expect(unboundedTextColumns(base).unbounded).toEqual(['note']);
    const fixed = base.replace('  note TEXT\n', '');
    expect(unboundedTextColumns(fixed).unbounded).toEqual([]);
    expect(unboundedTextColumns(`${fixed}\nALTER TABLE public.intake_checks ADD COLUMN note TEXT;`).unbounded).toEqual(['note']);
  });
});

describe('Soft delete only — no role may DELETE or TRUNCATE intake_checks', () => {
  it('the replayed migrations grant no delete, and no table-level write', () => {
    expect(deleteBreaches(migrationsFrom097(MIGRATIONS_DIR))).toEqual([]);
  });

  it('catches each breach (proof)', () => {
    expect(deleteBreaches('CREATE POLICY "x" ON public.intake_checks FOR DELETE TO authenticated USING (true);')).toEqual(['a DELETE (or ALL) policy']);
    expect(deleteBreaches('GRANT DELETE ON TABLE public.intake_checks TO authenticated;')).toEqual(['a GRANT of DELETE / TRUNCATE / ALL']);
    expect(deleteBreaches('GRANT INSERT ON TABLE public.intake_checks TO authenticated;')).toEqual(['a table-level GRANT INSERT / UPDATE']);
    expect(deleteBreaches('GRANT UPDATE (answer) ON TABLE public.intake_checks TO authenticated;')).toEqual([]);
  });
});

describe('R-5 — no Edge Function reads intake_checks yet; the report and Ask never', () => {
  it('the scan has server sources to read (non-vacuity)', () => {
    expect(serverSources(ROOT).length).toBeGreaterThan(10);
  });

  it('no unregistered reader, and none under generate-report/ or ask/', () => {
    expect(readerFindings(ROOT, READERS)).toEqual([]);
  });

  it('the reader set is empty until PR-30q (C-32)', () => {
    expect(Object.keys(READERS)).toEqual([]);
  });

  describe('the detector (fixtures outside the tree)', () => {
    let root = '';
    beforeEach(() => {
      root = createFixtureRoot('intake-checks', ['supabase/functions']);
    });
    afterEach(() => {
      removeFixtureRoot(root);
    });

    it('reds an unregistered reader, a registered `*` read, and the report even when registered', () => {
      writeFixture(root, 'supabase/functions/analyze-vomit/context.ts', `await sb.from('intake_checks').select('*').eq('event_id', id)`);
      writeFixture(root, 'supabase/functions/generate-report/index.ts', `await sb.from('intake_checks').select('answer')`);
      writeFixture(root, 'supabase/functions/ask/tools.ts', `const q = 'SELECT answer FROM intake_checks';`);
      expect(readerFindings(root, {}).length).toBe(3);
      const registered = {
        'supabase/functions/analyze-vomit/context.ts': 'fixture',
        'supabase/functions/generate-report/index.ts': 'fixture',
      };
      const findings = readerFindings(root, registered);
      expect(findings).toHaveLength(3);
      expect(findings.join('\n')).toMatch(/context\.ts:1 — reads intake_checks without naming its columns/);
    });

    it('passes a registered reader that names its columns, and a comment mention', () => {
      writeFixture(root, 'supabase/functions/analyze-vomit/context.ts', `await sb.from('intake_checks').select('answer, form, since, answered_at').eq('event_id', id)`);
      writeFixture(root, 'supabase/functions/ask/tools.ts', `// intake_checks is not read here\nconst x = 1;`);
      expect(readerFindings(root, { 'supabase/functions/analyze-vomit/context.ts': 'fixture' })).toEqual([]);
    });
  });
});
