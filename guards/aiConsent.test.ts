// `ai_consent` + `ai_consent_events` (100, CUL-552, App Review 5.1.2(i)): the pins that keep
// the owner's answer the owner's, at the database's time, with every answer on record.
//
// WHAT THE RULES ARE (each a pin over the migration FILES numbered 100 and up, replayed in
// order, because a later migration that re-grants a verb, adds a policy, alters a column or
// re-creates a trigger would quietly undo what 100 set):
//   1. GRANTS. On `ai_consent` a client role (authenticated / anon / PUBLIC) holds SELECT and
//      column-list INSERT / UPDATE only, never naming `decided_at`. On `ai_consent_events` it
//      holds SELECT only (by column, without `id`), and so does service_role: the history's
//      one writer is a trigger, and a leaked key must not be able to forge, flip or erase
//      it. service_role also keeps no DELETE / TRUNCATE on `ai_consent`, so the state
//      cannot vanish without a history row; both revokes are pinned as present. Any other verb (DELETE,
//      TRUNCATE, TRIGGER, REFERENCES, ALL), a table-level INSERT / UPDATE (which re-covers
//      every column; 032's maintenance warning, which nothing enforced until now), a
//      schema-wide `ON ALL TABLES IN SCHEMA`, or an `ALTER DEFAULT PRIVILEGES` handing a client
//      role a write verb, reds. TRUNCATE is here because it ignores RLS and fires no row
//      trigger (rls-privacy-reviewer, PG16 replay: one `TRUNCATE` erased every account's
//      answer).
//   2. RLS AND POLICIES. RLS stays enabled on both tables, and each table's policies are
//      EXACTLY 100's, statement for statement. The set is pinned, not scanned for bad shapes,
//      because "a permissive WITH CHECK (true)" has more spellings than a scan has.
//   3. THE TRIGGERS. Both functions' whole CREATE statements are pinned by equality (the
//      realistic regressions: a dropped key-freeze arm, which is the only thing keeping
//      `scope` fixed under a PostgREST upsert; the logger losing SECURITY DEFINER, which
//      would refuse every consent write; the logger gaining a read of another row), both
//      CREATE TRIGGER statements likewise (event list, timing, FOR EACH ROW, no WHEN, no
//      UPDATE OF), and a later DROP / DISABLE / ALTER FUNCTION reds.
//   4. THE TABLES' SHAPE. Both CREATE TABLE statements are pinned by equality and no later
//      ALTER TABLE may touch either (bar re-enabling RLS). That holds the D10 ruling (the
//      scope CHECK admits 'ai_boundary' alone: PM 2026-10-11), `granted` with no DEFAULT (a
//      default would let an insert that forgot the answer record one; absence never reads as
//      yes) and `decided_at` with no client path, in one rule. A new scope or column is an
//      explicit migration that updates this file, which is the point.
//
// HOW IT READS SQL. Comments are stripped (`stripSqlComments`). For rules 1, 2 and 4's ALTER
// scan, string literals and dollar-quoted bodies are then blanked line-preservingly in ONE
// pass, so a `COMMENT ON` or `RAISE` string that quotes a GRANT is not a GRANT, and the text
// is split into statements at `;`, so no match spans two statements. Rule 3 and rule 4's
// CREATE pin read the comment-stripped text, because what they pin includes literals. A
// table reference matches with or without `public.` and with or without double quotes.
//
// WHAT IT DOES NOT CLAIM (C-38: a blind spot left unstated reads as coverage):
//   · It cannot execute plpgsql or RLS. The behavioural proof (cross-account insert and
//     upsert, the existence oracle, forged decided_at, key moves, delete and TRUNCATE on
//     both tables, a forged / edited / erased history row, a direct call to the logger,
//     anon, the service-role plant, the cascade, history = state, and the mutants: the
//     key-freeze arm removed, the logger made INVOKER) ran on PG16 replays with a
//     non-superuser owner and is recorded in the PR.
//   · SQL built at runtime (`EXECUTE 'GRANT …'` inside a DO block) is blanked with its
//     string and so is invisible. So is a grant or policy changed by hand in the dashboard
//     (the B-505 class); `get_advisors` and the privilege check after apply cover that.
//   · A GRANT to a role other than the three client roles is ignored, so a new role that
//     PostgREST later switches into would need its own rule.
//   · A file numbered below 100 that touches the tables (which would mean they existed
//     before their own migration) is out of scope.

