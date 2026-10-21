import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-2044 (migration 106): a food's id can never be claimed again. Every
// nyx-food-photos policy admits a caller to `{foodItemId}/…` when that id is one
// of their foods, and the phone chooses food ids (offline capture, presync,
// commitFood's re-create), so an account that inserted a food with a dead food's
// id, or moved its own food onto one, took over the leftover photos. 106 keeps a
// server-only ledger of every retired id and its owner, refuses an insert of an id
// another account holds (live row, ledger, or storage object), and freezes a
// food's id and owner. Proven on a PG16 stub replay of the touched surface with
// every attack driven with 106 on and off (the PR records the run), and attacked
// by the rls-privacy-reviewer (pass 1 found F1-F3; their mutants are
// tests here).
//
// This file pins the live definitions (the LAST in filename order) by their exact
// text, so any later edit to either function, or an ALTER, DROP, DISABLE or
// competing trigger that reopens the claim, reds here; and it pins the ledger as
// server-only (RLS on, no policy, no client grant).
//
// Every check is a pure function over text, driven against the repository AND
// against mutants below, so a check that cannot fail is caught here (C-18).
//
// STATED BLIND SPOTS:
//   · Text, not a database: a definition that parses here and fails to apply is
//     caught only by the replay. The replay is the PR's, not CI's.
//   · Dynamic SQL (`EXECUTE format('ALTER TABLE %I …')`) is not read.
//   · A function body in single quotes rather than dollar quotes is not read as a
//     definition, so a redefinition written that way is invisible.
//   · A grant through a role the client roles are members of, or a schema-wide
//     `GRANT … ON ALL TABLES IN SCHEMA public`, is not read as a ledger grant.
//   · A superuser can disable the triggers; that is the server, not a client.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

// The live definitions, exactly. A change to either function is a change to this
// constant, made on purpose in the PR that makes it, with its own replay.
const PINNED: Record<string, string> = {
  retire_food_item_id: squash(`
CREATE OR REPLACE FUNCTION public.retire_food_item_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  SELECT u.id INTO owner FROM auth.users u WHERE u.id = OLD.created_by_user_id;
  INSERT INTO public.food_item_retired_ids AS r (id, owner_id)
  VALUES (OLD.id, owner)
  ON CONFLICT (id) DO UPDATE SET owner_id = NULL
    WHERE r.owner_id IS DISTINCT FROM excluded.owner_id;
  RETURN OLD;
END; $$;`),
  guard_food_item_id: squash(`
CREATE OR REPLACE FUNCTION public.guard_food_item_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
      RAISE EXCEPTION 'A food''s id and owner cannot change' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (auth.uid() IS NOT NULL AND NEW.created_by_user_id IS DISTINCT FROM auth.uid())
     OR EXISTS (
       SELECT 1 FROM public.food_items f
       WHERE f.id = NEW.id
         AND f.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id)
     OR EXISTS (
       SELECT 1 FROM public.food_item_retired_ids r
       WHERE r.id = NEW.id
         AND r.owner_id IS DISTINCT FROM NEW.created_by_user_id)
     OR EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'nyx-food-photos'
         AND (storage.foldername(o.name))[1] = NEW.id::text
         AND coalesce(o.owner_id, o.owner::text) IS DISTINCT FROM NEW.created_by_user_id::text) THEN
    RAISE EXCEPTION 'A food''s id and owner cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;`),
};

// Each trigger, by the exact shape it must keep.
const TRIGGERS: Record<string, { fn: string; when: string }> = {
  trg_food_items_guard_id: { fn: 'guard_food_item_id', when: String.raw`BEFORE\s+INSERT\s+OR\s+UPDATE` },
  trg_food_items_retire_id: { fn: 'retire_food_item_id', when: String.raw`AFTER\s+DELETE` },
};

const LEDGER = 'food_item_retired_ids';

// An identifier, optionally quoted, optionally schema-qualified (any schema).
const ID = String.raw`(?:"?\w+"?\s*\.\s*)?"?(\w+)"?`;
const QUAL = (name: string): string => String.raw`(?:"?\w+"?\s*\.\s*)?"?${name}"?`;

function allMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n');
}

