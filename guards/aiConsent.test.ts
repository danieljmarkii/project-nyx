// `ai_consent` (100, CUL-552, App Review 5.1.2(i)): the pins that keep the owner's answer
// the owner's, in the owner's words, at the database's time.
//
// WHAT THE RULES ARE (each a pin over the migration FILES numbered 100 and up, replayed in
// order, because a later migration that re-grants a verb, adds a policy or re-creates the
// trigger would quietly undo what 100 set):
//   1. GRANTS. A client role (authenticated / anon / PUBLIC) holds SELECT and column-list
//      INSERT / UPDATE only. Any other verb (DELETE, TRUNCATE, TRIGGER, REFERENCES, ALL), a
//      table-level INSERT / UPDATE (which re-covers `decided_at`; 032's maintenance warning,
//      which nothing enforced until now), a column list naming `decided_at`, a schema-wide
//      `ON ALL TABLES IN SCHEMA`, or an `ALTER DEFAULT PRIVILEGES` handing a client role a
//      write verb, reds. TRUNCATE is here because it ignores RLS and fires no row trigger
//      (rls-privacy-reviewer, PG16 replay: one `TRUNCATE` erased every account's answer).
//   2. RLS AND POLICIES. RLS stays enabled, and the table's policies are EXACTLY 100's three,
//      statement for statement. A later permissive policy, an `ALTER POLICY`, a FOR DELETE or
//      FOR ALL policy, or a dropped one, each reds: the set is pinned, not scanned for bad
//      shapes, because "a permissive WITH CHECK (true)" has more spellings than a scan has.
//   3. THE TRIGGER. `stamp_ai_consent_decided_at`'s whole CREATE statement is pinned by
//      equality (a dropped key-freeze arm is the realistic regression: a PostgREST upsert
//      needs the key columns granted for UPDATE, so the trigger is the only thing keeping
//      `scope` from being relabelled; SECURITY DEFINER or a moved search_path would also
//      change it), its CREATE TRIGGER is pinned the same way (BEFORE INSERT OR UPDATE, FOR
//      EACH ROW, no WHEN, no UPDATE OF), and a later DROP / DISABLE / ALTER FUNCTION reds.
//   4. NO DEFAULT ON `granted`. A default would let an insert that forgot the answer record
//      one, and absence must never read as yes.
//
// HOW IT READS SQL. Comments are stripped (`stripSqlComments`). For rules 1, 2 and 4, string
// literals and dollar-quoted bodies are then blanked line-preservingly in ONE pass, so a
// `COMMENT ON` or `RAISE` string that quotes a GRANT is not a GRANT, and the text is split
// into statements at `;`, so no match spans two statements. Rule 3 reads the comment-stripped
// text, because the body it pins is inside the dollar quotes. A table reference matches with
// or without `public.` and with or without double quotes.
//
// WHAT IT DOES NOT CLAIM (C-38: a blind spot left unstated reads as coverage):
//   · It cannot execute plpgsql or RLS. The behavioural proof (cross-account insert and
//     upsert, the existence oracle, forged decided_at, key moves, delete, TRUNCATE, anon,
//     the service-role plant, the cascade, and the key-freeze mutant) ran on PG16 replays
//     and is recorded in the PR.
//   · SQL built at runtime (`EXECUTE 'GRANT …'` inside a DO block) is blanked with its
//     string and so is invisible. So is a grant or policy changed by hand in the dashboard
//     (the B-505 class); `get_advisors` and the `\dp` check after apply cover that.
//   · A GRANT to a role other than the three client roles is ignored, so a new role that
//     PostgREST later switches into would need its own rule.
//   · A file numbered below 100 that touches the table (which would mean the table existed
//     before its own migration) is out of scope.

import * as fs from 'fs';
import * as path from 'path';

import { stripSqlComments } from './sqlComments';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const FIRST = 100;
const FN = 'stamp_ai_consent_decided_at';
const TRIGGER = 'trg_ai_consent_decided_at';

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** `ai_consent`, schema-qualified or not, quoted or not. */
const T = String.raw`(?:"?public"?\s*\.\s*)?"?ai_consent"?(?![\w"])`;
const CLIENT_ROLE = /(?:^|[\s,"])(authenticated|anon|public)(?=$|[\s,"])/i;