import * as fs from 'fs';
import * as path from 'path';

import { stripSqlComments } from './sqlComments';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const FIRST = 100;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A table, schema-qualified or not, quoted or not. `ai_consent` never matches
 *  `ai_consent_events`. */
const tableRe = (name: string) => String.raw`(?:"?public"?\s*\.\s*)?"?${name}"?(?![\w"])`;
const CLIENT_ROLE = /(?:^|[\s,"])(authenticated|anon|public)(?=$|[\s,"])/i;

interface TableSpec {
  name: string;
  /** Column-list INSERT / UPDATE allowed for clients (never on `decided_at`). */
  columnWrites: boolean;
  /** Roles that may hold no write verb at all here, beyond the client roles. */
  writeLocked: RegExp | null;
  /** The REVOKE statements 100 must carry against service_role, verbatim (squashed). */
  serviceRevoke: string;
  create: string;
  policies: Readonly<Record<string, string>>;
}

const TABLES: readonly TableSpec[] = [
  {
    name: 'ai_consent',
    columnWrites: true,
    writeLocked: null,
    serviceRevoke: 'REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.ai_consent FROM service_role',
    create: squash(`
      CREATE TABLE public.ai_consent (
        user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        scope        TEXT NOT NULL CHECK (scope IN ('ai_boundary')),
        granted      BOOLEAN NOT NULL,
        copy_version TEXT NOT NULL CHECK (length(btrim(copy_version)) > 0 AND length(copy_version) <= 64),
        source       TEXT NOT NULL CHECK (source IN ('onboarding', 'first_open', 'backstop', 'settings')),
        decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, scope)
      );`),
    policies: {
      ai_consent_select_own:
        'CREATE POLICY "ai_consent_select_own" ON public.ai_consent FOR SELECT TO authenticated USING (user_id = (select auth.uid()))',
      ai_consent_insert_own:
        'CREATE POLICY "ai_consent_insert_own" ON public.ai_consent FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()))',
      ai_consent_update_own:
        'CREATE POLICY "ai_consent_update_own" ON public.ai_consent FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))',
    },
  },
  {
    name: 'ai_consent_events',
    columnWrites: false,
    writeLocked: /(?:^|[\s,"])service_role(?=$|[\s,"])/i,
    serviceRevoke: 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.ai_consent_events FROM service_role',
    create: squash(`
      CREATE TABLE public.ai_consent_events (
        id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        scope        TEXT NOT NULL CHECK (scope IN ('ai_boundary')),
        granted      BOOLEAN NOT NULL,
        copy_version TEXT NOT NULL CHECK (length(btrim(copy_version)) > 0 AND length(copy_version) <= 64),
        source       TEXT NOT NULL CHECK (source IN ('onboarding', 'first_open', 'backstop', 'settings')),
        decided_at   TIMESTAMPTZ NOT NULL
      );`),
    policies: {
      ai_consent_events_select_own:
        'CREATE POLICY "ai_consent_events_select_own" ON public.ai_consent_events FOR SELECT TO authenticated USING (user_id = (select auth.uid()))',
    },
  },
];

interface TriggerSpec {
  fn: string;
  fnStatement: string;
  trigger: string;
  triggerStatement: string;
}

