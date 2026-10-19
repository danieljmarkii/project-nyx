import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { blankComments } from './blankComments';
import { stripSqlComments } from './sqlComments';

// CUL-2029 (migration 104): a pet's id is always the server's. Every pet-keyed
// Storage policy admits a caller to `{petId}/…` when that id is one of their pets,
// so an account that could CHOOSE a pet id (insert with a client id, or update a
// childless pet's id) claimed a dead pet's leftover files. 104's trigger replaces
// every client-inserted id and refuses any change to one. Proven on a PG16 replay
// of 001-104 with every attack driven against the trigger on and off, and attacked
// twice by the rls-privacy-reviewer (the PR records both). This file pins the live
// definition (the LAST in filename order) by its exact text, so any later edit to
// the function, or an ALTER, DROP, DISABLE or competing trigger that reopens the
// claim, reds here; and it pins the client side: no app insert or upsert of
// `pets` sends an id.
//
// Every check is a pure function over text, driven against the repository AND
// against a mutant below, so a check that cannot fail is caught here (C-18). The
// mutants include every reopening the two review passes kept green on a draft.
//
// STATED BLIND SPOTS:
//   · Text, not a database: a definition that parses here and fails to apply is
//     caught only by the replay. The replay is the PR's, not CI's.
//   · Dynamic SQL (`EXECUTE format('ALTER TABLE %I …')`) is not read.
//   · A function body in single quotes rather than dollar quotes is not read as a
//     definition, so a redefinition written that way is invisible.
//   · The client scan reads `.from('pets')` chains literally; `supabase['from']`
//     or a table name built at runtime is not read. Its payload check fails closed
//     on a spread, a computed key or a non-literal payload rather than passing it.
//     The trigger binds every client write anyway; this half catches intent.
//   · A superuser can disable the trigger; that is the server, not a client.

const REPO_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

// The live definition, exactly. A change to the function is a change to this
// constant, made on purpose in the PR that makes it, with its own replay.
const LIVE_DEFINITION = squash(`
CREATE OR REPLACE FUNCTION public.enforce_pet_server_id()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE claims text; legacy_role text; server_write boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    claims := nullif(current_setting('request.jwt.claims', true), '');
    legacy_role := nullif(current_setting('request.jwt.claim.role', true), '');
    server_write := current_user IN ('postgres', 'supabase_admin', 'service_role')
      AND ((claims IS NULL AND legacy_role IS NULL)
           OR coalesce(claims::jsonb ->> 'role', legacy_role, '') = 'service_role');
    IF NOT server_write THEN NEW.id := gen_random_uuid(); END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'A pet''s id cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;`);

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

/** Every trigger created on pets, as [trigger, function], lower-cased and unqualified. */
export function petTriggers(sql: string): Array<[string, string]> {
  const re = new RegExp(
    String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?(\w+)"?[^;]*?\bON\s+(?:ONLY\s+)?${QUAL('pets')}\s[^;]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+${ID}\s*\(`,
    'gi',
  );
  return [...sql.matchAll(re)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]);
}