const POLICIES: Readonly<Record<string, string>> = {
  ai_consent_select_own:
    'CREATE POLICY "ai_consent_select_own" ON public.ai_consent FOR SELECT TO authenticated USING (user_id = (select auth.uid()))',
  ai_consent_insert_own:
    'CREATE POLICY "ai_consent_insert_own" ON public.ai_consent FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()))',
  ai_consent_update_own:
    'CREATE POLICY "ai_consent_update_own" ON public.ai_consent FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))',
};

const FN_STATEMENT = squash(`
CREATE OR REPLACE FUNCTION public.stamp_ai_consent_decided_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.scope   IS DISTINCT FROM OLD.scope) THEN
    RAISE EXCEPTION 'ai_consent: a row''s account and scope never change'
      USING ERRCODE = '42501';
  END IF;
  NEW.decided_at := now();
  RETURN NEW;
END;
$$;
`);

const TRIGGER_STATEMENT =
  'CREATE TRIGGER trg_ai_consent_decided_at BEFORE INSERT OR UPDATE ON public.ai_consent FOR EACH ROW EXECUTE FUNCTION public.stamp_ai_consent_decided_at()';

/** The migration texts numbered 100 and up, comments stripped, in apply order. Numeric, not
 *  lexical: `1000_x` sorts below `100_a` as text ('0' < '_'). */
export function orderMigrations(names: string[], first: number): string[] {
  return names
    .filter((f) => f.endsWith('.sql') && Number.parseInt(f.split('_')[0], 10) >= first)
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b));
}

export function migrationsFrom(dir: string, first: number): string[] {
  return orderMigrations(fs.readdirSync(dir), first).map((f) =>
    stripSqlComments(fs.readFileSync(path.join(dir, f), 'utf8')),
  );
}

/** Blank single-quoted strings, double-quoted identifiers' contents are KEPT (a table name
 *  is one), and dollar-quoted bodies, in one left-to-right pass, keeping every newline. */
export function blankLiterals(sql: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      out += blank(sql.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Literal-blanked statements across the files, in order, squashed. */
export function statementsOf(sqls: string[]): string[] {
  return sqls.flatMap((sql) => blankLiterals(sql).split(';').map(squash).filter(Boolean));
}

const reTable = new RegExp(T, 'i');

/** Split a GRANT target or privilege list on commas outside parentheses. */
const splitTop = (s: string) => s.split(/,(?![^()]*\))/).map((p) => p.trim()).filter(Boolean);

/** Rule 1: every client grant on the table outside SELECT + column-list INSERT / UPDATE. */
export function findGrantProblems(statements: string[]): string[] {
  const out: string[] = [];
  for (const st of statements) {
    const g = /^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+(.+?)(?:\s+WITH\s+GRANT\s+OPTION)?$/i.exec(st);
    if (g) {
      if (!CLIENT_ROLE.test(g[3])) continue;
      const target = g[2].replace(/^TABLE\s+/i, '');
      const schemaWide = /^ALL\s+TABLES\s+IN\s+SCHEMA\b/i.test(target);
      const named = splitTop(target).some((t) => new RegExp(`^${T}$`, 'i').test(t));
      if (!schemaWide && !named) continue;
      for (const p of splitTop(g[1])) {
        const cols = /\(([^)]*)\)/.exec(p);
        const verb = squash(p.replace(/\([^)]*\)/, '')).toUpperCase();
        const ok =
          (verb === 'SELECT' && !cols) ||
          ((verb === 'INSERT' || verb === 'UPDATE' || verb === 'SELECT') && cols !== null && !/\bdecided_at\b/i.test(cols[1]));
        if (!ok) {
          out.push(st);
          break; // one finding per statement
        }
      }
      continue;
    }
    const d = /^ALTER\s+DEFAULT\s+PRIVILEGES\b.*?\bGRANT\s+(.+?)\s+ON\s+TABLES\s+TO\s+(.+)$/i.exec(st);
    if (d && CLIENT_ROLE.test(d[2]) && splitTop(d[1]).some((v) => !/^SELECT$/i.test(v))) out.push(st);
  }
  return out;
}