const TRIGGERS: readonly TriggerSpec[] = [
  {
    fn: 'stamp_ai_consent_decided_at',
    fnStatement: squash(`
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
      $$;`),
    trigger: 'trg_ai_consent_decided_at',
    triggerStatement:
      'CREATE TRIGGER trg_ai_consent_decided_at BEFORE INSERT OR UPDATE ON public.ai_consent FOR EACH ROW EXECUTE FUNCTION public.stamp_ai_consent_decided_at()',
  },
  {
    fn: 'log_ai_consent_event',
    fnStatement: squash(`
      CREATE OR REPLACE FUNCTION public.log_ai_consent_event()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, pg_temp
      AS $$
      BEGIN
        INSERT INTO public.ai_consent_events (user_id, scope, granted, copy_version, source, decided_at)
        VALUES (NEW.user_id, NEW.scope, NEW.granted, NEW.copy_version, NEW.source, NEW.decided_at);
        RETURN NULL;
      END;
      $$;`),
    trigger: 'trg_ai_consent_log',
    triggerStatement:
      'CREATE TRIGGER trg_ai_consent_log AFTER INSERT OR UPDATE ON public.ai_consent FOR EACH ROW EXECUTE FUNCTION public.log_ai_consent_event()',
  },
];

/** File selection and order: numeric, not lexical (`1000_x` sorts below `100_a` as text,
 *  because '0' < '_'). */
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

/** Blank single-quoted strings and dollar-quoted bodies in one left-to-right pass, keeping
 *  every newline. Double-quoted identifiers are kept (a table name is one). */
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

/** Split a GRANT target or privilege list on commas outside parentheses. */
const splitTop = (s: string) => s.split(/,(?![^()]*\))/).map((p) => p.trim()).filter(Boolean);

/** Rule 1: every client grant on `spec`'s table outside what the spec allows. One finding
 *  per statement. */
export function findGrantProblems(statements: string[], spec: TableSpec): string[] {
  const T = tableRe(spec.name);
  const out: string[] = [];
  for (const st of statements) {
    const g = /^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+(.+?)(?:\s+WITH\s+GRANT\s+OPTION)?$/i.exec(st);
    if (g) {
      const client = CLIENT_ROLE.test(g[3]);
      const locked = spec.writeLocked !== null && spec.writeLocked.test(g[3]);
      if (!client && !locked) continue;
      const target = g[2].replace(/^TABLE\s+/i, '');
      const schemaWide = /^ALL\s+TABLES\s+IN\s+SCHEMA\b/i.test(target);
      const named = splitTop(target).some((t) => new RegExp(`^${T}$`, 'i').test(t));
      if (!schemaWide && !named) continue;
      for (const p of splitTop(g[1])) {
        const cols = /\(([^)]*)\)/.exec(p);
        const verb = squash(p.replace(/\([^)]*\)/, '')).toUpperCase();
        // A read is RLS's to scope, by table or by column; never a write for a locked role.
        const read = verb === 'SELECT';
        const columnWrite =
          client &&
          spec.columnWrites &&
          (verb === 'INSERT' || verb === 'UPDATE') &&
          cols !== null &&
          !/\bdecided_at\b/i.test(cols[1]);
        if (!read && !columnWrite) {
          out.push(st);
          break;
        }
      }
      continue;
    }
    const d = /^ALTER\s+DEFAULT\s+PRIVILEGES\b.*?\bGRANT\s+(.+?)\s+ON\s+TABLES\s+TO\s+(.+)$/i.exec(st);
    const dRole = d !== null && (CLIENT_ROLE.test(d[2]) || (spec.writeLocked !== null && spec.writeLocked.test(d[2])));
    if (d && dRole && splitTop(d[1]).some((v) => !/^SELECT$/i.test(v))) out.push(st);
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
export function replayPolicies(statements: string[], table: string): PolicyState {
  const T = tableRe(table);
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

/** Rule 3: the last CREATE of the function (read with its dollar body intact, any tag) and of
 *  its trigger, plus any later DROP / DISABLE / ALTER FUNCTION. */
export function replayTrigger(sqls: string[], spec: TriggerSpec): TriggerState {
  const T = tableRe('ai_consent');
  const st: TriggerState = { fn: null, trigger: null, tampered: [] };
  for (const sql of sqls) {
    const events: { at: number; apply: () => void }[] = [];
    const on = (re: RegExp, apply: (m: RegExpMatchArray) => void) => {
      for (const m of sql.matchAll(re)) events.push({ at: m.index ?? 0, apply: () => apply(m) });
    };
    on(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?${spec.fn}"?\s*\([\s\S]*?\$(\w*)\$[\s\S]*?\$\1\$[^;]*;`, 'gi'), (m) => {
      st.fn = squash(m[0]);
    });
    on(new RegExp(String.raw`(?:DROP|ALTER)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:"?public"?\.)?"?${spec.fn}"?\b[^;]*;`, 'gi'), (m) => {
      st.tampered.push(squash(m[0]));
    });
    on(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?${spec.trigger}"?\b[^;]*;`, 'gi'), (m) => {
      st.trigger = squash(m[0]).replace(/;$/, '');
    });
    on(new RegExp(String.raw`(?:DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?"?${spec.trigger}"?\b|ALTER\s+TABLE\s+[^;]*?${T}[^;]*?DISABLE\s+TRIGGER\b)[^;]*;`, 'gi'), (m) => {
      st.tampered.push(squash(m[0]));
    });
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return st;
}

