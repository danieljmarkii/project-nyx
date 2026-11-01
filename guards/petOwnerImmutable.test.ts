import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-2337 (migration 115): a pet's owner never changes. 113 binds a saved vet
// report's maker to its pet's owner when the row is written; a pet whose
// user_id moved left the old account named on its reports, and that account's
// deletion cascaded them away (rls-privacy-reviewer F5 on 113, measured as the
// service role). Every pet-keyed RLS and Storage policy and delete-account's
// sweep read the same column. 115's trigger refuses a changed user_id for
// every role; this file pins the live definition (the LAST in filename order)
// by its exact text, so an edit to the function, or an ALTER, DROP, DISABLE or
// rename that switches the trigger off, reds here. Proven on a PG16 replay
// (scripts/probes/vet-report-115/) with the migration and without it.
//
// Every check is a pure function over text, driven against the repository AND
// against mutants below, so a check that cannot fail is caught here (C-18).
//
// STATED BLIND SPOTS (the petServerId.test.ts set, which this file shares):
//   · Text, not a database: a definition that parses here and fails to apply is
//     caught only by the replay. The replay is the PR's, not CI's.
//   · Dynamic SQL (`EXECUTE format('ALTER TABLE %I …')`) is not read.
//   · A function body in single quotes rather than dollar quotes is not read.
//   · BEFORE triggers fire in name order. One that assigns NEW.user_id and
//     fires BEFORE this one is caught (this one compares NEW to OLD at its own
//     turn); one that fires AFTER it would move the owner unseen. So no other
//     trigger on pets may assign NEW.user_id at all (checked below, fail
//     closed on a function this file cannot read).
//   · A superuser can disable the trigger or set session_replication_role;
//     that is the server, not a client.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const ID = String.raw`(?:"?\w+"?\s*\.\s*)?"?(\w+)"?`;
const QUAL = (name: string): string => String.raw`(?:"?\w+"?\s*\.\s*)?"?${name}"?`;

const LIVE_DEFINITION = squash(`
CREATE OR REPLACE FUNCTION public.enforce_pet_owner_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A pet''s owner cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;`);

function allMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n');
}

function liveFunctions(sql: string): Map<string, { text: string; index: number }> {
  const out = new Map<string, { text: string; index: number }>();
  const re = new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+${ID}\s*\([\s\S]*?\$(\w*)\$[\s\S]*?\$\2\$[^;]*;`, 'gi');
  for (const m of sql.matchAll(re)) out.set(m[1].toLowerCase(), { text: m[0], index: m.index ?? 0 });
  return out;
}

function petTriggers(sql: string): Array<[string, string]> {
  const re = new RegExp(
    String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?(\w+)"?[^;]*?\bON\s+(?:ONLY\s+)?${QUAL('pets')}\s[^;]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+${ID}\s*\(`,
    'gi',
  );
  return [...sql.matchAll(re)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]);
}

