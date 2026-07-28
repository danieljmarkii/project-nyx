import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Every bucket `uploadPhoto` writes must carry INSERT + SELECT + UPDATE.
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
// Both halves of this test are DERIVED, never hardcoded, because a hardcoded
// list fails OPEN — the same lesson B-424 forced on the sign-out wipe. A new
// bucket added to a hardcoded list is a bucket someone remembered; a new bucket
// discovered by walking the `uploadPhoto` call sites is every bucket. So:
//   * the bucket set comes from the app's own call sites,
//   * the policy set comes from replaying supabase/migrations/ in filename order.
// Adding a seventh bucket without deciding its policy set breaks this test,
// which is the entire point.
//
// What this test is NOT: it does not talk to a database, so it cannot prove the
// migrations were APPLIED (that is B-505's class — a merged migration is not a
// live one) and it cannot evaluate a predicate. It proves the repo declares the
// grants. The replay was validated against prod when it was written: it
// reproduces the live 19-policy set on storage.objects exactly — same names,
// commands, roles and buckets.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const SOURCE_DIRS = ['app', 'lib', 'components', 'store', 'hooks'];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
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

interface CallSite {
  readonly file: string;
  readonly token: string;
  readonly bucket: string | null;
}

function scanSource(): { calls: CallSite[]; constants: Map<string, string> } {
  const files = sourceFiles();
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
  if (conflicts.length) {
    throw new Error(`bucket constants disagree across files: ${conflicts.join('; ')}`);
  }

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
  return { calls, constants };
}

// ── The policy set, derived by replaying the migrations ──────────────────────

// Strip `--` comments without touching quoted strings. Load-bearing: 025, 042
// and 043 all carry full CREATE/DROP POLICY statements inside their commented
// rollback blocks, and a naive strip-nothing scan would replay a rollback as if
// it had run.
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
    out += c;
  }
  return out;
}

const CREATE_POLICY_RE = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+storage\.objects\b/gi;
const DROP_POLICY_RE = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+storage\.objects\s*;/gi;

interface Policy {
  readonly name: string;
  readonly file: string;
  readonly cmd: string;
  readonly roles: readonly string[];
  readonly buckets: readonly string[];
  readonly hasUsing: boolean;
  readonly hasWithCheck: boolean;
}

// Replay every migration in filename order, honouring drops, and return the
// policy set the repo declares as final. Filename order IS apply order — the
// files are zero-padded and Supabase applies them lexically.
function declaredPolicies(): Map<string, Policy> {
  const live = new Map<string, Policy>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
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
      // A policy body ends at the first `;` — none of these statements contain
      // one, since every predicate is a parenthesised expression.
      const end = sql.indexOf(';', s.at);
      const body = sql.slice(s.at, end === -1 ? undefined : end);
      const cmd = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(body);
      const roles = /\bTO\s+([A-Za-z_, ]+?)\s*\n/i.exec(body);
      live.set(s.name, {
        name: s.name,
        file,
        // Postgres defaults an omitted FOR to ALL.
        cmd: cmd ? cmd[1].toUpperCase() : 'ALL',
        roles: roles ? roles[1].split(',').map((r) => r.trim()).filter(Boolean) : [],
        buckets: [...body.matchAll(/bucket_id\s*=\s*'([^']+)'/gi)].map((m) => m[1]),
        hasUsing: /\bUSING\s*\(/i.test(body),
        hasWithCheck: /\bWITH\s+CHECK\s*\(/i.test(body),
      });
    }
  }
  return live;
}

const { calls } = scanSource();
const policies = [...declaredPolicies().values()];

const grantsOn = (bucket: string, cmd: string): Policy[] =>
  policies.filter((p) => p.buckets.includes(bucket) && (p.cmd === cmd || p.cmd === 'ALL'));

describe('uploadPhoto bucket inventory', () => {
  it('finds the upload call sites', () => {
    // A guard on the guard. If uploadPhoto is ever renamed or wrapped, this
    // regex silently matches nothing and every assertion below passes over an
    // empty set — the exact fail-open shape this file exists to prevent. Six is
    // the count at authoring time (2026-07-28); it is a floor, not a pin.
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });

  it('resolves every bucket argument to a literal name', () => {
    // An unresolved argument is not a pass. It means a call site this test can
    // no longer see — e.g. a bucket chosen at runtime, or a constant declared in
    // a shape BUCKET_CONST_RE does not match. Either way the coverage below
    // stops being complete, so it fails loudly instead of quietly shrinking.
    const unresolved = calls.filter((c) => c.bucket === null);
    expect(unresolved.map((c) => `${c.file}: uploadPhoto(${c.token}`)).toEqual([]);
  });
});

describe('every uploadPhoto bucket carries INSERT + SELECT + UPDATE', () => {
  const buckets = [...new Set(calls.map((c) => c.bucket).filter((b): b is string => b !== null))].sort();

  it.each(buckets)('%s', (bucket) => {
    // UPDATE is the one this test was written for (B-577), but all three are
    // asserted together because the upsert path needs all three and each has
    // been the missing one at least once across 042/043/046.
    for (const cmd of ['INSERT', 'SELECT', 'UPDATE'] as const) {
      const grants = grantsOn(bucket, cmd);
      expect(grants.length).toBeGreaterThan(0);
      // A grant to `public` is a grant to `anon`, which is 042's finding 1: the
      // anon key ships inlined in every client bundle, so a `TO public` write
      // policy is an unauthenticated write policy.
      for (const g of grants) expect(g.roles).toEqual(['authenticated']);
    }
  });

  it('scopes every UPDATE grant on both sides', () => {
    // The WITH CHECK half is not ceremony: storage-api implements `move()` as an
    // UPDATE of `objects.name`, so a USING-only grant lets an owner re-home one
    // of their own objects into another owner's prefix. USING gates the source,
    // WITH CHECK gates the destination — 042 finding 2 / 043 finding 3.
    const updates = policies.filter((p) => p.cmd === 'UPDATE' || p.cmd === 'ALL');
    expect(updates.length).toBeGreaterThan(0);
    for (const p of updates) {
      expect({ name: p.name, using: p.hasUsing, withCheck: p.hasWithCheck }).toEqual({
        name: p.name,
        using: true,
        withCheck: true,
      });
    }
  });
});

describe('storage.objects policy hygiene', () => {
  it('names a bucket in every policy', () => {
    // A policy with no bucket_id predicate applies to EVERY bucket — the shape
    // that made B-248 a cross-tenant read of vet documents. There is no
    // legitimate bucket-agnostic policy in this project.
    expect(policies.filter((p) => p.buckets.length === 0).map((p) => `${p.file}: ${p.name}`)).toEqual([]);
  });

  it('grants only to authenticated', () => {
    const wrong = policies
      .filter((p) => p.roles.length !== 1 || p.roles[0] !== 'authenticated')
      .map((p) => `${p.file}: ${p.name} → ${p.roles.join(',') || '(none)'}`);
    expect(wrong).toEqual([]);
  });
});