/** Rule 4: every CREATE TABLE of the table (literals intact), squashed. */
export function createsOf(sqls: string[], table: string): string[] {
  const re = new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${tableRe(table)}\s*\([\s\S]*?\n\s*\)\s*;`, 'gi');
  return sqls.flatMap((sql) => [...sql.matchAll(re)].map((m) => squash(m[0])));
}

/** Rule 4: every later ALTER TABLE of the table, bar enabling RLS. */
export function findAlters(statements: string[], table: string): string[] {
  const T = tableRe(table);
  return statements.filter(
    (s) =>
      new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${T}`, 'i').test(s) &&
      !new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${T}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY$`, 'i').test(s),
  );
}

describe("ai_consent + ai_consent_events — the owner's answer and its history (CUL-552)", () => {
  const sqls = migrationsFrom(MIGRATIONS_DIR, FIRST);
  const statements = statementsOf(sqls);

  it('reads the migration that creates both tables (non-vacuity)', () => {
    for (const t of TABLES) expect(createsOf(sqls, t.name)).toHaveLength(1);
    // The grants rule 1 judges exist at all: SELECT + two column grants, and SELECT.
    const grantsOn = (t: string) =>
      statements.filter((s) => new RegExp(`^GRANT\\b.*\\bON\\s+(?:TABLE\\s+)?${tableRe(t)}\\s+TO\\b`, 'i').test(s));
    expect(grantsOn('ai_consent')).toHaveLength(3);
    expect(grantsOn('ai_consent_events')).toHaveLength(1);
  });

  it.each(TABLES.map((t) => [t.name, t] as const))('rule 1: client grants on %s are what the spec allows', (_n, spec) => {
    expect(findGrantProblems(statements, spec)).toEqual([]);
  });

  it.each(TABLES.map((t) => [t.name, t] as const))('rule 1: 100 revokes service_role\'s destructive verbs on %s', (_n, spec) => {
    expect(statements).toContain(spec.serviceRevoke);
  });

  it.each(TABLES.map((t) => [t.name, t] as const))('rule 2: RLS is on and %s has exactly its policies', (_n, spec) => {
    const st = replayPolicies(statements, spec.name);
    expect(st.rlsEnabled).toBe(true);
    expect(st.altered).toEqual([]);
    expect(Object.fromEntries(st.policies)).toEqual(spec.policies);
  });

  it.each(TRIGGERS.map((t) => [t.fn, t] as const))('rule 3: %s and its trigger are as 100 wrote them', (_n, spec) => {
    const st = replayTrigger(sqls, spec);
    expect(st.fn).toBe(spec.fnStatement);
    expect(st.trigger).toBe(spec.triggerStatement);
    expect(st.tampered).toEqual([]);
  });

  it.each(TABLES.map((t) => [t.name, t] as const))('rule 4: %s keeps its shape', (_n, spec) => {
    expect(createsOf(sqls, spec.name)).toEqual([spec.create]);
    expect(findAlters(statements, spec.name)).toEqual([]);
  });
});

// Each detector driven over the real migration text with one mutation applied: the mutant
// must red, the original must not (C-18). In memory, so nothing is written.
describe('ai_consent guard — mutants, each killed', () => {
  const base = migrationsFrom(MIGRATIONS_DIR, FIRST);
  const [STATE, EVENTS] = TABLES;
  const [STAMP, LOG] = TRIGGERS;
  const plus = (extra: string) => [...base, extra];
  const mutate = (from: RegExp, to: string) => {
    const out = [...base];
    expect(from.test(out[0])).toBe(true);
    out[0] = out[0].replace(from, to);
    return out;
  };
  const grants = (sqls: string[], spec: TableSpec) => findGrantProblems(statementsOf(sqls), spec);
  const policies = (sqls: string[], table: string) => replayPolicies(statementsOf(sqls), table);

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
  ])('rule 1 (state) reds on %s', (extra) => {
    expect(grants(plus(extra), STATE)).toHaveLength(1);
  });

  it.each([
    'GRANT INSERT (user_id, scope, granted, copy_version, source, decided_at) ON public.ai_consent_events TO authenticated;',
    'GRANT INSERT (granted) ON public.ai_consent_events TO authenticated;',
    'GRANT UPDATE ON ai_consent_events TO authenticated;',
    'GRANT TRUNCATE ON public.ai_consent_events TO anon;',
    'GRANT INSERT, UPDATE, DELETE ON public.ai_consent_events TO service_role;',
    'GRANT ALL ON public.ai_consent_events TO service_role;',
  ])('rule 1 (history) reds on %s', (extra) => {
    expect(grants(plus(extra), EVENTS)).toHaveLength(1);
  });

  it('rule 1 ignores service_role on the state, column reads, other tables, and a GRANT quoted in a string', () => {
    expect(grants(plus('GRANT INSERT, UPDATE ON public.ai_consent TO service_role;'), STATE)).toEqual([]);
    expect(grants(plus('GRANT SELECT (user_id, granted) ON public.ai_consent_events TO authenticated;'), EVENTS)).toEqual([]);
    expect(grants(plus('GRANT ALL ON public.ai_consent_archive TO authenticated;'), STATE)).toEqual([]);
    expect(grants(plus('GRANT ALL ON public.ai_consent_events TO authenticated;'), STATE)).toEqual([]);
    expect(grants(plus("COMMENT ON TABLE public.pets IS 'never GRANT ALL ON ai_consent TO authenticated;';"), STATE)).toEqual([]);
  });

  it('rule 1 reds when a service_role revoke is dropped from 100', () => {
    for (const spec of TABLES) {
      const dropped = mutate(new RegExp(spec.serviceRevoke.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ';'), '');
      expect(statementsOf(dropped)).not.toContain(spec.serviceRevoke);
    }
  });

  it("rule 1 reds on 100's first draft (the narrow revoke that kept TRUNCATE)", () => {
    // The default grant is ALL; model it as the explicit grant it is, then the draft's revoke.
    const draft = mutate(/REVOKE ALL ON public\.ai_consent FROM authenticated;\s*GRANT SELECT ON public\.ai_consent TO authenticated;/,
      'GRANT ALL ON public.ai_consent TO authenticated;\nREVOKE INSERT, UPDATE, DELETE ON public.ai_consent FROM authenticated;');
    expect(grants(draft, STATE).length).toBeGreaterThan(0);
  });

  it.each([
    ['ai_consent', 'CREATE POLICY "x" ON public.ai_consent FOR DELETE TO authenticated USING (true);'],
    ['ai_consent', 'CREATE POLICY "x" ON public.ai_consent AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);'],
    ['ai_consent', 'CREATE POLICY x ON "ai_consent" FOR ALL TO authenticated USING (true);'],
    ['ai_consent', 'DROP POLICY "ai_consent_update_own" ON public.ai_consent;'],
    ['ai_consent_events', 'CREATE POLICY "w" ON public.ai_consent_events FOR INSERT TO authenticated WITH CHECK (true);'],
    ['ai_consent_events', 'DROP POLICY "ai_consent_events_select_own" ON public.ai_consent_events;'],
  ])('rule 2 (%s) reds on %s', (table, extra) => {
    const spec = TABLES.find((t) => t.name === table) as TableSpec;
    expect(Object.fromEntries(policies(plus(extra), table).policies)).not.toEqual(spec.policies);
  });

  it('rule 2 reds on ALTER POLICY and on RLS disabled, on either table', () => {
    expect(policies(plus('ALTER POLICY "ai_consent_update_own" ON public.ai_consent WITH CHECK (true);'), 'ai_consent').altered).toHaveLength(1);
    expect(policies(plus('ALTER TABLE public.ai_consent DISABLE ROW LEVEL SECURITY;'), 'ai_consent').rlsEnabled).toBe(false);
    expect(policies(plus('ALTER TABLE ai_consent_events DISABLE ROW LEVEL SECURITY;'), 'ai_consent_events').rlsEnabled).toBe(false);
  });

  it('rule 2 is not fooled by a FOR ALL policy on another table before an ai_consent mention', () => {
    const st = policies(plus('CREATE POLICY "p" ON public.pets FOR ALL USING (true); COMMENT ON TABLE public.ai_consent IS \'x\';'), 'ai_consent');
    expect(Object.fromEntries(st.policies)).toEqual(STATE.policies);
  });

  it('rule 3 reds on a dropped key-freeze arm, a $f$-tagged weaker body, and SECURITY DEFINER on the stamp', () => {
    expect(replayTrigger(mutate(/IF TG_OP = 'UPDATE'[\s\S]*?END IF;/, ''), STAMP).fn).not.toBe(STAMP.fnStatement);
    // The tagged body must be READ (not merely missed), or this mutant is green over null.
    const tagged = replayTrigger(plus(`CREATE OR REPLACE FUNCTION public.${STAMP.fn}() RETURNS TRIGGER LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END; $f$;`), STAMP).fn;
    expect(tagged).toContain('$f$ BEGIN RETURN NEW; END; $f$');
    expect(replayTrigger(mutate(/(stamp_ai_consent_decided_at\(\)\nRETURNS TRIGGER\nLANGUAGE plpgsql\n)SET search_path/, '$1SECURITY DEFINER\nSET search_path'), STAMP).fn).not.toBe(STAMP.fnStatement);
  });

  it('rule 3 reds on the logger losing DEFINER, rewriting a column, or reading another row', () => {
    expect(replayTrigger(mutate(/SECURITY DEFINER\n/, ''), LOG).fn).not.toBe(LOG.fnStatement);
    expect(replayTrigger(mutate(/NEW\.source, NEW\.decided_at\)/, 'NEW.source, now())'), LOG).fn).not.toBe(LOG.fnStatement);
    const reads = replayTrigger(plus(`CREATE OR REPLACE FUNCTION public.${LOG.fn}() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN PERFORM 1 FROM public.ai_consent; RETURN NULL; END; $$;`), LOG).fn;
    expect(reads).toContain('PERFORM 1 FROM public.ai_consent');
  });

  it.each([
    ['stamp', STAMP, /BEFORE INSERT OR UPDATE ON/, 'BEFORE INSERT ON'],
    ['stamp', STAMP, /BEFORE INSERT OR UPDATE ON/, 'BEFORE INSERT OR UPDATE OF granted ON'],
    ['stamp', STAMP, /(trg_ai_consent_decided_at[\s\S]*?)FOR EACH ROW EXECUTE/, '$1FOR EACH STATEMENT EXECUTE'],
    ['stamp', STAMP, /(trg_ai_consent_decided_at[\s\S]*?)FOR EACH ROW EXECUTE/, '$1FOR EACH ROW WHEN (false) EXECUTE'],
    ['log', LOG, /AFTER INSERT OR UPDATE ON/, 'AFTER INSERT ON'],
    ['log', LOG, /(trg_ai_consent_log\n {2})AFTER/, '$1BEFORE'],
  ])('rule 3 (%s) reds when the trigger is rewritten', (_n, spec, from, to) => {
    expect(replayTrigger(mutate(from, to), spec).trigger).not.toBe(spec.triggerStatement);
  });

  it.each([
    ['stamp', STAMP, `DROP TRIGGER ${STAMP.trigger} ON public.ai_consent;`],
    ['stamp', STAMP, `ALTER TABLE public.ai_consent DISABLE TRIGGER ${STAMP.trigger};`],
    ['log', LOG, 'ALTER TABLE public.ai_consent DISABLE TRIGGER ALL;'],
    ['log', LOG, `DROP TRIGGER IF EXISTS ${LOG.trigger} ON public.ai_consent;`],
    ['stamp', STAMP, `ALTER FUNCTION public.${STAMP.fn}() SECURITY DEFINER;`],
    ['log', LOG, `ALTER FUNCTION public.${LOG.fn}() SECURITY INVOKER;`],
    ['log', LOG, `DROP FUNCTION public.${LOG.fn}() CASCADE;`],
  ])('rule 3 (%s) reds on a later DROP / DISABLE / ALTER', (_n, spec, extra) => {
    expect(replayTrigger(plus(extra), spec).tampered).toHaveLength(1);
  });

  it('rule 4 reds on a widened scope, a DEFAULT on granted (same or next line), and any later ALTER TABLE', () => {
    const widened = mutate(/(CREATE TABLE public\.ai_consent \([\s\S]*?)CHECK \(scope IN \('ai_boundary'\)\)/, "$1CHECK (scope IN ('ai_boundary', 'photo_analysis'))");
    expect(createsOf(widened, 'ai_consent')).not.toEqual([STATE.create]);
    const defaulted = mutate(/(CREATE TABLE public\.ai_consent \([\s\S]*?granted {6}BOOLEAN NOT NULL),/, '$1\n    DEFAULT true,');
    expect(createsOf(defaulted, 'ai_consent')).not.toEqual([STATE.create]);
    const alters = (extra: string, t: string) => findAlters(statementsOf(plus(extra)), t);
    expect(alters('ALTER TABLE public.ai_consent ALTER COLUMN granted SET DEFAULT true;', 'ai_consent')).toHaveLength(1);
    expect(alters('ALTER TABLE public.ai_consent DROP CONSTRAINT ai_consent_scope_check;', 'ai_consent')).toHaveLength(1);
    expect(alters('ALTER TABLE "ai_consent_events" ADD COLUMN note TEXT;', 'ai_consent_events')).toHaveLength(1);
    // An ALTER of the history table is not an ALTER of the state table.
    expect(alters('ALTER TABLE public.ai_consent_events ADD COLUMN note TEXT;', 'ai_consent')).toEqual([]);
  });

  it('files are ordered by number, not text', () => {
    expect(orderMigrations(['099_a.sql', '100_ai_consent.sql', '1000_x.sql', '101_b.sql', '100_aa.sql', 'README.md'], FIRST))
      .toEqual(['100_aa.sql', '100_ai_consent.sql', '101_b.sql', '1000_x.sql']);
  });
});