/** The last definition of each function in `sql`, by unqualified lower-cased name. */
function liveFunctions(sql: string): Map<string, { text: string; index: number }> {
  const out = new Map<string, { text: string; index: number }>();
  const re = new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+${ID}\s*\([\s\S]*?\$(\w*)\$[\s\S]*?\$\2\$[^;]*;`, 'gi');
  for (const m of sql.matchAll(re)) out.set(m[1].toLowerCase(), { text: m[0], index: m.index ?? 0 });
  return out;
}

/** Every trigger created on food_items, as [trigger, function], lower-cased and unqualified. */
export function foodItemTriggers(sql: string): Array<[string, string]> {
  const re = new RegExp(
    String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?(\w+)"?[^;]*?\bON\s+(?:ONLY\s+)?${QUAL('food_items')}\s[^;]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+${ID}\s*\(`,
    'gi',
  );
  return [...sql.matchAll(re)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]);
}

/** The problems with 106's guarantee, read from every migration in order. Empty when it holds. */
export function guardProblems(sql: string): string[] {
  const problems: string[] = [];
  const fns = liveFunctions(sql);

  for (const [name, pinned] of Object.entries(PINNED)) {
    const live = fns.get(name);
    if (!live) {
      problems.push(`no definition of ${name}`);
      continue;
    }
    if (squash(live.text) !== pinned) problems.push(`the live ${name} is not the pinned definition`);
    if (new RegExp(String.raw`ALTER\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s+${QUAL(name)}`, 'i').test(sql)) {
      problems.push(`an ALTER FUNCTION/ROUTINE changes ${name}`);
    }
    if (new RegExp(String.raw`DROP\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s[^;]*\b${name}\b`, 'i').test(sql.slice(live.index))) {
      problems.push(`${name} is dropped after its live definition`);
    }
    // EXECUTE revoked BY NAME from each client role after the live definition.
    // This project's default ACL grants EXECUTE to anon and authenticated
    // explicitly, so a REVOKE FROM PUBLIC alone leaves both (measured on CUL-867;
    // lib/functionHardening.test.ts models it otherwise, CUL-881).
    const after = sql.slice(live.index);
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      if (!new RegExp(String.raw`REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+${QUAL(name)}\s*\(\s*\)\s+FROM\s+(?:[\w\s,]*\b)?${role}\b`, 'i').test(after)) {
        problems.push(`${name}: EXECUTE is not revoked from ${role} by name`);
      }
    }
    if (new RegExp(String.raw`\bGRANT\s[^;]*\bON\s+FUNCTION\s+${QUAL(name)}\s*\([^;]*\bTO\s[^;]*\b(?:anon|authenticated|public)\b`, 'i').test(after)) {
      problems.push(`${name}: EXECUTE is granted to a client role`);
    }
  }

  for (const [trigger, { fn, when }] of Object.entries(TRIGGERS)) {
    // Every creation of the name, CREATE OR REPLACE included (a replacement in
    // another shape, or with a WHEN, is the live one); the last must be exact.
    const creates = [
      ...sql.matchAll(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?${trigger}"?[\s\S]*?;`, 'gi')),
    ];
    const shape = new RegExp(String.raw`^CREATE\s+TRIGGER\s+${trigger}\s+${when}\s+ON\s+${QUAL('food_items')}\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+${QUAL(fn)}\s*\(\s*\)\s*;$`, 'i');
    if (creates.length === 0 || !shape.test(creates[creates.length - 1][0])) {
      problems.push(`no ${trigger} on food_items in its required shape`);
      continue;
    }
    const after = sql.slice(creates[creates.length - 1].index ?? 0);
    if (new RegExp(String.raw`DROP\s+TRIGGER[^;]*\b${trigger}\b`, 'i').test(after)) problems.push(`${trigger} is dropped after its last creation`);
    if (new RegExp(String.raw`ALTER\s+TRIGGER\s+"?${trigger}"?`, 'i').test(after)) problems.push(`${trigger} is renamed or altered after its last creation`);
    // Every subcommand of every ALTER TABLE on food_items, in order; the last
    // toggle wins. `ENABLE REPLICA` fires only in replica sessions, so it switches
    // the trigger off for every client as surely as DISABLE does.
    const toggles: string[] = [];
    const alters = new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUAL('food_items')}\s[^;]*;`, 'gi');
    for (const stmt of after.matchAll(alters)) {
      for (const t of stmt[0].matchAll(new RegExp(String.raw`\b(DISABLE|ENABLE(?:\s+(?:REPLICA|ALWAYS))?)\s+TRIGGER\s+(?:"?${trigger}"?|ALL|USER)(?![\w"])`, 'gi'))) {
        toggles.push(squash(t[1]).toUpperCase());
      }
    }
    const last = toggles.length ? toggles[toggles.length - 1] : 'ENABLE';
    if (last === 'DISABLE' || last === 'ENABLE REPLICA') problems.push(`${trigger} is disabled after its last creation`);
  }

  // Any OTHER trigger on food_items runs beside 106's and could move an id or an
  // owner after the guard has read it. Fail closed: a function this file cannot
  // read counts as one that might.
  for (const [trigger, fnName] of foodItemTriggers(sql)) {
    if (trigger in TRIGGERS) continue;
    const other = fns.get(fnName);
    if (!other) problems.push(`trigger ${trigger} on food_items runs ${fnName}, which this guard cannot read`);
    else if (/\bNEW\s*\.\s*"?(?:id|created_by_user_id)"?\s*:?=|\bINTO\s+(?:STRICT\s+)?NEW\b|\bNEW\s*:?=(?!=)/i.test(other.text)) {
      problems.push(`trigger ${trigger} on food_items can assign NEW.id or NEW.created_by_user_id`);
    }
  }

  // A rule rewrites a write before any trigger sees it; a rename moves the
  // triggers off the table the policies name.
  if (new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?RULE[^;]*\bTO\s+${QUAL('food_items')}\b`, 'i').test(sql)) problems.push('a rule rewrites writes to food_items');
  if (new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUAL('food_items')}\s+RENAME\s+TO\b`, 'i').test(sql)) problems.push('food_items is renamed');

  // The functions read storage.objects as their owner; an owner that does not
  // bypass RLS sees nothing and passes every claim, silently (review F1). The
  // file refuses such a role before it creates anything.
  const assertAt = sql.search(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_catalog\.pg_roles\s+WHERE\s+rolname\s*=\s*current_user\s+AND\s*\(\s*rolsuper\s+OR\s+rolbypassrls\s*\)\s*\)\s*THEN\s+RAISE\s+EXCEPTION/i);
  const ledgerAt = sql.search(new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${QUAL(LEDGER)}\s*\(`, 'i'));
  if (assertAt === -1 || (ledgerAt !== -1 && assertAt > ledgerAt)) problems.push('no RLS-bypass assertion before the ledger');

  // The ledger: server-only, for good.
  const table = QUAL(LEDGER);
  const created = sql.search(new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${table}\s*\(`, 'i'));
  if (created === -1) {
    problems.push('no ledger table');
    return problems;
  }
  const rest = sql.slice(created);
  const rlsToggles = [...rest.matchAll(new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${table}\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY`, 'gi'))];
  if (rlsToggles.length === 0 || rlsToggles[rlsToggles.length - 1][1].toUpperCase() !== 'ENABLE') problems.push('the ledger does not end with RLS enabled');
  if (new RegExp(String.raw`CREATE\s+POLICY[^;]*\bON\s+${table}\b`, 'i').test(rest)) problems.push('a policy opens the ledger');
  if (new RegExp(String.raw`\bGRANT\s[^;]*\bON\s+(?:TABLE\s+)?${table}\s[^;]*\bTO\s[^;]*\b(?:anon|authenticated|public)\b`, 'i').test(rest)) {
    problems.push('the ledger is granted to a client role');
  }
  if (new RegExp(String.raw`DROP\s+TABLE[^;]*\b${LEDGER}\b`, 'i').test(rest)) problems.push('the ledger is dropped');
  const revoked = (role: string): boolean =>
    new RegExp(String.raw`REVOKE\s+ALL\s+ON\s+(?:TABLE\s+)?${table}\s+FROM\s+(?:[\w\s,]*\b)?${role}\b`, 'i').test(rest);
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
    if (!revoked(role)) problems.push(`the ledger's default grant to ${role} is not revoked`);
  }
  return problems;
}

