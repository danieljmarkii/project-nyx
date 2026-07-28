import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Every bucket `uploadPhoto` writes must carry INSERT + SELECT + UPDATE,
// and every grant must be scoped to the caller.
//
// B-577's class fix. THREE independent sessions rediscovered the same seam by
// hand — 042 (B-431, nyx-pet-photos), 043 (B-248, nyx-vet-attachments) and this
// one (B-577, nyx-food-photos) each found a bucket whose only write grant was
// INSERT while `lib/storage.ts uploadPhoto` uploads with `upsert: true`. That is
// `INSERT … ON CONFLICT DO UPDATE`, and Postgres requires an UPDATE policy on
// the conflict leg: the first upload succeeds, every overwrite 42501s. The
// failure is invisible until an owner replaces a photo, and it is invisible in
// review because the missing thing is a policy that was never written.
//
// SELECT is the same class rather than a privacy assertion (042 finding 3):
// Postgres applies SELECT policies to a RETURNING clause and storage-api's
// upsert path reads the existing row and returns the written one, so a bucket
// with no SELECT policy cannot upsert either.
//
// Everything here is DERIVED, never hardcoded, because a hardcoded list fails
// OPEN — the same lesson B-424 forced on the sign-out wipe:
//   * the bucket set comes from the app's own upload call sites,
//   * the search path comes from walking the repo, not a list of dirs,
//   * the policy set comes from replaying supabase/migrations/ in filename order.
//
// ── What the first draft got wrong, and why the shape below is different ─────
// The `rls-privacy-reviewer` pass on B-577 broke the first version of this file
// by MUTATION, which is the only honest way to test a guard. Five fail-open
// paths, each now closed and each with a test below:
//   M1  Replacing 046's predicate with a bare `USING (bucket_id = '…')
//       WITH CHECK (bucket_id = '…')` — i.e. ANY authenticated user may
//       overwrite or rename ANY food photo in the project — passed 11/11 GREEN.
//       The file reasoned at length about re-homing into another owner's prefix
//       and then asserted only that a WITH CHECK clause EXISTED, never that it
//       SCOPED anything. Presence is not scope. → `auth.uid()` is now required
//       in every clause of every policy.
//   M11 A policy whose USING named one bucket and whose WITH CHECK named
//       another passed, and counted as a grant for BOTH — because bucket names
//       were scraped from the whole statement body with no clause split.
//       → clauses are parsed separately and must agree.
//   M4  A `CREATE POLICY` inside a `/* … */` block comment replayed as if it had
//       run; only `--` was stripped. → both comment forms are stripped.
//   M5  A bucket uploaded from `widgets/` was invisible, because the search path
//       was itself a hardcoded five-entry list. The thesis of this file is that
//       hardcoded lists fail open, and the search path was one. → the repo is
//       walked, with an explicit exclusion list.
//   M7  A direct `supabase.storage.from('…').upload(…, { upsert: true })` that
//       bypassed the helper was invisible. → `uploadPhoto` is now pinned as the
//       only uploader.
// The call-site floor was also 7 below the real count, so seven sites could
// vanish silently; it is a per-bucket floor now.
//
// What this test is NOT: it does not talk to a database, so it cannot prove the
// migrations were APPLIED (that is B-505's class — a merged migration is not a
// live one) and it cannot evaluate a predicate against real rows. It proves the
// repo DECLARES the grants, and that each is scoped. The replay was validated
// against prod when it was written: it reproduces the live policy set on
// storage.objects exactly — same names, commands, roles and buckets.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

// Walked, not listed (M5). Excluded: dependency and build output; `docs` and
// `assets` hold no code; `supabase` holds Edge Functions, which run under the
// SERVICE ROLE and bypass RLS entirely — a bucket written only from there needs
// no policy at all, so scanning it would raise false failures.
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.expo', '.github', 'coverage', 'dist', 'build',
  'docs', 'assets', 'supabase', 'ios', 'android',
]);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(join(dir, entry.name));
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(join(dir, entry.name));
      }
    }
  };
  walk(ROOT);
  return out;
}

// ── The bucket set, derived from the call sites ──────────────────────────────

