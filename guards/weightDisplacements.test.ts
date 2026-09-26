// The displaced profile weight is KEPT, and nothing reads it yet (CUL-694; Engines v3
// critique CUL-1268, BRK-11 / TD-1; migration 072).
//
// WHAT THE RULE IS. Migration 072 keeps every non-NULL `pets.weight_kg` value a write
// displaces, in `pet_weight_displacements`, written only by an AFTER trigger. Two
// halves of that are claims the migration's header makes and the build must check,
// because a comment asserting a wiring is a cheque the code does not cash (C-38):
//
//   1. NOTHING READS IT. A row there has source 'profile' and may duplicate a weigh-in
//      copy or an Undo leftover. Read naively it would put a typed guess on a weight
//      line, which is exactly what BRK-11 forbids ("never a weight_checks row, which
//      the report would plot"). Its first reader is EN-8 (CUL-1135), which must tell a
//      real profile weight from a copied reading before it anchors anything on one.
//   2. THE TRIGGER CAN NEVER REFUSE THE WRITE IT WATCHES. The function returns NULL.
//      In an AFTER trigger that is ignored; flipped to BEFORE, the same RETURN NULL
//      silently CANCELS every weigh-in snapshot write and every Edit profile save, for
//      every account, with no error anywhere (069's mutation class, measured on this
//      file: see "the proof" below). And a preservation failure must be swallowed and
//      logged, never raised, or a bad row would turn into "Could not save".
//
// ── THE REGISTRY IS AN EXEMPTION, AND ITS EMPTY SET IS THE ASSERTION (C-32) ─────
// `ALLOWED` is empty on purpose. EN-8 is the first reader, and the PR that lands it
// adds its entry with a reason that says how it tells an owner-typed profile weight
// from a copy of a reading. Registering a file here to record that somebody thought
// about it is what this shape exists to stop.
//
// ── WHAT IT DOES NOT CLAIM, stated because an undocumented blind spot reads as
// coverage (C-38) ─────────────────────────────────────────────────────────────
//   · It is a SOURCE SCAN for the table's name. A name assembled at runtime
//     ('pet_weight_' + 'displacements') or passed through a variable from a file
//     outside the scan is invisible to it. Review's job, not a scan's.
//   · It reads the migration FILES, so it cannot see a trigger changed by hand in the
//     dashboard (the B-505 class); `get_advisors` and the apply-time probe cover that.
//   · "Nothing reads it" is a claim about PRODUCT CODE. The owner's own rows are
//     readable through PostgREST and pg_graphql by design (data rights, and EN-8's
//     read); the claim is that no surface of ours renders, counts or ships them.
//   · It scans .ts / .tsx / .js / .sql. Native sources (the widget's Swift, a .mjs /
//     .cjs script) are outside it; none exists today that talks to Supabase.
//   · It cannot execute plpgsql. The behavioural proof (every writer shape, the chain,
//     the refusals, the failure injection, the cascade) was run against a PG16 replay
//     and against production in rolled-back transactions; it is recorded in the PR.
//
// THE PROOF THAT THE STRUCTURAL HALF IS NOT DECORATIVE. Against the PG16 replay, the
// one-word mutation AFTER → BEFORE left the owner's UPDATE reporting success and the
// weight unchanged. Nothing else in the tree would have gone red.

import * as fs from 'fs';
import * as path from 'path';

import { blankComments } from './blankComments';
import { createFixtureRoot, removeFixtureRoot, writeFixture } from './fixtureRoot';
import { stripSqlComments } from './sqlComments';

const ROOT = path.resolve(__dirname, '..');
const TABLE = 'pet_weight_displacements';
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const MIGRATION = '072_pet_weight_displacements.sql';

/** Every tree that ships product behaviour. `guards/` is deliberately absent (C-18). */
const SCAN_DIRS = [
  'app',
  'components',
  'lib',
  'store',
  'hooks',
  'constants',
  'widgets',
  'supabase/functions',
  'scripts',
];

const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist']);

/** Files excused from the prohibition, each with its reason. Empty until EN-8. */
const ALLOWED: Readonly<Record<string, string>> = {};

