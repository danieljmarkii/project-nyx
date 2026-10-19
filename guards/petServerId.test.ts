import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-2029 (migration 104): a pet's id is always the server's. Every pet-keyed
// Storage policy admits a caller to `{petId}/…` when that id is one of their pets,
// so an account that could CHOOSE a pet id (insert with a client id, or update a
// childless pet's id) claimed a dead pet's leftover files. 104's trigger replaces
// every client-inserted id and refuses any change to one. Proven on a PG16 replay
// of 001-104, every attack driven with the trigger on and off (the PR records the
// sweep). This file pins the live definition (the LAST in filename order), so a
// later CREATE OR REPLACE, DROP or DISABLE that reopens the claim reds here, and
// it pins the client side: no app insert or upsert of `pets` sends an id.
//
// Every check is a pure function over text, driven against the repository AND
// against a mutant below, so a check that cannot fail is caught here (C-18).
//
// STATED BLIND SPOTS:
//   · Text, not a database: a definition that parses here and fails to apply is
//     caught only by the replay. The replay is the PR's, not CI's.
//   · The client scan reads `.from('pets')` chains literally. A table name built at
//     runtime, or an insert whose payload is a variable, is not read; the payload
//     check fails closed on a spread or an identifier rather than passing it.
//   · A superuser can disable the trigger; that is the server, not a client.

const REPO_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const EXEMPT = ['postgres', 'supabase_admin', 'service_role'];

function allMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n');
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The problems with the live trigger, read from every migration in order. Empty when it holds. */
export function triggerProblems(sql: string): string[] {
  const problems: string[] = [];
  const defs = [...sql.matchAll(/CREATE OR REPLACE FUNCTION (?:public\.)?enforce_pet_server_id\(\)[\s\S]*?\$\$;/g)];
  if (defs.length === 0) return ['no definition of enforce_pet_server_id'];
  const live = defs[defs.length - 1];
  const body = squash(live[0]);

  const insertArm = /IF TG_OP = 'INSERT' THEN IF current_user NOT IN \(([^)]*)\) THEN NEW\.id := gen_random_uuid\(\); END IF;/.exec(body);
  if (!insertArm) {
    problems.push('the INSERT arm does not replace NEW.id for every non-exempt role');
  } else {
    const roles = insertArm[1].split(',').map((r) => r.trim().replace(/^'|'$/g, ''));
    if (squash(roles.sort().join(' ')) !== squash([...EXEMPT].sort().join(' '))) {
      problems.push(`the exempt roles are ${roles.join(', ')}, not ${EXEMPT.join(', ')}`);
    }
  }
  // The UPDATE arm sits beside the INSERT arm, outside any role check: no role
  // changes an id.
  const updateArm = /END IF; ELSIF NEW\.id IS DISTINCT FROM OLD\.id THEN RAISE EXCEPTION ('(?:[^']|'')*') USING ERRCODE = '23514'; END IF; RETURN NEW;/.exec(body);
  if (!updateArm) problems.push('the UPDATE arm does not refuse every change to id');
  else if (/%/.test(updateArm[1])) problems.push('the refusal formats a value into its message (C-31)');
  if (!/SET search_path = ''/.test(body)) problems.push("the function does not pin search_path = ''");

  // The trigger: created on pets for INSERT and UPDATE, after the live function,
  // and never dropped or disabled after its last creation.
  const creates = [
    ...sql.matchAll(/CREATE TRIGGER trg_pets_server_id\s+BEFORE INSERT OR UPDATE ON (?:public\.)?pets\s+FOR EACH ROW EXECUTE FUNCTION (?:public\.)?enforce_pet_server_id\(\);/g),
  ];
  if (creates.length === 0) {
    problems.push('no BEFORE INSERT OR UPDATE trigger trg_pets_server_id on pets');
  } else {
    const lastCreate = creates[creates.length - 1].index ?? 0;
    const after = sql.slice(lastCreate);
    if (/DROP TRIGGER[^;]*\btrg_pets_server_id\b/i.test(after)) problems.push('the trigger is dropped after its last creation');
    // The last toggle wins. `ENABLE REPLICA` fires only in replica sessions, so it
    // switches the trigger off for every client as surely as DISABLE does.
    const toggles = [
      ...after.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?pets\s+(DISABLE|ENABLE(?:\s+(?:REPLICA|ALWAYS))?)\s+TRIGGER\s+(?:trg_pets_server_id|ALL|USER)\b/gi),
    ];
    const last = toggles.length ? squash(toggles[toggles.length - 1][1]).toUpperCase() : 'ENABLE';
    if (last === 'DISABLE' || last === 'ENABLE REPLICA') {
      problems.push('a trigger on pets is disabled after the last creation');
    }
    if (/DROP FUNCTION[^;]*\benforce_pet_server_id\b/i.test(sql.slice(live.index ?? 0))) {
      problems.push('the function is dropped after its live definition');
    }
  }
  return problems;
}