/** The problems with the live trigger, read from every migration in order. Empty when it holds. */
export function triggerProblems(sql: string): string[] {
  const problems: string[] = [];
  const fns = liveFunctions(sql);
  const live = fns.get('enforce_pet_server_id');
  if (!live) return ['no definition of enforce_pet_server_id'];
  if (squash(live.text) !== LIVE_DEFINITION) problems.push('the live enforce_pet_server_id is not the pinned definition');

  const fn = QUAL('enforce_pet_server_id');
  if (new RegExp(String.raw`ALTER\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s+${fn}`, 'i').test(sql)) {
    problems.push('an ALTER FUNCTION/ROUTINE changes enforce_pet_server_id');
  }
  if (new RegExp(String.raw`DROP\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s[^;]*\benforce_pet_server_id\b`, 'i').test(sql.slice(live.index))) {
    problems.push('the function is dropped after its live definition');
  }

  // The trigger: created on pets for INSERT and UPDATE, and never dropped,
  // renamed or disabled after its last creation.
  const creates = [
    ...sql.matchAll(new RegExp(String.raw`CREATE\s+TRIGGER\s+trg_pets_server_id\s+BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+${QUAL('pets')}\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+${fn}\s*\(\s*\)\s*;`, 'gi')),
  ];
  if (creates.length === 0) {
    problems.push('no BEFORE INSERT OR UPDATE trigger trg_pets_server_id on pets');
    return problems;
  }
  const after = sql.slice(creates[creates.length - 1].index ?? 0);
  if (/DROP\s+TRIGGER[^;]*\btrg_pets_server_id\b/i.test(after)) problems.push('the trigger is dropped after its last creation');
  if (/ALTER\s+TRIGGER\s+"?trg_pets_server_id"?/i.test(after)) problems.push('the trigger is renamed or altered after its last creation');
  // Every subcommand of every ALTER TABLE on pets, in order; the last toggle wins.
  // `ENABLE REPLICA` fires only in replica sessions, so it switches the trigger off
  // for every client as surely as DISABLE does.
  const toggles: string[] = [];
  const alters = new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUAL('pets')}\s[^;]*;`, 'gi');
  for (const stmt of after.matchAll(alters)) {
    for (const t of stmt[0].matchAll(/\b(DISABLE|ENABLE(?:\s+(?:REPLICA|ALWAYS))?)\s+TRIGGER\s+(?:"?trg_pets_server_id"?|ALL|USER)(?![\w"])/gi)) {
      toggles.push(squash(t[1]).toUpperCase());
    }
  }
  const last = toggles.length ? toggles[toggles.length - 1] : 'ENABLE';
  if (last === 'DISABLE' || last === 'ENABLE REPLICA') problems.push('a trigger on pets is disabled after the last creation');

  // Any OTHER trigger on pets runs beside 104's and could put a chosen id back.
  // Fail closed: a function this file cannot read counts as one that might.
  for (const [trigger, fnName] of petTriggers(sql)) {
    if (trigger === 'trg_pets_server_id') continue;
    const other = fns.get(fnName);
    if (!other) problems.push(`trigger ${trigger} on pets runs ${fnName}, which this guard cannot read`);
    else if (/\bNEW\s*(?:\.\s*"?id"?\s*)?:?=|\bINTO\s+NEW\b|\bNEW\s*:=/i.test(other.text)) {
      problems.push(`trigger ${trigger} on pets can assign NEW.id`);
    }
  }
  return problems;
}

/** Every `.from('pets')` insert or upsert in a source text whose payload can carry an id. */
export function clientIdWrites(source: string): string[] {
  const src = blankComments(source);
  const hits: string[] = [];
  for (const m of src.matchAll(/\.from\s*(?:<[^>]*>)?\(\s*['"`]pets['"`]\s*\)\s*\.(insert|upsert)\(\s*/g)) {
    const start = (m.index ?? 0) + m[0].length;
    // The payload: from the call's open paren to its matching close.
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === '(' || src[i] === '{' || src[i] === '[') depth++;
      else if (src[i] === ')' || src[i] === '}' || src[i] === ']') depth--;
      i++;
    }
    const payload = src.slice(start, i - 1);
    // Fail closed: a payload that is not a literal object (a variable, a spread,
    // a computed key) cannot be read, so it counts as one that may carry an id.
    if (
      !/^\s*[{[]/.test(payload) ||
      /\.\.\./.test(payload) ||
      /[{,]\s*\[/.test(payload) ||
      /(?:^|[{,\s])['"`]?id['"`]?\s*[:,}]/.test(payload)
    ) {
      hits.push(`${m[1]}(${squash(payload).slice(0, 80)})`);
    }
  }
  return hits;
}

/** Client source files, derived from the repository rather than a list of directories (C-38). */
function clientSources(): string[] {
  const skip = new Set(['node_modules', 'supabase', 'scripts', 'guards', 'docs', 'ios', 'android', 'widgets']);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (dir === REPO_ROOT && skip.has(name)) continue;
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(REPO_ROOT);
  return out;
}

describe("a pet id is always the server's (CUL-2029, migration 104)", () => {
  const sql = allMigrations();
  const body104 = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, '104_pets_server_id.sql'), 'utf8'));
  const add = (later: string): string[] => triggerProblems(`${body104}\n${later}`);

  it('the live trigger replaces every client id and refuses any change', () => {
    expect(triggerProblems(sql)).toEqual([]);
  });

  it('pins the definition: any edit to the function reds', () => {
    const mutate = (from: string | RegExp, to: string): string[] => {
      const m = body104.replace(from, to);
      expect(m).not.toBe(body104); // the mutant applied
      return triggerProblems(m);
    };
    const pinned = [expect.stringMatching(/not the pinned definition/)];
    expect(mutate("'service_role')\n", "'service_role', 'authenticated')\n")).toEqual(pinned);
    expect(mutate(/NEW\.id := gen_random_uuid\(\);/, 'NULL;')).toEqual(pinned);
    expect(mutate(/ELSIF NEW\.id IS DISTINCT FROM OLD\.id/, 'ELSIF FALSE')).toEqual(pinned);
    expect(mutate("'A pet''s id cannot change'", "'id % cannot change', NEW.id")).toEqual(pinned);
    expect(mutate(/SECURITY INVOKER/, 'SECURITY DEFINER')).toEqual(pinned);
    expect(mutate(/OR coalesce\(claims::jsonb ->> 'role', legacy_role, ''\) = 'service_role'/, "OR claims::jsonb ->> 'role' IS NULL")).toEqual(pinned);
    // Review pass 2: an early return, and a search_path that lets a planted
    // public.gen_random_uuid() win.
    expect(mutate(/BEGIN\n  IF TG_OP/, "BEGIN\n  IF TG_OP = 'INSERT' AND NEW.id IS NOT NULL THEN RETURN NEW; END IF;\n  IF TG_OP")).toEqual(pinned);
    expect(mutate("SET search_path = ''\n", "SET search_path = '', public, pg_catalog\n")).toEqual(pinned);
    // A later, lowercase redefinition is the live one.
    const lower = `create or replace function public.enforce_pet_server_id() returns trigger language plpgsql security invoker set search_path = '' as $$ begin return new; end; $$;`;
    expect(add(lower)).toEqual(pinned);
  });

  it('reds on a later migration that alters, drops, renames or disables it', () => {
    for (const alter of [
      'ALTER FUNCTION public.enforce_pet_server_id() SECURITY DEFINER;',
      'alter function "public"."enforce_pet_server_id"() security definer;',
      "ALTER ROUTINE public.enforce_pet_server_id() SET request.jwt.claims = '{}';",
    ]) {
      expect(add(alter)).toEqual([expect.stringMatching(/ALTER FUNCTION\/ROUTINE/)]);
    }
    expect(add('DROP ROUTINE public.enforce_pet_server_id() CASCADE;')).toEqual([expect.stringMatching(/function is dropped/)]);
    expect(add('DROP TRIGGER IF EXISTS trg_pets_server_id ON public.pets;')).toEqual([expect.stringMatching(/trigger is dropped/)]);
    expect(add('ALTER TRIGGER trg_pets_server_id ON public.pets RENAME TO x; DROP TRIGGER x ON public.pets;')).toEqual([
      expect.stringMatching(/renamed/),
    ]);
    for (const off of [
      'ALTER TABLE public.pets DISABLE TRIGGER trg_pets_server_id;',
      'ALTER TABLE IF EXISTS public.pets DISABLE TRIGGER trg_pets_server_id;',
      'ALTER TABLE public."pets" DISABLE TRIGGER "trg_pets_server_id";',
      'alter table only pets disable trigger all;',
      'ALTER TABLE public.pets ENABLE REPLICA TRIGGER trg_pets_server_id;',
      'ALTER TABLE public.pets ADD COLUMN zz int, DISABLE TRIGGER trg_pets_server_id;',
    ]) {
      expect(add(off)).toEqual([expect.stringMatching(/disabled/)]);
    }
    expect(add('ALTER TABLE pets DISABLE TRIGGER trg_pets_server_id; ALTER TABLE pets ENABLE TRIGGER trg_pets_server_id;')).toEqual([]);
  });

  it('reds on another trigger on pets that can put a chosen id back', () => {
    const competitor = (fnSql: string, trigger: string): string[] => add(`${fnSql}\n${trigger}`);
    const trg = (fn: string, on = 'public.pets'): string => `CREATE TRIGGER zz BEFORE INSERT ON ${on} FOR EACH ROW EXECUTE FUNCTION ${fn}();`;
    const fnDef = (name: string, body: string): string =>
      `CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} RETURN NEW; END; $$;`;
    const assigns = [expect.stringMatching(/zz on pets can assign NEW\.id/)];
    expect(competitor(fnDef('public.zz', "NEW.id := '00000000-0000-0000-0000-000000000001';"), trg('public.zz'))).toEqual(assigns);
    expect(competitor(fnDef('private.zz', "NEW.id := '00000000-0000-0000-0000-000000000001';"), trg('private.zz'))).toEqual(assigns);
    expect(competitor(fnDef('public.zz', "NEW := jsonb_populate_record(NEW, '{}'::jsonb);"), trg('public.zz'))).toEqual(assigns);
    expect(competitor(fnDef('public.zz', 'SELECT gen_random_uuid() INTO NEW.id;'), trg('public.zz'))).toEqual(assigns);
    expect(competitor(fnDef('public.zz', "NEW.id := '00000000-0000-0000-0000-000000000001';"), trg('public.zz', 'ONLY public.pets'))).toEqual(assigns);
    expect(add(trg('public.not_defined_here'))).toEqual([expect.stringMatching(/cannot read/)]);
    // Non-vacuity: the scan reads the shipped neighbours on pets (001's updated_at,
    // 072's displaced weight), resolves their functions, and passes them.
    expect(petTriggers(sql)).toEqual(
      expect.arrayContaining([
        ['trg_pets_updated_at', 'set_updated_at'],
        ['trg_pets_preserve_displaced_weight', 'preserve_displaced_pet_weight'],
        ['trg_pets_server_id', 'enforce_pet_server_id'],
      ]),
    );
  });

  it('no client insert or upsert of pets sends an id', () => {
    let writes = 0;
    const bad: string[] = [];
    for (const f of clientSources()) {
      const src = readFileSync(f, 'utf8');
      writes += [...blankComments(src).matchAll(/\.from\s*(?:<[^>]*>)?\(\s*['"`]pets['"`]\s*\)\s*\.(insert|upsert)\(/g)].length;
      for (const hit of clientIdWrites(src)) bad.push(`${relative(REPO_ROOT, f)}: ${hit}`);
    }
    expect(bad).toEqual([]);
    // Non-vacuity: the two pet creations (app/add-pet.tsx, app/onboarding/pet-name.tsx) are read.
    expect(writes).toBeGreaterThanOrEqual(2);
  });

  it('the client scan flags an id, a spread, a computed key and a variable payload, and passes the shipped shape', () => {
    const one = (payload: string): string[] => clientIdWrites(`supabase\n  .from('pets')\n  .insert(${payload})\n  .select();`);
    expect(one('{ user_id: user.id, name, species }')).toEqual([]);
    expect(one('{ user_id: user.id, name: name.trim(), species }')).toEqual([]);
    expect(one('{ id: petId, user_id: user.id, name }')).toHaveLength(1);
    expect(one('{ user_id: user.id, id }')).toHaveLength(1);
    expect(one('{ ...pet, name }')).toHaveLength(1);
    expect(one('row')).toHaveLength(1);
    expect(one('[{ "id": x }]')).toHaveLength(1);
    expect(one("{ ['id']: x, name }")).toHaveLength(1);
    expect(one('{ [ID_KEY]: x, name }')).toHaveLength(1);
    expect(one("{ ['i' + 'd']: x }")).toHaveLength(1);
    expect(clientIdWrites(`supabase.from('pets').upsert({ id: p.id, name })`)).toHaveLength(1);
    expect(clientIdWrites('supabase.from(`pets`).insert({ id: x, name })')).toHaveLength(1);
    expect(clientIdWrites(`supabase.from<Pet>('pets').insert({ id: x })`)).toHaveLength(1);
    expect(clientIdWrites(`supabase.from('pets') /* why */ .insert({ id: x })`)).toHaveLength(1);
    expect(clientIdWrites(`supabase.from('pets')\n  // why\n  .insert({ id: x })`)).toHaveLength(1);
    expect(clientIdWrites(`supabase.from('pets').update({ weight_kg }).eq('id', petId)`)).toEqual([]);
  });
});