interface PolicyState {
  rlsEnabled: boolean;
  policies: Map<string, string>;
  altered: string[];
}

const unquote = (s: string) => s.replace(/^"|"$/g, '');

/** Rule 2: RLS on, and the policy set after the replay. */
export function replayPolicies(statements: string[]): PolicyState {
  const st: PolicyState = { rlsEnabled: false, policies: new Map(), altered: [] };
  for (const s of statements) {
    const rls = new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${T}\\s+(ENABLE|DISABLE)\\s+ROW\\s+LEVEL\\s+SECURITY$`, 'i').exec(s);
    if (rls) st.rlsEnabled = rls[1].toUpperCase() === 'ENABLE';
    const create = new RegExp(`^CREATE\\s+POLICY\\s+("[^"]+"|\\w+)\\s+ON\\s+${T}`, 'i').exec(s);
    if (create) st.policies.set(unquote(create[1]), s);
    const drop = new RegExp(`^DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?("[^"]+"|\\w+)\\s+ON\\s+${T}`, 'i').exec(s);
    if (drop) st.policies.delete(unquote(drop[1]));
    if (new RegExp(`^ALTER\\s+POLICY\\s+("[^"]+"|\\w+)\\s+ON\\s+${T}`, 'i').test(s)) st.altered.push(s);
  }
  return st;
}

interface TriggerState {
  fn: string | null;
  trigger: string | null;
  tampered: string[];
}

/** Rule 3: the last CREATE of the function (read with its dollar body intact) and of the
 *  trigger, plus any later DROP / DISABLE / ALTER FUNCTION. */
export function replayTrigger(sqls: string[]): TriggerState {
  const st: TriggerState = { fn: null, trigger: null, tampered: [] };
  for (const sql of sqls) {
    const events: { at: number; apply: () => void }[] = [];
    const on = (re: RegExp, apply: (m: RegExpMatchArray) => void) => {
      for (const m of sql.matchAll(re)) events.push({ at: m.index ?? 0, apply: () => apply(m) });
    };
    // Any dollar tag; the body runs to the SAME tag, then to the statement's `;`.
    on(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?${FN}"?\s*\([\s\S]*?\$(\w*)\$[\s\S]*?\$\1\$[^;]*;`, 'gi'), (m) => {
      st.fn = squash(m[0]);
    });
    on(new RegExp(String.raw`(?:DROP|ALTER)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:"?public"?\.)?"?${FN}"?\b[^;]*;`, 'gi'), (m) => {
      st.tampered.push(squash(m[0]));
    });
    on(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?${TRIGGER}"?\b[^;]*;`, 'gi'), (m) => {
      st.trigger = squash(m[0]).replace(/;$/, '');
    });
    on(new RegExp(String.raw`(?:DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?"?${TRIGGER}"?\b|ALTER\s+TABLE\s+[^;]*?${T}[^;]*?DISABLE\s+TRIGGER\b)[^;]*;`, 'gi'), (m) => {
      st.tampered.push(squash(m[0]));
    });
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return st;
}

