import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-2336 / CUL-2375 (migration 116): a pet leaves only with its account, and
// its id never comes back.
//   G1  001's `pets_owner` was FOR ALL, so a client could DELETE its own pet:
//       the rows cascaded away and the Storage objects stayed where account
//       deletion (which reads `pets`) could not reach them. 116 replaces it
//       with SELECT / INSERT / UPDATE policies and revokes DELETE and TRUNCATE
//       on pets from anon and authenticated.
//   G2  A server could delete a pet and re-insert its id under another
//       account, which then passed every pet-keyed Storage policy for the old
//       pet's folder. 116 reserves every pet id at insert in an append-only,
//       server-only ledger, so no pet is ever inserted under a used id again.
// This file reads every migration in filename order and reds when a later one
// gives a client DELETE back (a FOR ALL or FOR DELETE policy on pets, or a
// GRANT), or edits, drops, renames or disables the reservation, its trigger,
// the ledger or the ledger's append-only guard. Proven on a PG16 replay
// (scripts/probes/vet-report-116/) with the migration and without it.
//
// Every check is a pure function over text, driven against the repository AND
// against mutants below, so a check that cannot fail is caught here (C-18).
//
// STATED BLIND SPOTS (the petServerId / petOwnerImmutable set, shared):
//   · Text, not a database: a definition that parses here and fails to apply is
//     caught only by the replay, which is the PR's, not CI's.
//   · Dynamic SQL (`EXECUTE format(…)`) and single-quoted function bodies are
//     not read.
//   · A policy created as RESTRICTIVE, or with a role list (`TO service_role`),
//     is still judged by its command alone: a FOR ALL / FOR DELETE policy on
//     pets reds whoever it names. Over-strict on purpose; no such policy is
//     planned.
//   · Reds on (rls-privacy-reviewer pass 1, F1 / F3, each measured on the
//     replay to undo 116): ANY `ALTER TABLE pet_ids_retired` other than
//     enabling or forcing row level security (a dropped primary key, OWNER
//     TO, RENAME, a trigger toggle); any trigger on the ledger beyond its two
//     pinned ones (a BEFORE INSERT that rewrites the id); any rule on pets or
//     the ledger (a redirecting DO INSTEAD); a table that INHERITS or is a
//     PARTITION OF pets (its rows escape the parent's key and triggers);
//     `ALTER TABLE pets OWNER TO`; a policy name in quotes with spaces; and a
//     GRANT naming a list of tables.
//   · Owner-only DDL this file still does not read: `ALTER TABLE pets RENAME`,
//     `ALTER POLICY … RENAME` / `ALTER POLICY … USING`, an `ALTER TABLE … INHERIT
//     pets` on a table created elsewhere, and a DISABLE split by an inline
//     block comment. Each needs the table owner, i.e. a migration a reviewer
//     reads.
//   · A grant through a role the API roles are members of is not read.
//   · A superuser can disable triggers or set session_replication_role.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const ID = String.raw`(?:"?\w+"?\s*\.\s*)?"?(\w+)"?`;
const QUAL = (name: string): string => String.raw`(?:"?\w+"?\s*\.\s*)?"?${name}"?`;
const PUB = (name: string): string => String.raw`(?:"?public"?\s*\.\s*)?"?${name}"?`;
const CLIENT_ROLES = ['anon', 'authenticated'];
const ALL_API_ROLES = ['PUBLIC', 'anon', 'authenticated', 'service_role'];

const RESERVE_DEFINITION = squash(`
CREATE OR REPLACE FUNCTION public.reserve_pet_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  n bigint := 0;
BEGIN
  BEGIN
    INSERT INTO public.pet_ids_retired (id) VALUES (NEW.id);
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN unique_violation THEN
    n := 0;
  END;
  IF n <> 1 THEN
    RAISE EXCEPTION 'A pet needs an id never used before' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;`);