// Call sites pass either a literal or a constant, so both are resolved. The
// lookbehind skips `export async function uploadPhoto(` in lib/storage.ts —
// without it the declaration's own parameter name parses as a bucket.
const UPLOAD_CALL_RE = /(?<!function\s)\buploadPhoto\(\s*([^,)\s]+)/g;
// Only bucket-shaped literals, so an unrelated `const FOO = 'bar'` never
// shadows a real name.
const BUCKET_CONST_RE = /\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*(?::\s*string\s*)?=\s*['"](nyx-[a-z0-9-]+)['"]/g;
// M7 — any OTHER route to Storage's upload API. `uploadPhoto` is meant to be the
// single chokepoint (it is where `upsert: true` and `cacheControl: '0'` live), so
// a second uploader is both a policy blind spot for this test and a cache-control
// regression.
const RAW_UPLOAD_RE = /\.upload\(/g;

interface CallSite {
  readonly file: string;
  readonly token: string;
  readonly bucket: string | null;
}

const files = sourceFiles();

function bucketConstants(): Map<string, string> {
  const constants = new Map<string, string>();
  const conflicts: string[] = [];
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(BUCKET_CONST_RE)) {
      const [, name, value] = m;
      const prior = constants.get(name);
      // Two files may legitimately declare the same constant (PET_PHOTO_BUCKET
      // is declared in both profile.tsx and PetAvatar.tsx). Two DIFFERENT values
      // under one name would make resolution a coin flip, so that is an error
      // rather than a last-write-wins.
      if (prior !== undefined && prior !== value) conflicts.push(`${name}: ${prior} vs ${value}`);
      constants.set(name, value);
    }
  }
  if (conflicts.length) throw new Error(`bucket constants disagree: ${conflicts.join('; ')}`);
  return constants;
}

function uploadCallSites(): CallSite[] {
  const constants = bucketConstants();
  const calls: CallSite[] = [];
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(UPLOAD_CALL_RE)) {
      const token = m[1];
      const literal = /^['"](.+)['"]$/.exec(token);
      calls.push({
        file: file.slice(ROOT.length + 1),
        token,
        bucket: literal ? literal[1] : (constants.get(token) ?? null),
      });
    }
  }
  return calls;
}

function rawUploadSites(): string[] {
  const out: string[] = [];
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    for (const _ of readFileSync(file, 'utf8').matchAll(RAW_UPLOAD_RE)) out.push(rel);
  }
  return out;
}

// ── The policy set, derived by replaying the migrations ──────────────────────

// Strip `--` line comments AND `/* … */` block comments, without touching
// quoted strings (M4). Load-bearing: 025, 042 and 043 all carry full
// CREATE/DROP POLICY statements inside their commented rollback blocks, and a
// scan that missed them would replay a rollback as if it had run.
function stripSqlComments(sql: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inString) {
      out += c;
      if (c === "'") inString = false;
      continue;
    }
    if (c === "'") {
      inString = true;
      out += c;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++; // the loop's own i++ consumes the '/'
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

// Pull the balanced parenthesised body of a clause — `USING (…)` or
// `WITH CHECK (…)`. A regex cannot do this: the predicates nest parens several
// deep (a subquery inside an IN inside an AND), so a lazy match stops at the
// first `)` and a greedy one swallows the next clause.
function extractClause(body: string, keyword: RegExp): string | null {
  const m = keyword.exec(body);
  if (!m) return null;
  let i = body.indexOf('(', m.index);
  if (i === -1) return null;
  let depth = 0;
  let inString = false;
  const start = i;
  for (; i < body.length; i++) {
    const c = body[i];
    if (inString) {
      if (c === "'") inString = false;
      continue;
    }
    if (c === "'") inString = true;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return body.slice(start + 1, i);
    }
  }
  return null;
}

const CREATE_POLICY_RE = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+storage\.objects\b/gi;
const DROP_POLICY_RE = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+storage\.objects\s*;/gi;

interface Clause {
  readonly kind: 'USING' | 'WITH CHECK';
  readonly body: string;
  readonly buckets: readonly string[];
  readonly scoped: boolean;
}

interface Policy {
  readonly name: string;
  readonly file: string;
  readonly cmd: string;
  readonly roles: readonly string[];
  readonly clauses: readonly Clause[];
}