/** Rule 4: does `granted` carry a DEFAULT anywhere (its column definition, or an ALTER)? */
export function grantedHasDefault(statements: string[]): boolean {
  for (const s of statements) {
    const create = new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${T}\\s*\\((.*)\\)$`, 'i').exec(s);
    if (create) {
      const col = splitTop(create[1]).find((c) => /^"?granted"?\s/i.test(c));
      if (col && /\bDEFAULT\b/i.test(col)) return true;
    }
    if (new RegExp(`^ALTER\\s+TABLE\\s+.*${T}.*\\bALTER\\s+(?:COLUMN\\s+)?"?granted"?\\s+SET\\s+DEFAULT\\b`, 'i').test(s)) return true;
  }
  return false;
}

describe("ai_consent — the owner's answer, at the database's time (CUL-552)", () => {
  const sqls = migrationsFrom(MIGRATIONS_DIR, FIRST);
  const statements = statementsOf(sqls);

  it('reads the migration that creates the table (non-vacuity)', () => {
    expect(statements.filter((s) => new RegExp(`^CREATE\\s+TABLE\\s+${T}`, 'i').test(s))).toHaveLength(1);
    // The grants rule 1 judges exist at all.
    expect(statements.filter((s) => /^GRANT\b/i.test(s) && reTable.test(s))).toHaveLength(3);
  });

  it('rule 1: client roles hold SELECT and column-list INSERT / UPDATE only, never decided_at', () => {
    expect(findGrantProblems(statements)).toEqual([]);
  });

  it('rule 2: RLS is on and the policies are exactly 100\'s three', () => {
    const st = replayPolicies(statements);
    expect(st.rlsEnabled).toBe(true);
    expect(st.altered).toEqual([]);
    expect(Object.fromEntries(st.policies)).toEqual(POLICIES);
  });

  it('rule 3: the stamp-and-freeze function and its trigger are as 100 wrote them', () => {
    const st = replayTrigger(sqls);
    expect(st.fn).toBe(FN_STATEMENT);
    expect(st.trigger).toBe(TRIGGER_STATEMENT);
    expect(st.tampered).toEqual([]);
  });

  it('rule 4: granted has no DEFAULT', () => {
    expect(grantedHasDefault(statements)).toBe(false);
  });
});

// Each detector driven over the real migration text with one mutation applied: the mutant
// must red, the original must not (C-18). In memory, so nothing is written.
describe('ai_consent guard — mutants, each killed', () => {
  const base = migrationsFrom(MIGRATIONS_DIR, FIRST);
  const plus = (extra: string) => [...base, extra];
  const mutate = (from: RegExp, to: string) => {
    const out = [...base];
    expect(from.test(out[0])).toBe(true);
    out[0] = out[0].replace(from, to);
    return out;
  };
  const grants = (sqls: string[]) => findGrantProblems(statementsOf(sqls));
  const policies = (sqls: string[]) => replayPolicies(statementsOf(sqls));

  it.each([
    'GRANT INSERT ON public.ai_consent TO authenticated;',
    'GRANT ALL ON ai_consent TO authenticated;',
    'GRANT INSERT, UPDATE ON public.ai_consent TO authenticated;',
    'GRANT TRUNCATE ON public.ai_consent TO authenticated;',
    'GRANT DELETE ON "public"."ai_consent" TO authenticated;',
    'GRANT UPDATE ON TABLE public.pets, public.ai_consent TO authenticated;',
    'GRANT UPDATE (granted, decided_at) ON public.ai_consent TO authenticated;',
    'GRANT INSERT ON ALL TABLES IN SCHEMA public TO authenticated;',
    'GRANT SELECT, TRIGGER ON public.ai_consent TO PUBLIC;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;',
  ])('rule 1 reds on %s', (extra) => {
    expect(grants(plus(extra))).toHaveLength(1);
  });

  it('rule 1 ignores service_role grants, other tables, and a GRANT quoted in a string', () => {
    expect(grants(plus('GRANT ALL ON public.ai_consent TO service_role;'))).toEqual([]);
    expect(grants(plus('GRANT ALL ON public.ai_consent_archive TO authenticated;'))).toEqual([]);
    expect(grants(plus("COMMENT ON TABLE public.pets IS 'never GRANT ALL ON ai_consent TO authenticated;';"))).toEqual([]);
  });

  it('rule 1 reds on the original REVOKE dropped back to 100\'s first draft (TRUNCATE kept)', () => {
    // The first draft revoked only INSERT / UPDATE / DELETE; the default grant is ALL. Model
    // the default as the explicit grant it is and the draft's narrower revoke leaves it.
    const draft = mutate(/REVOKE ALL ON public\.ai_consent FROM authenticated;\s*GRANT SELECT ON public\.ai_consent TO authenticated;/,
      'GRANT ALL ON public.ai_consent TO authenticated;\nREVOKE INSERT, UPDATE, DELETE ON public.ai_consent FROM authenticated;');
    expect(grants(draft).length).toBeGreaterThan(0);
  });

  it.each([
    'CREATE POLICY "x" ON public.ai_consent FOR DELETE TO authenticated USING (true);',
    'CREATE POLICY "x" ON public.ai_consent AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);',
    'CREATE POLICY x ON "ai_consent" FOR ALL TO authenticated USING (true);',
    'DROP POLICY "ai_consent_update_own" ON public.ai_consent;',
  ])('rule 2 reds on %s', (extra) => {
    expect(Object.fromEntries(policies(plus(extra)).policies)).not.toEqual(POLICIES);
  });

  it('rule 2 reds on ALTER POLICY and on RLS disabled', () => {
    expect(policies(plus('ALTER POLICY "ai_consent_update_own" ON public.ai_consent WITH CHECK (true);')).altered).toHaveLength(1);
    expect(policies(plus('ALTER TABLE public.ai_consent DISABLE ROW LEVEL SECURITY;')).rlsEnabled).toBe(false);
  });

  it('rule 2 is not fooled by a FOR ALL policy on another table before an ai_consent mention', () => {
    const st = policies(plus('CREATE POLICY "p" ON public.pets FOR ALL USING (true); COMMENT ON TABLE public.ai_consent IS \'x\';'));
    expect(Object.fromEntries(st.policies)).toEqual(POLICIES);
  });

  it('rule 3 reds on a dropped key-freeze arm, a $f$-tagged weaker body, and SECURITY DEFINER', () => {
    expect(replayTrigger(mutate(/IF TG_OP = 'UPDATE'[\s\S]*?END IF;/, '')).fn).not.toBe(FN_STATEMENT);
    // The tagged body must be READ (not merely missed), or this mutant is green over null.
    const tagged = replayTrigger(plus(`CREATE OR REPLACE FUNCTION public.${FN}() RETURNS TRIGGER LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END; $f$;`)).fn;
    expect(tagged).toContain('$f$ BEGIN RETURN NEW; END; $f$');
    expect(replayTrigger(mutate(/LANGUAGE plpgsql\nSET search_path/, 'LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path')).fn).not.toBe(FN_STATEMENT);
  });

  it.each([
    [/BEFORE INSERT OR UPDATE ON/, 'BEFORE INSERT ON'],
    [/BEFORE INSERT OR UPDATE ON/, 'BEFORE INSERT OR UPDATE OF granted ON'],
    [/FOR EACH ROW EXECUTE/, 'FOR EACH STATEMENT EXECUTE'],
    [/FOR EACH ROW EXECUTE/, 'FOR EACH ROW WHEN (false) EXECUTE'],
  ])('rule 3 reds on the trigger %s -> %s', (from, to) => {
    expect(replayTrigger(mutate(from, to)).trigger).not.toBe(TRIGGER_STATEMENT);
  });

  it.each([
    `DROP TRIGGER ${TRIGGER} ON public.ai_consent;`,
    `ALTER TABLE public.ai_consent DISABLE TRIGGER ${TRIGGER};`,
    'ALTER TABLE public.ai_consent DISABLE TRIGGER ALL;',
    `ALTER FUNCTION public.${FN}() SECURITY DEFINER;`,
    `DROP FUNCTION public.${FN}() CASCADE;`,
  ])('rule 3 reds on %s', (extra) => {
    expect(replayTrigger(plus(extra)).tampered).toHaveLength(1);
  });

  it('rule 4 reds on a DEFAULT, on the same line, the next line, or a later ALTER', () => {
    const st = (sqls: string[]) => grantedHasDefault(statementsOf(sqls));
    expect(st(mutate(/granted\s+BOOLEAN NOT NULL,/, 'granted BOOLEAN NOT NULL DEFAULT false,'))).toBe(true);
    expect(st(mutate(/granted\s+BOOLEAN NOT NULL,/, 'granted BOOLEAN NOT NULL\n    DEFAULT true,'))).toBe(true);
    expect(st(plus('ALTER TABLE public.ai_consent ALTER COLUMN granted SET DEFAULT true;'))).toBe(true);
  });

  it('files are ordered by number, not text', () => {
    // '1000_x' < '100_a' as text; numerically it is later and must be read.
    expect(orderMigrations(['099_a.sql', '100_ai_consent.sql', '1000_x.sql', '101_b.sql', '100_aa.sql', 'README.md'], FIRST))
      .toEqual(['100_aa.sql', '100_ai_consent.sql', '101_b.sql', '1000_x.sql']);
  });
});