/** The problems with the live owner trigger, read from every migration in order. Empty when it holds. */
export function ownerTriggerProblems(sql: string): string[] {
  const problems: string[] = [];
  const fns = liveFunctions(sql);
  const live = fns.get('enforce_pet_owner_immutable');
  if (!live) return ['no definition of enforce_pet_owner_immutable'];
  if (squash(live.text) !== LIVE_DEFINITION) problems.push('the live enforce_pet_owner_immutable is not the pinned definition');

  const fn = QUAL('enforce_pet_owner_immutable');
  if (new RegExp(String.raw`ALTER\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s+${fn}`, 'i').test(sql)) {
    problems.push('an ALTER FUNCTION/ROUTINE changes enforce_pet_owner_immutable');
  }
  if (new RegExp(String.raw`DROP\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s[^;]*\benforce_pet_owner_immutable\b`, 'i').test(sql.slice(live.index))) {
    problems.push('the function is dropped after its live definition');
  }

  // A plain BEFORE UPDATE, never `UPDATE OF user_id`, so an ON CONFLICT DO
  // UPDATE whose SET list names other columns is still judged.
  const creates = [
    ...sql.matchAll(new RegExp(String.raw`CREATE\s+TRIGGER\s+trg_pets_owner_immutable\s+BEFORE\s+UPDATE\s+ON\s+${QUAL('pets')}\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+${fn}\s*\(\s*\)\s*;`, 'gi')),
  ];
  if (creates.length === 0) {
    problems.push('no BEFORE UPDATE trigger trg_pets_owner_immutable on pets');
    return problems;
  }
  const after = sql.slice(creates[creates.length - 1].index ?? 0);
  if (/DROP\s+TRIGGER[^;]*\btrg_pets_owner_immutable\b/i.test(after)) problems.push('the trigger is dropped after its last creation');
  if (/ALTER\s+TRIGGER\s+"?trg_pets_owner_immutable"?/i.test(after)) problems.push('the trigger is renamed or altered after its last creation');
  const toggles: string[] = [];
  const alters = new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUAL('pets')}\s[^;]*;`, 'gi');
  for (const stmt of after.matchAll(alters)) {
    for (const t of stmt[0].matchAll(/\b(DISABLE|ENABLE(?:\s+(?:REPLICA|ALWAYS))?)\s+TRIGGER\s+(?:"?trg_pets_owner_immutable"?|ALL|USER)(?![\w"])/gi)) {
      toggles.push(squash(t[1]).toUpperCase());
    }
  }
  const last = toggles.length ? toggles[toggles.length - 1] : 'ENABLE';
  if (last === 'DISABLE' || last === 'ENABLE REPLICA') problems.push('a trigger on pets is disabled after the last creation');

  // Any other trigger on pets that assigns NEW.user_id (or NEW wholesale) could
  // move the owner after this one ran. Fail closed on a function not read here.
  for (const [trigger, fnName] of petTriggers(sql)) {
    if (trigger === 'trg_pets_owner_immutable') continue;
    const other = fns.get(fnName);
    if (!other) problems.push(`trigger ${trigger} on pets runs ${fnName}, which this guard cannot read`);
    else if (/\bNEW\s*\.\s*"?user_id"?\s*:?=|\bINTO\s+NEW\b|\bNEW\s*:=/i.test(other.text)) {
      problems.push(`trigger ${trigger} on pets can assign NEW.user_id`);
    }
  }
  return problems;
}

describe("a pet's owner never changes (CUL-2337, migration 115)", () => {
  const sql = allMigrations();
  const body115 = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, '115_pets_owner_immutable.sql'), 'utf8'));
  const add = (later: string): string[] => ownerTriggerProblems(`${body115}\n${later}`);

  it('the live trigger refuses any change to pets.user_id', () => {
    expect(ownerTriggerProblems(sql)).toEqual([]);
  });

  it('pins the definition: any edit to the function reds', () => {
    const mutate = (from: string | RegExp, to: string): string[] => {
      const m = body115.replace(from, to);
      expect(m).not.toBe(body115); // the mutant applied
      return ownerTriggerProblems(m);
    };
    const pinned = [expect.stringMatching(/not the pinned definition/)];
    expect(mutate(/IS DISTINCT FROM OLD\.user_id/, '<> OLD.user_id')).toEqual(pinned);
    expect(mutate(/IF NEW\.user_id IS DISTINCT FROM OLD\.user_id THEN/, "IF NEW.user_id IS DISTINCT FROM OLD.user_id AND current_user <> 'service_role' THEN")).toEqual(pinned);
    expect(mutate("'A pet''s owner cannot change'", "'owner % cannot change', OLD.user_id")).toEqual(pinned);
    expect(mutate(/SECURITY INVOKER/, 'SECURITY DEFINER')).toEqual(pinned);
    expect(mutate("SET search_path = ''\n", "SET search_path = public\n")).toEqual(pinned);
    expect(mutate(/BEGIN\n  IF NEW/, 'BEGIN\n  RETURN NEW;\n  IF NEW')).toEqual(pinned);
    const lower = `create or replace function public.enforce_pet_owner_immutable() returns trigger language plpgsql security invoker set search_path = '' as $$ begin return new; end; $$;`;
    expect(add(lower)).toEqual(pinned);
  });

  it('reds on a narrowed trigger: UPDATE OF other columns, or AFTER', () => {
    const narrowed = (from: RegExp, to: string): string[] => {
      const m = body115.replace(from, to);
      expect(m).not.toBe(body115);
      return ownerTriggerProblems(m);
    };
    const missing = [expect.stringMatching(/no BEFORE UPDATE trigger/)];
    expect(narrowed(/BEFORE UPDATE ON public\.pets/, 'BEFORE UPDATE OF weight_kg ON public.pets')).toEqual(missing);
    expect(narrowed(/BEFORE UPDATE ON public\.pets/, 'AFTER UPDATE ON public.pets')).toEqual(missing);
  });

  it('reds on a later migration that alters, drops, renames or disables it', () => {
    for (const alter of [
      'ALTER FUNCTION public.enforce_pet_owner_immutable() SECURITY DEFINER;',
      'alter routine "public"."enforce_pet_owner_immutable"() set search_path = public;',
    ]) {
      expect(add(alter)).toEqual([expect.stringMatching(/ALTER FUNCTION\/ROUTINE/)]);
    }
    expect(add('DROP FUNCTION public.enforce_pet_owner_immutable() CASCADE;')).toEqual([expect.stringMatching(/function is dropped/)]);
    expect(add('DROP TRIGGER IF EXISTS trg_pets_owner_immutable ON public.pets;')).toEqual([expect.stringMatching(/trigger is dropped/)]);
    expect(add('ALTER TRIGGER trg_pets_owner_immutable ON public.pets RENAME TO x;')).toEqual([expect.stringMatching(/renamed/)]);
    for (const off of [
      'ALTER TABLE public.pets DISABLE TRIGGER trg_pets_owner_immutable;',
      'ALTER TABLE public."pets" DISABLE TRIGGER "trg_pets_owner_immutable";',
      'alter table only pets disable trigger user;',
      'ALTER TABLE public.pets ENABLE REPLICA TRIGGER trg_pets_owner_immutable;',
    ]) {
      expect(add(off)).toEqual([expect.stringMatching(/disabled/)]);
    }
    expect(add('ALTER TABLE pets DISABLE TRIGGER ALL; ALTER TABLE pets ENABLE TRIGGER ALL;')).toEqual([]);
  });

  it('reds on another trigger on pets that can write user_id, and reads the shipped ones', () => {
    const fnDef = (body: string): string =>
      `CREATE OR REPLACE FUNCTION public.zz() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} RETURN NEW; END; $$;`;
    const trg = 'CREATE TRIGGER zz BEFORE UPDATE ON public.pets FOR EACH ROW EXECUTE FUNCTION public.zz();';
    const assigns = [expect.stringMatching(/zz on pets can assign NEW\.user_id/)];
    expect(add(`${fnDef("NEW.user_id := '00000000-0000-0000-0000-000000000001';")}\n${trg}`)).toEqual(assigns);
    expect(add(`${fnDef("NEW := jsonb_populate_record(NEW, '{}'::jsonb);")}\n${trg}`)).toEqual(assigns);
    expect(add(`${fnDef('SELECT x INTO NEW FROM y;')}\n${trg}`)).toEqual(assigns);
    expect(add('CREATE TRIGGER zz BEFORE UPDATE ON public.pets FOR EACH ROW EXECUTE FUNCTION public.not_here();')).toEqual([
      expect.stringMatching(/cannot read/),
    ]);
    // Non-vacuity: the scan reads every shipped trigger on pets and passes them.
    expect(petTriggers(sql)).toEqual(
      expect.arrayContaining([
        ['trg_pets_updated_at', 'set_updated_at'],
        ['trg_pets_preserve_displaced_weight', 'preserve_displaced_pet_weight'],
        ['trg_pets_server_id', 'enforce_pet_server_id'],
        ['trg_pets_owner_immutable', 'enforce_pet_owner_immutable'],
      ]),
    );
  });
});