/** Every `.from('pets')` insert or upsert in a source text whose payload can carry an id. */
export function clientIdWrites(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(/\.from\(\s*['"]pets['"]\s*\)\s*\.(insert|upsert)\(\s*/g)) {
    const start = (m.index ?? 0) + m[0].length;
    // The payload: from the call's open paren to its matching close.
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === '(' || source[i] === '{' || source[i] === '[') depth++;
      else if (source[i] === ')' || source[i] === '}' || source[i] === ']') depth--;
      i++;
    }
    const payload = source.slice(start, i - 1);
    // Fail closed: a payload that is not a literal object (a variable, a spread)
    // cannot be read, so it counts as one that may carry an id.
    if (!/^\s*[{[]/.test(payload) || /\.\.\./.test(payload) || /(?:^|[{,\s])['"]?id['"]?\s*[:,}]/.test(payload)) {
      hits.push(`${m[1]}(${squash(payload).slice(0, 80)})`);
    }
  }
  return hits;
}

/** Client source files, derived from the repository rather than a list of directories (C-38). */
function clientSources(): string[] {
  const skip = new Set(['node_modules', '.git', '.expo', 'supabase', 'scripts', 'guards', 'docs', 'ios', 'android', 'widgets']);
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

describe('a pet id is always the server\'s (CUL-2029, migration 104)', () => {
  const sql = allMigrations();
  const body104 = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, '104_pets_server_id.sql'), 'utf8'));

  it('the live trigger replaces every client id and refuses any change', () => {
    expect(triggerProblems(sql)).toEqual([]);
  });

  it('each check fails on the mutant it exists for', () => {
    const mutate = (from: string | RegExp, to: string): string[] => {
      const m = body104.replace(from, to);
      expect(m).not.toBe(body104); // the mutant applied
      return triggerProblems(m);
    };
    expect(mutate("'service_role')", "'service_role', 'authenticated')")).toEqual([
      expect.stringMatching(/exempt roles/),
    ]);
    expect(mutate(/NEW\.id := gen_random_uuid\(\);/, 'NULL;')).toEqual([expect.stringMatching(/INSERT arm/)]);
    expect(mutate(/ELSIF NEW\.id IS DISTINCT FROM OLD\.id/, 'ELSIF FALSE')).toEqual([expect.stringMatching(/UPDATE arm/)]);
    expect(mutate("'A pet''s id cannot change'", "'id % cannot change', NEW.id")).toEqual([
      expect.stringMatching(/UPDATE arm/),
    ]);
    expect(mutate(/BEFORE INSERT OR UPDATE/, 'BEFORE INSERT')).toEqual([expect.stringMatching(/no BEFORE INSERT OR UPDATE/)]);
    // A later migration that reopens it.
    expect(triggerProblems(`${body104}\nDROP TRIGGER IF EXISTS trg_pets_server_id ON public.pets;`)).toEqual([
      expect.stringMatching(/dropped after/),
    ]);
    expect(triggerProblems(`${body104}\nALTER TABLE public.pets DISABLE TRIGGER trg_pets_server_id;`)).toEqual([
      expect.stringMatching(/disabled/),
    ]);
    expect(triggerProblems(`${body104}\nALTER TABLE pets DISABLE TRIGGER trg_pets_server_id; ALTER TABLE pets ENABLE TRIGGER trg_pets_server_id;`)).toEqual([]);
    expect(triggerProblems(`${body104}\nALTER TABLE public.pets ENABLE REPLICA TRIGGER trg_pets_server_id;`)).toEqual([
      expect.stringMatching(/disabled/),
    ]);
    const replaced = body104.replace(/NEW\.id := gen_random_uuid\(\);/, 'NULL;').replace(/[\s\S]*?(CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;)[\s\S]*/, '$1');
    expect(triggerProblems(`${body104}\n${replaced}`)).toEqual([expect.stringMatching(/INSERT arm/)]);
  });

  it('no client insert or upsert of pets sends an id', () => {
    const files = clientSources();
    let writes = 0;
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      writes += [...src.matchAll(/\.from\(\s*['"]pets['"]\s*\)\s*\.(insert|upsert)\(/g)].length;
      for (const hit of clientIdWrites(src)) bad.push(`${relative(REPO_ROOT, f)}: ${hit}`);
    }
    expect(bad).toEqual([]);
    // Non-vacuity: the two pet creations (app/add-pet.tsx, app/onboarding/pet-name.tsx) are read.
    expect(writes).toBeGreaterThanOrEqual(2);
  });

  it('the client scan flags an id, a spread and a variable payload, and passes the shipped shape', () => {
    const one = (payload: string): string[] => clientIdWrites(`supabase\n  .from('pets')\n  .insert(${payload})\n  .select();`);
    expect(one('{ user_id: user.id, name, species }')).toEqual([]);
    expect(one('{ id: petId, user_id: user.id, name }')).toHaveLength(1);
    expect(one('{ user_id: user.id, id }')).toHaveLength(1);
    expect(one('{ ...pet, name }')).toHaveLength(1);
    expect(one('row')).toHaveLength(1);
    expect(one('[{ "id": x }]')).toHaveLength(1);
    expect(clientIdWrites(`supabase.from('pets').upsert({ id: p.id, name })`)).toHaveLength(1);
    expect(clientIdWrites(`supabase.from('pets').update({ weight_kg }).eq('id', petId)`)).toEqual([]);
  });
});