const bucketsIn = (clause: string): string[] =>
  [...new Set([...clause.matchAll(/bucket_id\s*=\s*'([^']+)'/gi)].map((m) => m[1]))];

// Normalise whitespace so an identical predicate formatted differently across
// the two clauses still compares equal.
const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();

function buildClause(kind: Clause['kind'], body: string | null): Clause | null {
  if (body === null) return null;
  return {
    kind,
    body: normalise(body),
    buckets: bucketsIn(body),
    // The whole point (M1). `bucket_id = '…'` alone is a bucket check, not an
    // ownership check — it authorises EVERY authenticated user. A scoped
    // predicate names the caller.
    scoped: /auth\.uid\(\)/.test(body),
  };
}

// Replay every migration in filename order, honouring drops, and return the
// policy set the repo declares as final. Filename order IS apply order — the
// files are zero-padded and Supabase applies them lexically.
function declaredPolicies(): Policy[] {
  const live = new Map<string, Policy>();
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of migrations) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    // Interleave creates and drops by byte offset: a file that drops a policy
    // and then recreates it (the idempotent house pattern) must land on the
    // create, and a file that creates then drops must land on the drop.
    const statements = [
      ...[...sql.matchAll(CREATE_POLICY_RE)].map((m) => ({ at: m.index!, kind: 'create' as const, name: m[1] })),
      ...[...sql.matchAll(DROP_POLICY_RE)].map((m) => ({ at: m.index!, kind: 'drop' as const, name: m[1] })),
    ].sort((a, b) => a.at - b.at);

    for (const s of statements) {
      if (s.kind === 'drop') {
        live.delete(s.name);
        continue;
      }
      const end = sql.indexOf(';', s.at);
      const body = sql.slice(s.at, end === -1 ? undefined : end);
      const cmd = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(body);
      const roles = /\bTO\s+([A-Za-z_, ]+?)\s*\n/i.exec(body);
      // WITH CHECK first: `USING` would otherwise be found inside nothing, but
      // extracting WITH CHECK before searching for USING keeps each keyword
      // matching its own clause regardless of source order.
      const withCheck = buildClause('WITH CHECK', extractClause(body, /\bWITH\s+CHECK\s*\(/i));
      const using = buildClause('USING', extractClause(body, /\bUSING\s*\(/i));
      live.set(s.name, {
        name: s.name,
        file,
        // Postgres defaults an omitted FOR to ALL.
        cmd: cmd ? cmd[1].toUpperCase() : 'ALL',
        roles: roles ? roles[1].split(',').map((r) => r.trim()).filter(Boolean) : [],
        clauses: [using, withCheck].filter((c): c is Clause => c !== null),
      });
    }
  }
  return [...live.values()];
}

const calls = uploadCallSites();
const policies = declaredPolicies();

// A policy grants `cmd` on `bucket` only if EVERY one of its clauses names that
// bucket — so M11's split-bucket policy counts for neither.
const grantsOn = (bucket: string, cmd: string): Policy[] =>
  policies.filter(
    (p) =>
      (p.cmd === cmd || p.cmd === 'ALL') &&
      p.clauses.length > 0 &&
      p.clauses.every((c) => c.buckets.length === 1 && c.buckets[0] === bucket),
  );

// The six buckets `uploadPhoto` writes as of 2026-07-28. A FLOOR, not a pin: a
// seventh must be added (and must satisfy everything below), but none of these
// six may silently disappear from the derivation — which is how a broken regex
// would present itself.
const KNOWN_BUCKETS = [
  'nyx-event-attachments',
  'nyx-food-photos',
  'nyx-medication-photos',
  'nyx-pet-photos',
  'nyx-vet-attachments',
  'nyx-vet-documents',
] as const;

const derivedBuckets = [...new Set(calls.map((c) => c.bucket).filter((b): b is string => b !== null))].sort();

describe('uploadPhoto bucket inventory', () => {
  it('still sees every bucket it saw when this test was written', () => {
    // A count floor let seven of thirteen call sites vanish silently. A
    // per-bucket floor cannot: if uploadPhoto is renamed or wrapped and the
    // regex matches nothing, this names exactly what went missing.
    expect(KNOWN_BUCKETS.filter((b) => !derivedBuckets.includes(b))).toEqual([]);
  });

  it('resolves every bucket argument to a literal name', () => {
    // An unresolved argument is not a pass. It means a call site this test can
    // no longer see — e.g. a bucket chosen at runtime, or a constant declared in
    // a shape BUCKET_CONST_RE does not match. Either way the coverage below
    // stops being complete, so it fails loudly instead of quietly shrinking.
    expect(calls.filter((c) => c.bucket === null).map((c) => `${c.file}: uploadPhoto(${c.token}`)).toEqual([]);
  });

  it('routes every upload through uploadPhoto', () => {
    // M7. A direct `.upload(` elsewhere is a bucket this test cannot see, and it
    // also skips the `cacheControl: '0'` that keeps private health photos out of
    // an HTTP cache no wipe path can reach (B-478 VF-6).
    expect(rawUploadSites()).toEqual(['lib/storage.ts']);
  });
});

describe('every uploadPhoto bucket carries INSERT + SELECT + UPDATE', () => {
  it.each(derivedBuckets)('%s', (bucket) => {
    // UPDATE is the one this test was written for (B-577), but all three are
    // asserted together because the upsert path needs all three and each has
    // been the missing one at least once across 042/043/046.
    for (const cmd of ['INSERT', 'SELECT', 'UPDATE'] as const) {
      const grants = grantsOn(bucket, cmd);
      expect({ bucket, cmd, grants: grants.length > 0 }).toEqual({ bucket, cmd, grants: true });
      for (const g of grants) {
        // A grant to `public` is a grant to `anon`, which is 042's finding 1: the
        // anon key ships inlined in every client bundle, so a `TO public` write
        // policy is an unauthenticated write policy.
        expect(g.roles).toEqual(['authenticated']);
      }
    }
  });

  it('scopes every UPDATE grant identically on both sides', () => {
    // Two separate properties, and the first draft asserted neither.
    //   * BOTH clauses must exist — storage-api implements `move()` as an UPDATE
    //     of `objects.name`, so a USING-only grant lets an owner re-home one of
    //     their own objects into another owner's prefix. USING gates the source,
    //     WITH CHECK gates the destination.
    //   * They must be the SAME predicate. A WITH CHECK that merely exists is
    //     what M1 exploited: `WITH CHECK (bucket_id = '…')` is present, and
    //     authorises the entire bucket.
    const updates = policies.filter((p) => p.cmd === 'UPDATE' || p.cmd === 'ALL');
    expect(updates.length).toBeGreaterThan(0);
    for (const p of updates) {
      const using = p.clauses.find((c) => c.kind === 'USING');
      const withCheck = p.clauses.find((c) => c.kind === 'WITH CHECK');
      expect({ name: p.name, using: using?.body, withCheck: withCheck?.body }).toEqual({
        name: p.name,
        using: using?.body,
        withCheck: using?.body,
      });
      expect(withCheck).toBeDefined();
    }
  });
});

describe('storage.objects policy hygiene', () => {
  it('scopes every clause of every policy to the caller', () => {
    // M1, the mutation that passed the first draft 11/11: an UPDATE policy whose
    // predicate is `bucket_id = 'nyx-food-photos'` and nothing else lets ANY
    // authenticated user overwrite or rename ANY food photo in the project. It
    // has a USING clause; it has a WITH CHECK clause; it names the right bucket.
    // Presence is not scope — the predicate has to name the CALLER.
    const unscoped = policies.flatMap((p) =>
      p.clauses.filter((c) => !c.scoped).map((c) => `${p.file}: ${p.name} [${c.kind}]`),
    );
    expect(unscoped).toEqual([]);
  });

  it('names exactly one bucket in every clause, and the same one throughout', () => {
    // A clause with no bucket_id predicate applies to EVERY bucket — the shape
    // that made B-248 a cross-tenant read of vet documents. A policy whose USING
    // and WITH CHECK name DIFFERENT buckets (M11) is a cross-bucket move grant.
    const wrong = policies
      .filter((p) => {
        const named = new Set(p.clauses.flatMap((c) => c.buckets));
        return p.clauses.length === 0 || named.size !== 1 || p.clauses.some((c) => c.buckets.length !== 1);
      })
      .map((p) => `${p.file}: ${p.name} → ${p.clauses.map((c) => `${c.kind}:${c.buckets.join('|') || '(none)'}`).join(', ')}`);
    expect(wrong).toEqual([]);
  });

  it('grants only to authenticated', () => {
    const wrong = policies
      .filter((p) => p.roles.length !== 1 || p.roles[0] !== 'authenticated')
      .map((p) => `${p.file}: ${p.name} → ${p.roles.join(',') || '(none)'}`);
    expect(wrong).toEqual([]);
  });
});