describe("a food's id can never be claimed again (CUL-2044, migration 106)", () => {
  const sql = allMigrations();
  const body106 = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, '106_food_item_ids_never_reused.sql'), 'utf8'));
  const add = (later: string): string[] => guardProblems(`${body106}\n${later}`);
  const PINNED_SOURCE = {
    guard: (body106.match(/CREATE OR REPLACE FUNCTION public\.guard_food_item_id\(\)[\s\S]*?\$\$;/) ?? [''])[0],
  };
  const mutate = (from: string | RegExp, to: string): string[] => {
    const m = body106.replace(from, () => to); // a function, so `$$` in `to` stays literal
    expect(m).not.toBe(body106); // the mutant applied
    return guardProblems(m);
  };

  it('the live triggers, functions and ledger hold', () => {
    expect(guardProblems(sql)).toEqual([]);
  });

  it('pins both definitions: any edit to either function reds', () => {
    const guardPinned = [expect.stringMatching(/live guard_food_item_id is not the pinned/)];
    const retirePinned = [expect.stringMatching(/live retire_food_item_id is not the pinned/)];
    // Each arm of the insert check, removed.
    expect(mutate(/f\.created_by_user_id IS DISTINCT FROM NEW\.created_by_user_id\)/, 'FALSE)')).toEqual(guardPinned);
    expect(mutate(/r\.owner_id IS DISTINCT FROM NEW\.created_by_user_id\)/, 'FALSE)')).toEqual(guardPinned);
    expect(mutate(/AND coalesce\(o\.owner_id, o\.owner::text\) IS DISTINCT FROM NEW\.created_by_user_id::text\)/, ')')).toEqual(guardPinned);
    // The caller check removed (review F3: naming another owner was an oracle).
    expect(mutate(/\(auth\.uid\(\) IS NOT NULL AND NEW\.created_by_user_id IS DISTINCT FROM auth\.uid\(\)\)\n\s*OR /, '')).toEqual(guardPinned);
    // A NULL ledger owner read as "anyone may".
    expect(mutate(/r\.owner_id IS DISTINCT FROM NEW\.created_by_user_id/, 'r.owner_id <> NEW.created_by_user_id')).toEqual(guardPinned);
    // The update arm loses the owner, or the id.
    expect(mutate(/\n\s*OR NEW\.created_by_user_id IS DISTINCT FROM OLD\.created_by_user_id/, '')).toEqual(guardPinned);
    expect(mutate(/IF NEW\.id IS DISTINCT FROM OLD\.id/, 'IF FALSE')).toEqual(guardPinned);
    // An exemption for a role, an early return, a message carrying a value (C-31).
    expect(mutate(/BEGIN\n  IF TG_OP = 'UPDATE'/, "BEGIN\n  IF current_user = 'service_role' THEN RETURN NEW; END IF;\n  IF TG_OP = 'UPDATE'")).toEqual(guardPinned);
    expect(mutate(/'A food''s id and owner cannot change'\n\s*USING ERRCODE = '23514';\n  END IF;\n  RETURN NEW;\nEND;/, "'id % is taken', NEW.id USING ERRCODE = '23514';\n  END IF;\n  RETURN NEW;\nEND;")).toEqual(guardPinned);
    // INVOKER would let RLS hide another account's row from the lookup.
    expect(mutate(/SECURITY DEFINER\nSET search_path = pg_catalog, pg_temp\nAS \$\$\nBEGIN/, 'SECURITY INVOKER\nSET search_path = pg_catalog, pg_temp\nAS $$\nBEGIN')).toEqual(guardPinned);
    // The retire stops recording, or keeps a dead account's owner.
    expect(mutate(/INSERT INTO public\.food_item_retired_ids AS r/, 'INSERT INTO public.food_items_unused AS r')).toEqual(retirePinned);
    expect(mutate(/SELECT u\.id INTO owner FROM auth\.users u WHERE u\.id = OLD\.created_by_user_id;/, 'owner := OLD.created_by_user_id;')).toEqual(retirePinned);
    expect(mutate(/ON CONFLICT \(id\) DO UPDATE SET owner_id = NULL\n\s*WHERE r\.owner_id IS DISTINCT FROM excluded\.owner_id;/, 'ON CONFLICT (id) DO NOTHING;')).toEqual(retirePinned);
    // A later, lowercase redefinition is the live one.
    const lower = `create or replace function public.guard_food_item_id() returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$ begin return new; end; $$;`;
    expect(add(lower)).toEqual(expect.arrayContaining(guardPinned));
  });

  it('reds on a later migration that alters, drops, renames or disables a trigger or function', () => {
    expect(add('ALTER FUNCTION public.guard_food_item_id() SECURITY INVOKER;')).toEqual([expect.stringMatching(/ALTER FUNCTION\/ROUTINE changes guard_food_item_id/)]);
    expect(add("alter routine \"public\".\"retire_food_item_id\"() set search_path = public;")).toEqual([expect.stringMatching(/ALTER FUNCTION\/ROUTINE changes retire_food_item_id/)]);
    expect(add('DROP FUNCTION public.retire_food_item_id() CASCADE;')).toEqual([expect.stringMatching(/retire_food_item_id is dropped/)]);
    expect(add('DROP TRIGGER IF EXISTS trg_food_items_guard_id ON public.food_items;')).toEqual([expect.stringMatching(/guard_id is dropped/)]);
    expect(add('ALTER TRIGGER trg_food_items_retire_id ON public.food_items RENAME TO x;')).toEqual([expect.stringMatching(/retire_id is renamed/)]);
    for (const off of [
      'ALTER TABLE public.food_items DISABLE TRIGGER trg_food_items_guard_id;',
      'ALTER TABLE IF EXISTS public."food_items" DISABLE TRIGGER "trg_food_items_guard_id";',
      'ALTER TABLE public.food_items ENABLE REPLICA TRIGGER trg_food_items_guard_id;',
      'ALTER TABLE public.food_items ADD COLUMN zz int, DISABLE TRIGGER trg_food_items_guard_id;',
    ]) {
      expect(add(off)).toEqual([expect.stringMatching(/guard_id is disabled/)]);
    }
    expect(add('alter table only food_items disable trigger all;')).toEqual([
      expect.stringMatching(/guard_id is disabled/),
      expect.stringMatching(/retire_id is disabled/),
    ]);
    expect(add('ALTER TABLE food_items DISABLE TRIGGER USER; ALTER TABLE food_items ENABLE TRIGGER USER;')).toEqual([]);
    // A later CREATE OR REPLACE in another shape, or with a WHEN, is the live one
    // (review F2a; the first version of this file was green on both).
    expect(add('CREATE OR REPLACE TRIGGER trg_food_items_guard_id BEFORE UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION public.guard_food_item_id();')).toEqual([
      expect.stringMatching(/no trg_food_items_guard_id/),
    ]);
    expect(add('CREATE OR REPLACE TRIGGER trg_food_items_guard_id BEFORE INSERT OR UPDATE ON public.food_items FOR EACH ROW WHEN (false) EXECUTE FUNCTION public.guard_food_item_id();')).toEqual([
      expect.stringMatching(/no trg_food_items_guard_id/),
    ]);
    expect(add('create or replace trigger "trg_food_items_retire_id" after delete on public.food_items for each statement execute function public.retire_food_item_id();')).toEqual([
      expect.stringMatching(/no trg_food_items_retire_id/),
    ]);
    expect(add('CREATE RULE r AS ON INSERT TO public.food_items DO INSTEAD NOTHING;')).toEqual([expect.stringMatching(/rule rewrites/)]);
    expect(add('ALTER TABLE public.food_items RENAME TO food_items_old;')).toEqual([expect.stringMatching(/renamed/)]);
    // A trigger recreated in the wrong shape (UPDATE only) no longer guards inserts.
    expect(mutate(/BEFORE INSERT OR UPDATE ON public\.food_items/, 'BEFORE UPDATE ON public.food_items')).toEqual([
      expect.stringMatching(/no trg_food_items_guard_id/),
    ]);
  });

  it('reds on another trigger on food_items that can move an id or an owner', () => {
    const fnDef = (name: string, body: string): string =>
      `CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} RETURN NEW; END; $$;`;
    const trg = (fn: string): string => `CREATE TRIGGER zz BEFORE INSERT ON public.food_items FOR EACH ROW EXECUTE FUNCTION ${fn}();`;
    const assigns = [expect.stringMatching(/zz on food_items can assign/)];
    expect(add(`${fnDef('public.zz', "NEW.id := '00000000-0000-0000-0000-000000000001';")}\n${trg('public.zz')}`)).toEqual(assigns);
    expect(add(`${fnDef('public.zz', 'NEW.created_by_user_id = auth.uid();')}\n${trg('public.zz')}`)).toEqual(assigns);
    expect(add(`${fnDef('public.zz', "NEW := jsonb_populate_record(NEW, '{}'::jsonb);")}\n${trg('public.zz')}`)).toEqual(assigns);
    expect(add(`${fnDef('public.zz', 'SELECT gen_random_uuid() INTO NEW.id;')}\n${trg('public.zz')}`)).toEqual(assigns);
    // Review F2b / F2c: whole-row assignment with `=`, and INTO STRICT.
    expect(add(`${fnDef('public.zz', "NEW = jsonb_populate_record(NEW, jsonb_build_object('id', gen_random_uuid()));")}\n${trg('public.zz')}`)).toEqual(assigns);
    expect(add(`${fnDef('public.zz', 'SELECT f.* INTO STRICT NEW FROM public.food_items f LIMIT 1;')}\n${trg('public.zz')}`)).toEqual(assigns);
    // A comparison is not an assignment.
    expect(add(`${fnDef('public.zz', "IF NEW.brand = 'x' THEN NULL; END IF;")}\n${trg('public.zz')}`)).toEqual([]);
    expect(add(trg('public.not_defined_here'))).toEqual([expect.stringMatching(/cannot read/)]);
    // Non-vacuity: the scan reads the shipped neighbour (001's updated_at), resolves
    // its function, and passes it.
    expect(foodItemTriggers(sql)).toEqual(
      expect.arrayContaining([
        ['trg_food_items_updated_at', 'set_updated_at'],
        ['trg_food_items_guard_id', 'guard_food_item_id'],
        ['trg_food_items_retire_id', 'retire_food_item_id'],
      ]),
    );
  });

  it('reds when either function is left callable by a client', () => {
    expect(mutate(/REVOKE ALL ON FUNCTION public\.guard_food_item_id\(\) FROM authenticated;/, '')).toEqual([
      expect.stringMatching(/guard_food_item_id: EXECUTE is not revoked from authenticated/),
    ]);
    expect(mutate(/REVOKE ALL ON FUNCTION public\.retire_food_item_id\(\) FROM anon;/, '')).toEqual([
      expect.stringMatching(/retire_food_item_id: EXECUTE is not revoked from anon/),
    ]);
    expect(add('GRANT EXECUTE ON FUNCTION public.guard_food_item_id() TO authenticated;')).toEqual([
      expect.stringMatching(/guard_food_item_id: EXECUTE is granted to a client/),
    ]);
    // Fail closed: the revokes must follow the LIVE definition. CREATE OR REPLACE
    // keeps grants, but a DROP and CREATE hands EXECUTE back to every role, and
    // this file does not tell the two apart.
    expect(add(`${PINNED_SOURCE.guard}`)).toEqual([
      expect.stringMatching(/guard_food_item_id: EXECUTE is not revoked from PUBLIC/),
      expect.stringMatching(/guard_food_item_id: EXECUTE is not revoked from anon/),
      expect.stringMatching(/guard_food_item_id: EXECUTE is not revoked from authenticated/),
    ]);
  });

  it('reds when the RLS-bypass assertion is removed or comes after the ledger', () => {
    const assertion = /DO \$\$\nBEGIN\n  IF NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_roles[\s\S]*?END \$\$;\n/;
    expect(mutate(assertion, '')).toEqual([expect.stringMatching(/no RLS-bypass assertion/)]);
    expect(mutate(/rolsuper OR rolbypassrls/, 'rolsuper OR true')).toEqual([expect.stringMatching(/no RLS-bypass assertion/)]);
    const moved = body106.replace(assertion, '');
    expect(moved).not.toBe(body106);
    const block = (body106.match(assertion) ?? [''])[0];
    expect(guardProblems(`${moved}\n${block}`)).toEqual([expect.stringMatching(/no RLS-bypass assertion/)]);
  });

  it('reds when the ledger is opened to a client or loses RLS', () => {
    expect(add('ALTER TABLE public.food_item_retired_ids DISABLE ROW LEVEL SECURITY;')).toEqual([expect.stringMatching(/RLS enabled/)]);
    expect(add('CREATE POLICY "read" ON public.food_item_retired_ids FOR SELECT USING (true);')).toEqual([expect.stringMatching(/policy opens/)]);
    expect(add('GRANT SELECT ON public.food_item_retired_ids TO authenticated;')).toEqual([expect.stringMatching(/granted to a client/)]);
    expect(add('grant all on table food_item_retired_ids to anon, service_role;')).toEqual([expect.stringMatching(/granted to a client/)]);
    expect(add('DROP TABLE public.food_item_retired_ids;')).toEqual([expect.stringMatching(/ledger is dropped/)]);
    expect(mutate(/REVOKE ALL ON TABLE public\.food_item_retired_ids FROM authenticated;/, '')).toEqual([
      expect.stringMatching(/default grant to authenticated is not revoked/),
    ]);
    expect(mutate(/ALTER TABLE public\.food_item_retired_ids ENABLE ROW LEVEL SECURITY;/, '')).toEqual([expect.stringMatching(/RLS enabled/)]);
    // A grant to the server is not a client grant.
    expect(add('GRANT SELECT ON public.food_item_retired_ids TO service_role;')).toEqual([]);
  });
});