// ── The reader scan ──────────────────────────────────────────────────────────

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(ts|tsx|js|sql)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        out.push(abs);
      }
    }
  };
  for (const d of SCAN_DIRS) walk(path.join(root, d));
  return out;
}

const NAME_RE = new RegExp(`\\b${TABLE}\\b`);

/** Repo-relative paths of every scanned file that names the table outside a comment. */
function readersUnder(root: string): string[] {
  return sourceFiles(root)
    .filter((abs) => {
      const src = fs.readFileSync(abs, 'utf8');
      // SQL files keep `--` comments, which blankComments does not know, so strip them.
      const code = abs.endsWith('.sql') ? stripSqlComments(src) : blankComments(src);
      return NAME_RE.test(code);
    })
    .map((abs) => path.relative(root, abs).split(path.sep).join('/'))
    .sort();
}

describe('nothing reads pet_weight_displacements yet (EN-8, CUL-1135, is the first reader)', () => {
  it('scans real trees, so an empty result means something (non-vacuity)', () => {
    // Derived from the REPOSITORY, never from SCAN_DIRS itself (C-38's guard-on-guard):
    // a directory dropped from the list must not quietly shrink the scan.
    for (const d of ['app', 'components', 'lib', 'store', 'supabase/functions']) {
      expect(fs.existsSync(path.join(ROOT, d))).toBe(true);
      expect(SCAN_DIRS).toContain(d);
    }
    expect(sourceFiles(ROOT).length).toBeGreaterThan(300);
  });

  it('no product module names the table outside the (empty) registry', () => {
    const offenders = readersUnder(ROOT).filter((rel) => !(rel in ALLOWED));
    expect(offenders).toEqual([]);
  });

  it('the registry has no stale entries', () => {
    const hits = new Set(readersUnder(ROOT));
    expect(Object.keys(ALLOWED).filter((rel) => !hits.has(rel))).toEqual([]);
  });

  describe('the detector, driven over fixtures outside the repo (C-18)', () => {
    let root = '';
    beforeEach(() => {
      root = createFixtureRoot('weight-displacements', ['lib', 'supabase/functions/ask']);
    });
    afterEach(() => {
      removeFixtureRoot(root);
    });

    it('flags a PostgREST read, a local SQL read and an Edge Function read', () => {
      writeFixture(root, 'lib/a.ts', `await supabase.from('${TABLE}').select('weight_kg');`);
      writeFixture(root, 'lib/b.ts', 'const q = `SELECT weight_kg FROM ' + TABLE + ' WHERE pet_id = ?`;');
      writeFixture(root, 'supabase/functions/ask/tools.ts', `client.from("${TABLE}")`);
      expect(readersUnder(root)).toEqual([
        'lib/a.ts',
        'lib/b.ts',
        'supabase/functions/ask/tools.ts',
      ]);
    });

    it('ignores a comment that names it, and a test file', () => {
      writeFixture(root, 'lib/c.ts', `// the displaced value lives in ${TABLE} (072)\nexport const x = 1;`);
      writeFixture(root, 'lib/c.test.ts', `supabase.from('${TABLE}')`);
      expect(readersUnder(root)).toEqual([]);
    });
  });
});

// ── The migration's structure ────────────────────────────────────────────────

// String- and dollar-quote-aware, shared with lib/functionHardening.test.ts: a naive
// `--` strip truncates a statement at a `--` inside a string literal (code-reviewer).
const stripSql = stripSqlComments;