const APPEND_ONLY_DEFINITION = squash(`
CREATE OR REPLACE FUNCTION public.pet_ids_retired_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'pet_ids_retired: a pet id''s reservation is never changed or removed' USING ERRCODE = 'check_violation';
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

const roleNamed = (list: string, role: string): boolean =>
  new RegExp(String.raw`(?:^|[\s,"])${role}(?:$|[\s,";])`, 'i').test(list);

const OBJECT_NAME = /^(?:"?(\w+)"?\s*\.\s*)?"?(\w+)"?$/;

/**
 * Every table GRANT in `sql`, with the privileges, the public tables it names
 * (a list included: `ON public.pets, public.x`; `ALL TABLES IN SCHEMA public`
 * reads as '*') and the grantees. Grants on functions, schemas and sequences
 * are skipped.
 */
function tableGrants(sql: string): { privileges: string; tables: string[]; roles: string; index: number }[] {
  const out: { privileges: string; tables: string[]; roles: string; index: number }[] = [];
  for (const m of sql.matchAll(/\bGRANT\s+([^;]*?)\s+ON\s+([^;]*?)\s+TO\s+([^;]*);/gi)) {
    const target = m[2].trim();
    let tables: string[];
    if (/^ALL\s+TABLES\s+IN\s+SCHEMA\s+"?public"?$/i.test(target)) tables = ['*'];
    else if (/^(?:ALL\s+\w+\s+IN\s+SCHEMA|FUNCTION|PROCEDURE|ROUTINE|SCHEMA|SEQUENCE|DATABASE|LARGE|TYPE|DOMAIN|FOREIGN|LANGUAGE|TABLESPACE|PARAMETER)\b/i.test(target)) continue;
    else {
      tables = target
        .replace(/^TABLE\s+/i, '')
        .split(',')
        .map((t) => OBJECT_NAME.exec(t.trim()))
        .filter((x): x is RegExpExecArray => x !== null && (!x[1] || x[1].toLowerCase() === 'public'))
        .map((x) => x[2].toLowerCase());
    }
    out.push({ privileges: m[1], tables, roles: m[3], index: m.index ?? 0 });
  }
  return out;
}

const grantsTo = (roles: string, names: string[]): boolean => names.some((r) => roleNamed(roles, r));

/** G1: the problems with client DELETE on pets, read from every migration in order. Empty when it holds. */
export function petDeleteProblems(sql: string): string[] {
  const problems: string[] = [];
  // The live policy set on pets: CREATE adds by name, DROP removes.
  const live = new Map<string, string>();
  const policyRe = new RegExp(
    String.raw`(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([^\s"]+))\s+ON\s+${PUB('pets')}(?=[\s;])([^;]*);`,
    'gi',
  );
  for (const m of sql.matchAll(policyRe)) {
    const name = (m[2] ?? m[3]).toLowerCase();
    if (m[1].toUpperCase() === 'DROP') live.delete(name);
    else live.set(name, m[4]);
  }
  if (live.size === 0) problems.push('no policy on pets');
  for (const [name, rest] of live) {
    const cmd = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(rest);
    const verb = cmd ? cmd[1].toUpperCase() : 'ALL';
    if (verb === 'ALL' || verb === 'DELETE') problems.push(`policy ${name} on pets admits DELETE (FOR ${verb})`);
  }

  // DELETE and TRUNCATE revoked from both client roles, and never granted back.
  const revokes = [
    ...sql.matchAll(new RegExp(String.raw`REVOKE\s+([^;]*?)\bON\s+(?:TABLE\s+)?${PUB('pets')}\s+FROM\s+([^;]*);`, 'gi')),
  ].filter((m) => /\bDELETE\b/i.test(m[1]) && /\bTRUNCATE\b/i.test(m[1]));
  const lastRevoke = revokes[revokes.length - 1];
  const missing = lastRevoke ? CLIENT_ROLES.filter((r) => !roleNamed(lastRevoke[2], r)) : CLIENT_ROLES;
  if (missing.length > 0) {
    problems.push(`DELETE and TRUNCATE on pets are not revoked from ${missing.join(', ')}`);
  } else {
    const from = (lastRevoke.index ?? 0) + lastRevoke[0].length;
    const back = tableGrants(sql).some(
      (g) =>
        g.index >= from &&
        /\b(?:DELETE|TRUNCATE|ALL)\b/i.test(g.privileges) &&
        (g.tables.includes('pets') || g.tables.includes('*')) &&
        grantsTo(g.roles, ['anon', 'authenticated', 'PUBLIC']),
    );
    if (back) problems.push('a later GRANT gives DELETE or TRUNCATE on pets back to a client role');
  }
  // A client could own pets outright, or a child table could hold pet ids
  // outside the parent's key and triggers (pass 1, F3 / the INHERITS case).
  if (new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${PUB('pets')}\s+OWNER\s+TO\b`, 'i').test(sql)) {
    problems.push('pets changes owner');
  }
  return problems;
}

function triggerProblems(
  sql: string,
  fns: Map<string, { text: string; index: number }>,
  trigger: string,
  table: string,
  pinned: RegExp,
  fnName: string,
): string[] {
  const problems: string[] = [];
  const creates = [
    ...sql.matchAll(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?${trigger}"?\s[^;]*;`, 'gi')),
  ];
  if (creates.length === 0) return [`no trigger ${trigger}`];
  const last = creates[creates.length - 1];
  if (!pinned.test(last[0])) {
    problems.push(`the last ${trigger} is not the pinned shape`);
    return problems;
  }
  const after = sql.slice(last.index ?? 0);
  const fn = fns.get(fnName);
  const dropFrom = Math.min(fn ? fn.index : 0, last.index ?? 0);
  if (new RegExp(String.raw`DROP\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s[^;]*\b${fnName}\b`, 'i').test(sql.slice(dropFrom))) {
    problems.push(`${fnName} is dropped after its live definition or ${trigger}'s last creation`);
  }
  if (new RegExp(String.raw`DROP\s+TRIGGER[^;]*\b${trigger}\b`, 'i').test(after)) problems.push(`${trigger} is dropped after its last creation`);
  if (new RegExp(String.raw`ALTER\s+TRIGGER\s+"?${trigger}"?`, 'i').test(after)) problems.push(`${trigger} is renamed or altered after its last creation`);
  const toggles: string[] = [];
  const alters = new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${QUAL(table)}\s[^;]*;`, 'gi');
  for (const stmt of after.matchAll(alters)) {
    const re = new RegExp(String.raw`\b(DISABLE|ENABLE(?:\s+(?:REPLICA|ALWAYS))?)\s+TRIGGER\s+(?:"?${trigger}"?|ALL|USER)(?![\w"])`, 'gi');
    for (const t of stmt[0].matchAll(re)) toggles.push(squash(t[1]).toUpperCase());
  }
  const state = toggles.length ? toggles[toggles.length - 1] : 'ENABLE';
  if (state === 'DISABLE' || state === 'ENABLE REPLICA') problems.push(`${trigger} is disabled after its last creation`);
  return problems;
}

/** G2: the problems with the pet-id reservation, read from every migration in order. Empty when it holds. */
export function petIdReservationProblems(sql: string): string[] {
  const problems: string[] = [];
  const fns = liveFunctions(sql);
  for (const [name, pinned] of [
    ['reserve_pet_id', RESERVE_DEFINITION],
    ['pet_ids_retired_append_only', APPEND_ONLY_DEFINITION],
  ] as const) {
    const live = fns.get(name);
    if (!live) problems.push(`no definition of ${name}`);
    else if (squash(live.text) !== pinned) problems.push(`the live ${name} is not the pinned definition`);
    if (new RegExp(String.raw`ALTER\s+(?:FUNCTION|ROUTINE|PROCEDURE)\s+${QUAL(name)}`, 'i').test(sql)) {
      problems.push(`an ALTER FUNCTION/ROUTINE changes ${name}`);
    }
  }
  if (problems.length > 0) return problems;

  problems.push(
    ...triggerProblems(
      sql, fns, 'trg_pets_reserve_id', 'pets',
      new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?trg_pets_reserve_id"?\s+AFTER\s+INSERT\s+ON\s+${PUB('pets')}\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+${PUB('reserve_pet_id')}\s*\(\s*\)\s*;$`, 'i'),
      'reserve_pet_id',
    ),
    ...triggerProblems(
      sql, fns, 'trg_pet_ids_retired_append_only', 'pet_ids_retired',
      new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?trg_pet_ids_retired_append_only"?\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+${PUB('pet_ids_retired')}\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+${PUB('pet_ids_retired_append_only')}\s*\(\s*\)\s*;$`, 'i'),
      'pet_ids_retired_append_only',
    ),
    ...triggerProblems(
      sql, fns, 'trg_pet_ids_retired_no_truncate', 'pet_ids_retired',
      new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?trg_pet_ids_retired_no_truncate"?\s+BEFORE\s+TRUNCATE\s+ON\s+${PUB('pet_ids_retired')}\s+FOR\s+EACH\s+STATEMENT\s+EXECUTE\s+FUNCTION\s+${PUB('pet_ids_retired_append_only')}\s*\(\s*\)\s*;$`, 'i'),
      'pet_ids_retired_append_only',
    ),
  );

  // The ledger: created once, never dropped, renamed or truncated around its
  // guard; RLS on; every grant revoked from every API role and none given back.
  const table = PUB('pet_ids_retired');
  const created = new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${table}\s*\(`, 'i').exec(sql);
  if (!created) return [...problems, 'no table pet_ids_retired'];
  const after = sql.slice(created.index);
  if (new RegExp(String.raw`DROP\s+TABLE\s[^;]*\bpet_ids_retired\b`, 'i').test(after)) problems.push('pet_ids_retired is dropped');
  // Any ALTER beyond turning row level security on is an undo: a dropped
  // primary key, OWNER TO, RENAME, a trigger toggle (pass 1, F1, measured).
  const ledgerAlters = [
    ...after.matchAll(new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${table}\s+([^;]*);`, 'gi')),
  ];
  if (ledgerAlters.some((m) => !/^(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY$/i.test(squash(m[1])))) {
    problems.push('pet_ids_retired is altered beyond enabling row level security');
  }
  // Only the two pinned triggers may sit on the ledger: another can rewrite
  // the id before it lands (pass 1, F1, measured).
  const ledgerTriggers = [
    ...after.matchAll(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?(\w+)"?\s[^;]*?\bON\s+${table}(?=[\s;])`, 'gi')),
  ].map((m) => m[1].toLowerCase()).filter((n) => n !== 'trg_pet_ids_retired_append_only' && n !== 'trg_pet_ids_retired_no_truncate');
  if (ledgerTriggers.length > 0) problems.push(`another trigger sits on pet_ids_retired (${ledgerTriggers.join(', ')})`);
  if (!new RegExp(String.raw`ALTER\s+TABLE\s+${table}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY`, 'i').test(after)) {
    problems.push('row level security is not enabled on pet_ids_retired');
  }
  if (new RegExp(String.raw`CREATE\s+POLICY\s[^;]*\bON\s+${table}(?=[\s;])`, 'i').test(after)) problems.push('a policy opens pet_ids_retired');
  for (const role of ALL_API_ROLES) {
    const revoked = new RegExp(String.raw`REVOKE\s+ALL\s+ON\s+(?:TABLE\s+)?${table}\s+FROM\s+[^;]*`, 'gi');
    if (![...after.matchAll(revoked)].some((m) => roleNamed(m[0].replace(/^[\s\S]*?\bFROM\b/i, ''), role))) {
      problems.push(`pet_ids_retired is not revoked from ${role}`);
    }
  }
  if (
    tableGrants(after).some(
      (g) => (g.tables.includes('pet_ids_retired') || g.tables.includes('*')) && grantsTo(g.roles, ALL_API_ROLES),
    )
  ) {
    problems.push('a later GRANT opens pet_ids_retired to an API role');
  }
  // A rule redirects a write (pass 1, F1: a DO INSTEAD on the ledger landed
  // the re-insert with ROW_COUNT 1), and a child of pets holds ids outside
  // the parent's key and triggers.
  for (const t of ['pets', 'pet_ids_retired']) {
    if (new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?RULE\s[^;]*?\bTO\s+${PUB(t)}(?=[\s;])`, 'i').test(sql)) {
      problems.push(`a rule rewrites writes to ${t}`);
    }
  }
  if (new RegExp(String.raw`(?:INHERITS\s*\((?:[^)]*?[\s,])?\s*${PUB('pets')}\s*[,)]|PARTITION\s+OF\s+${PUB('pets')}(?=[\s(]))`, 'i').test(sql)) {
    problems.push('a table inherits pets');
  }
  return problems;
}

describe('a pet leaves only with its account, and its id never comes back (CUL-2336, CUL-2375, migration 116)', () => {
  const sql = allMigrations();
  const body116 = stripSqlComments(
    readFileSync(join(MIGRATIONS_DIR, '116_pets_no_client_delete_ids_never_reused.sql'), 'utf8'),
  );
  // 001's policy ahead of 116, as the repository holds it.
  const base = `CREATE POLICY "pets_owner" ON pets FOR ALL USING (auth.uid() = user_id);\n${body116}`;
  const mutate = (from: string | RegExp, to: string): string => {
    const m = base.replace(from, to);
    expect(m).not.toBe(base); // the mutant applied
    return m;
  };

  it('the repository holds both: no client DELETE on pets, and every pet id reserved', () => {
    expect(petDeleteProblems(sql)).toEqual([]);
    expect(petIdReservationProblems(sql)).toEqual([]);
  });

  it('G1 reds without 116, on a FOR ALL or FOR DELETE policy, and on a client DELETE grant', () => {
    expect(petDeleteProblems('CREATE POLICY "pets_owner" ON pets FOR ALL USING (auth.uid() = user_id);')).toEqual([
      'policy pets_owner on pets admits DELETE (FOR ALL)',
      'DELETE and TRUNCATE on pets are not revoked from anon, authenticated',
    ]);
    expect(petDeleteProblems(mutate(/DROP POLICY IF EXISTS "pets_owner" ON public\.pets;/, ''))).toEqual([
      'policy pets_owner on pets admits DELETE (FOR ALL)',
    ]);
    const admits = (later: string): string[] => petDeleteProblems(`${base}\n${later}`);
    expect(admits('CREATE POLICY "pets_owner_delete" ON public.pets FOR DELETE USING (user_id = (select auth.uid()));')).toEqual([
      'policy pets_owner_delete on pets admits DELETE (FOR DELETE)',
    ]);
    expect(admits('create policy pets_any on "public"."pets" using (true);')).toEqual(['policy pets_any on pets admits DELETE (FOR ALL)']);
    // Another table's FOR ALL policy, or one on `pets_x`, is not this table's.
    expect(admits('CREATE POLICY "x" ON public.pets_archive FOR ALL USING (true);')).toEqual([]);
    expect(admits('CREATE POLICY "pets_owner_delete" ON public.pets FOR DELETE USING (false); DROP POLICY "pets_owner_delete" ON public.pets;')).toEqual([]);
    expect(petDeleteProblems(mutate('REVOKE DELETE, TRUNCATE ON public.pets FROM anon, authenticated;', ''))).toEqual([
      'DELETE and TRUNCATE on pets are not revoked from anon, authenticated',
    ]);
    expect(petDeleteProblems(mutate('FROM anon, authenticated;', 'FROM anon;'))).toEqual([
      'DELETE and TRUNCATE on pets are not revoked from authenticated',
    ]);
    expect(petDeleteProblems(mutate('REVOKE DELETE, TRUNCATE ON', 'REVOKE DELETE ON'))).toEqual([
      'DELETE and TRUNCATE on pets are not revoked from anon, authenticated',
    ]);
    for (const grant of [
      'GRANT DELETE ON public.pets TO authenticated;',
      'grant all on table pets to anon;',
      'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;',
      'GRANT TRUNCATE ON "public"."pets" TO PUBLIC;',
    ]) {
      expect(admits(grant)).toEqual(['a later GRANT gives DELETE or TRUNCATE on pets back to a client role']);
    }
    expect(admits('GRANT DELETE ON public.pets TO service_role;')).toEqual([]);
    // rls-privacy-reviewer pass 1, F3: a spaced policy name and a table-list grant, together.
    expect(admits('CREATE POLICY "pets: owner all" ON public.pets USING (user_id = auth.uid());')).toEqual([
      'policy pets: owner all on pets admits DELETE (FOR ALL)',
    ]);
    expect(admits('GRANT DELETE ON public.pets, public.vet_visits TO authenticated;')).toEqual([
      'a later GRANT gives DELETE or TRUNCATE on pets back to a client role',
    ]);
    expect(admits('GRANT DELETE ON public.vet_visits, public.pets_archive TO authenticated;')).toEqual([]);
    expect(admits('ALTER TABLE public.pets OWNER TO authenticated;')).toEqual(['pets changes owner']);
    expect(admits('GRANT SELECT, UPDATE ON public.pets TO authenticated;')).toEqual([]);
  });

  it('G2 pins the reservation function and the ledger guard: any edit reds', () => {
    const pinned = (name: string) => [`the live ${name} is not the pinned definition`];
    expect(petIdReservationProblems(mutate('EXCEPTION WHEN unique_violation THEN\n    n := 0;', 'EXCEPTION WHEN unique_violation THEN\n    n := 1;'))).toEqual(pinned('reserve_pet_id'));
    expect(petIdReservationProblems(mutate('IF n <> 1 THEN', "IF n <> 1 AND current_user <> 'service_role' THEN"))).toEqual(pinned('reserve_pet_id'));
    expect(petIdReservationProblems(mutate("'A pet needs an id never used before'", "'id % was used', NEW.id"))).toEqual(pinned('reserve_pet_id'));
    expect(petIdReservationProblems(mutate(/BEGIN\n  BEGIN\n    INSERT/, 'BEGIN\n  RETURN NULL;\n  BEGIN\n    INSERT'))).toEqual(pinned('reserve_pet_id'));
    expect(petIdReservationProblems(mutate(/RAISE EXCEPTION\n    'pet_ids_retired/, "IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;\n  RAISE EXCEPTION\n    'pet_ids_retired"))).toEqual(pinned('pet_ids_retired_append_only'));
    const later = (s: string): string[] => petIdReservationProblems(`${base}\n${s}`);
    expect(later('ALTER FUNCTION public.reserve_pet_id() SECURITY INVOKER;')).toEqual(['an ALTER FUNCTION/ROUTINE changes reserve_pet_id']);
    expect(later('create or replace function public.reserve_pet_id() returns trigger language plpgsql security definer set search_path = \'\' as $$ begin return null; end; $$;')).toEqual(pinned('reserve_pet_id'));
  });

  it('G2 reds on a narrowed, moved, dropped or disabled trigger', () => {
    expect(petIdReservationProblems(mutate('AFTER INSERT ON public.pets', 'BEFORE INSERT ON public.pets'))).toEqual(['the last trg_pets_reserve_id is not the pinned shape']);
    expect(petIdReservationProblems(mutate(/FOR EACH ROW EXECUTE FUNCTION public\.reserve_pet_id/, 'FOR EACH ROW WHEN (false) EXECUTE FUNCTION public.reserve_pet_id'))).toEqual(['the last trg_pets_reserve_id is not the pinned shape']);
    expect(petIdReservationProblems(mutate('BEFORE UPDATE OR DELETE ON public.pet_ids_retired', 'BEFORE UPDATE ON public.pet_ids_retired'))).toEqual(['the last trg_pet_ids_retired_append_only is not the pinned shape']);
    const later = (s: string): string[] => petIdReservationProblems(`${base}\n${s}`);
    expect(later('CREATE OR REPLACE TRIGGER trg_pets_reserve_id AFTER INSERT ON archive.pets FOR EACH ROW EXECUTE FUNCTION public.reserve_pet_id();')).toEqual(['the last trg_pets_reserve_id is not the pinned shape']);
    expect(later('DROP TRIGGER IF EXISTS trg_pets_reserve_id ON public.pets;')).toEqual(['trg_pets_reserve_id is dropped after its last creation']);
    expect(later('ALTER TRIGGER trg_pets_reserve_id ON public.pets RENAME TO x;')).toEqual(['trg_pets_reserve_id is renamed or altered after its last creation']);
    expect(later('ALTER TABLE public.pets DISABLE TRIGGER trg_pets_reserve_id;')).toEqual(['trg_pets_reserve_id is disabled after its last creation']);
    expect(later('alter table only pets disable trigger user;')).toEqual(['trg_pets_reserve_id is disabled after its last creation']);
    expect(later('ALTER TABLE public.pet_ids_retired DISABLE TRIGGER ALL;')).toEqual([
      'trg_pet_ids_retired_append_only is disabled after its last creation',
      'trg_pet_ids_retired_no_truncate is disabled after its last creation',
      'pet_ids_retired is altered beyond enabling row level security',
    ]);
    expect(later('DROP FUNCTION public.reserve_pet_id() CASCADE;')).toEqual(['reserve_pet_id is dropped after its live definition or trg_pets_reserve_id\'s last creation']);
    expect(later('ALTER TABLE pets DISABLE TRIGGER ALL; ALTER TABLE pets ENABLE TRIGGER ALL;')).toEqual([]);
    expect(later('CREATE OR REPLACE TRIGGER trg_pets_reserve_id AFTER INSERT ON public.pets FOR EACH ROW EXECUTE FUNCTION public.reserve_pet_id();')).toEqual([]);
  });

  it('G2 reds when the ledger is dropped, opened or loses a revoke', () => {
    const later = (s: string): string[] => petIdReservationProblems(`${base}\n${s}`);
    expect(later('DROP TABLE public.pet_ids_retired;')).toEqual(['pet_ids_retired is dropped']);
    const altered = ['pet_ids_retired is altered beyond enabling row level security'];
    expect(later('ALTER TABLE public.pet_ids_retired RENAME TO old_ids;')).toEqual(altered);
    expect(later('ALTER TABLE pet_ids_retired DISABLE ROW LEVEL SECURITY;')).toEqual(altered);
    // rls-privacy-reviewer pass 1, F1: each measured on the replay to land a re-insert.
    expect(later('ALTER TABLE public.pet_ids_retired DROP CONSTRAINT pet_ids_retired_pkey;')).toEqual(altered);
    expect(later('ALTER TABLE public.pet_ids_retired OWNER TO service_role;')).toEqual(altered);
    expect(later('ALTER TABLE public.pet_ids_retired FORCE ROW LEVEL SECURITY;')).toEqual([]);
    expect(later('CREATE TRIGGER aa BEFORE INSERT ON public.pet_ids_retired FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();')).toEqual([
      'another trigger sits on pet_ids_retired (aa)',
    ]);
    expect(later('CREATE RULE redirect AS ON INSERT TO public.pet_ids_retired DO INSTEAD INSERT INTO public.scratch VALUES (NEW.id);')).toEqual([
      'a rule rewrites writes to pet_ids_retired',
    ]);
    expect(later('create rule r as on insert to pets do also select 1;')).toEqual(['a rule rewrites writes to pets']);
    expect(later('CREATE TABLE public.pets_child () INHERITS (public.pets);')).toEqual(['a table inherits pets']);
    expect(later('CREATE TABLE pets_p PARTITION OF pets FOR VALUES IN (1);')).toEqual(['a table inherits pets']);
    expect(later('CREATE TABLE public.notes () INHERITS (public.pets_archive);')).toEqual([]);
    expect(later('GRANT DELETE ON public.pet_ids_retired, public.x TO service_role;')).toEqual(['a later GRANT opens pet_ids_retired to an API role']);
    expect(later('GRANT EXECUTE ON FUNCTION public.reserve_pet_id() TO postgres;')).toEqual([]);
    expect(later('CREATE POLICY "read" ON public.pet_ids_retired FOR SELECT USING (true);')).toEqual(['a policy opens pet_ids_retired']);
    for (const grant of [
      'GRANT SELECT ON public.pet_ids_retired TO service_role;',
      'grant delete on table pet_ids_retired to authenticated;',
      'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;',
    ]) {
      expect(later(grant)).toEqual(['a later GRANT opens pet_ids_retired to an API role']);
    }
    expect(petIdReservationProblems(mutate('REVOKE ALL ON TABLE public.pet_ids_retired FROM service_role;', ''))).toEqual(['pet_ids_retired is not revoked from service_role']);
    expect(petIdReservationProblems(mutate('ALTER TABLE public.pet_ids_retired ENABLE ROW LEVEL SECURITY;', ''))).toEqual(['row level security is not enabled on pet_ids_retired']);
  });
});