const migrationSql = stripSql(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8'));

/** The trigger function's body, between its dollar quotes. */
function functionBody(sql: string): string {
  const m = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.preserve_displaced_pet_weight\(\)[\s\S]*?AS\s+\$\$([\s\S]*?)\$\$/i.exec(sql);
  if (!m) throw new Error('072: preserve_displaced_pet_weight body not found');
  return m[1];
}

describe('migration 072: the trigger can never refuse the write it watches', () => {
  it('is an AFTER UPDATE OF weight_kg trigger on pets (BEFORE + RETURN NULL cancels every weight write)', () => {
    expect(migrationSql).toMatch(
      /CREATE\s+TRIGGER\s+trg_pets_preserve_displaced_weight\s+AFTER\s+UPDATE\s+OF\s+weight_kg\s+ON\s+public\.pets\s+FOR\s+EACH\s+ROW/i,
    );
    expect(migrationSql).not.toMatch(/CREATE\s+TRIGGER\s+trg_pets_preserve_displaced_weight\s+BEFORE/i);
  });

  it('fires only when there is something to keep (old value set, new value different)', () => {
    expect(migrationSql).toMatch(
      /WHEN\s*\(\s*OLD\.weight_kg\s+IS\s+NOT\s+NULL\s+AND\s+OLD\.weight_kg\s+IS\s+DISTINCT\s+FROM\s+NEW\.weight_kg\s*\)/i,
    );
  });

  it('wraps the insert so a preservation failure is logged, never raised', () => {
    const body = functionBody(migrationSql);
    const insertAt = body.search(/INSERT\s+INTO\s+public\.pet_weight_displacements/i);
    const handlerAt = body.search(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN/i);
    expect(insertAt).toBeGreaterThan(-1);
    expect(handlerAt).toBeGreaterThan(insertAt);
    expect(body).not.toMatch(/RAISE\s+(EXCEPTION|ERROR)/i);
    // C-31: the log line names the pet id and the SQLSTATE, never a weight.
    expect(body).toMatch(/RAISE\s+LOG\s+'[^']*'\s*,\s*OLD\.id\s*,\s*SQLSTATE\s*;/i);
  });

  it('no later migration re-creates the trigger or the function without these properties', () => {
    const later = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && f > MIGRATION)
      .filter((f) =>
        /trg_pets_preserve_displaced_weight|preserve_displaced_pet_weight/.test(
          stripSql(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')),
        ),
      );
    // A later migration touching either is not forbidden; it must extend this file's
    // assertions to cover the replacement, which is why it reds here first.
    expect(later).toEqual([]);
  });
});

describe('migration 072: clients can read their rows and write none', () => {
  const allMigrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => stripSql(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n');

  it('every policy on the table is FOR SELECT (no INSERT, UPDATE, DELETE or ALL)', () => {
    const policies = [
      ...allMigrations.matchAll(
        /CREATE\s+POLICY\s+"?[\w]+"?\s+ON\s+(?:public\.)?pet_weight_displacements\s+FOR\s+(\w+)/gi,
      ),
    ].map((m) => m[1].toUpperCase());
    expect(policies).toEqual(['SELECT']);
  });

  it('revokes the writes RLS does not govern (TRUNCATE) along with the rest', () => {
    expect(migrationSql).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.pet_weight_displacements\s+FROM\s+anon/i);
    expect(migrationSql).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE,\s*TRUNCATE[^;]*ON\s+TABLE\s+public\.pet_weight_displacements\s+FROM\s+authenticated/i,
    );
  });

  it('revokes the identity sequence (a client setval would silently drop other accounts\' rows)', () => {
    expect(migrationSql).toMatch(
      /REVOKE\s+ALL\s+ON\s+SEQUENCE\s+public\.pet_weight_displacements_id_seq\s+FROM\s+anon,\s*authenticated/i,
    );
  });

  it('pins search_path with pg_temp LAST (under \'\' the temp schema shadows type names in a DEFINER body)', () => {
    // lib/functionHardening.test.ts only asks that SOME search_path is pinned; this
    // asserts WHICH, because the house '' is the vulnerable form for a DEFINER
    // function that names a type (rls-privacy-reviewer, CUL-694).
    const fn = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.preserve_displaced_pet_weight\(\)([\s\S]*?)AS\s+\$\$/i.exec(migrationSql);
    expect(fn).not.toBeNull();
    expect(fn![1]).toMatch(/SET\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp\s*$/im);
  });

  it('is deleted with the pet (account deletion is the users → pets FK cascade)', () => {
    expect(migrationSql).toMatch(/pet_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.pets\(id\)\s+ON\s+DELETE\s+CASCADE/i);
  });
});
