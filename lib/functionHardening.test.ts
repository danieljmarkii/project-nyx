import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// The security posture of every SECURITY DEFINER / trigger function this repo
// owns, derived by REPLAYING `supabase/migrations/` in filename order and
// asserted against what the repo has decided that posture should be.
//
// WHY THIS EXISTS — the specific regression it is here to catch (B-520, found by
// `rls-privacy-reviewer` on migration 047).
//
// 047 hardens six functions, and for three of them the hardening is an ALTER
// applied at a DISTANCE from the function's own definition:
//
//   023 defines enforce_dose_paired_event_same_pet   — no SECURITY DEFINER
//   041 defines enforce_diet_trial_food_same_pet     — no SECURITY DEFINER
//   047 ALTERs both to SECURITY DEFINER
//
// `CREATE OR REPLACE FUNCTION` **resets** `prosecdef` to INVOKER unless the
// replacement restates `SECURITY DEFINER`. So a future migration that fixes a
// typo in 023's guard by copying its body forward — the obvious, natural thing
// to do, and the body in 023 still reads `LANGUAGE plpgsql SET search_path = ''`
// with no security clause — would SILENTLY revert the flip. Nothing would fail.
// The only record of the intent would be a `COMMENT`, which no test reads.
//
// The same trap applies to the grants: `REVOKE` is likewise undone by a fresh
// `CREATE FUNCTION` (a new function gets PUBLIC EXECUTE by default), which is
// how `enforce_vet_document_pet_scope` ended up anon-executable through 044 and
// 045 in the first place.
//
// This is the same shape as `lib/storagePolicies.test.ts` — derive the live
// state by replay, assert the invariant, fail the build on drift — applied to
// function security instead of Storage policies. It is deliberately a REPLAY and
// not a snapshot of the live database: the point is that the repo's own
// migration history must be self-consistent, so a session working offline still
// gets the failure.
//
// WHAT IT CANNOT SEE: a change made by hand in the dashboard. That is the B-505
// class (a merged migration is not an applied one) and this test does not claim
// to cover it — `get_advisors` is the check for that, and it runs at deploy.
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

// Roles a CLIENT can actually hold. `service_role` is deliberately absent: it is
// the trusted server identity, it already bypasses RLS, and every one of these
// functions is reachable to it by design.
const CLIENT_ROLES = ['public', 'anon', 'authenticated'] as const;

interface Expectation {
  /** `prosecdef` — must the function run as its owner? */
  readonly definer: boolean;
  /** Must it carry an explicit `SET search_path`? */
  readonly pinned: boolean;
  /**
   * Client roles that must STILL hold EXECUTE. Everything in CLIENT_ROLES not
   * listed here must NOT. `[]` means "closed to every client role".
   */
  readonly execute: readonly string[];
  /** Why this posture — quoted in the failure message so a red build explains itself. */
  readonly why: string;
}

const EXPECTED: Readonly<Record<string, Expectation>> = {
  // ── B-520: the integrity triggers ─────────────────────────────────────────
  // DEFINER so the cross-table lookup is not RLS-filtered (the pre-047 INVOKER
  // form failed closed only by the accident of its NOT EXISTS polarity), and
  // revoked so the flip does not hand a `postgres`-privileged function to the
  // REST RPC surface. Trigger firing does not check EXECUTE, so the guard still
  // runs on every write.
  enforce_dose_paired_event_same_pet: {
    definer: true, pinned: true, execute: [],
    why: 'B-520 — DEFINER so the lookup is not RLS-filtered; revoked so it is not RPC-callable.',
  },
  enforce_diet_trial_food_same_pet: {
    definer: true, pinned: true, execute: [],
    why: 'B-520 — DEFINER so the lookup is not RLS-filtered; revoked so it is not RPC-callable.',
  },
  enforce_vet_document_pet_scope: {
    definer: true, pinned: true, execute: [],
    why: 'B-478 VF-1 made it DEFINER (its EXISTS→RAISE shape DID open a cross-account collision); B-520 revoked it.',
  },

  // ── B-403: the auth/utility functions ─────────────────────────────────────
  handle_new_user: {
    definer: true, pinned: true, execute: [],
    why: 'B-403 — SECURITY DEFINER on the signup path; must not be callable via /rest/v1/rpc with the committed anon key.',
  },
  set_updated_at: {
    // INVOKER by design — it only stamps NEW.updated_at and needs no elevation.
    // EXECUTE is intentionally NOT constrained: it is not DEFINER, so a call
    // buys nothing, and revoking it would be churn without a security claim.
    definer: false, pinned: true, execute: [...CLIENT_ROLES],
    why: 'B-403 — search_path pinned; stays INVOKER because it needs no elevation.',
  },
  record_ai_usage: {
    // The deliberate exception. `authenticated` EXECUTE is LOAD-BEARING: six Edge
    // Functions call this RPC with the caller's JWT, and every one treats an RPC
    // error as fail-open, so revoking it would silently disable every AI cap.
    definer: true, pinned: true, execute: ['authenticated'],
    why: 'B-403 — assessed and KEPT for authenticated (6 Edge Functions call it with the caller JWT and fail OPEN on error); anon/PUBLIC closed since 031.',
  },
};

// ── SQL lexing ───────────────────────────────────────────────────────────────

// Strip `--` and `/* */` comments while respecting single-quoted strings AND
// dollar-quoted bodies. Dollar-quoting is the part `lib/storagePolicies.test.ts`
// does not need and this test does: every function body here is `$$ … $$`, and
// 047's rollback section is a large block of commented-out SQL that would
// otherwise replay as if it were live — which is exactly the M4 failure that
// test documents, in a file that has far more commented SQL than live SQL.
function stripSqlComments(sql: string): string {
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const rest = sql.slice(i);

    // Dollar-quoted body: copy verbatim through the matching closing tag.
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }

    const c = sql[i];
    if (c === "'") {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop - 1;
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
      i++;
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

// Split on `;` at top level. A function body is full of them, so the same
// dollar-quote awareness is required here or every `CREATE FUNCTION` shatters.
function statements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < sql.length; i++) {
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      i = (end === -1 ? sql.length : end + tag.length) - 1;
      continue;
    }
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1);
      i = (end === -1 ? sql.length : end) ;
      continue;
    }
    if (sql[i] === ';') {
      out.push(sql.slice(start, i));
      start = i + 1;
    }
  }
  out.push(sql.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// ── The replay ───────────────────────────────────────────────────────────────

interface State {
  definer: boolean;
  pinned: boolean;
  execute: Set<string>;
  lastTouchedBy: string;
}

const NAMES = Object.keys(EXPECTED);
const nameAlt = NAMES.join('|');

const CREATE_RE = new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?(${nameAlt})\\s*\\(`, 'i');
const ALTER_RE = new RegExp(`\\bALTER\\s+FUNCTION\\s+(?:public\\.)?(${nameAlt})\\s*\\(`, 'i');
const GRANT_RE = new RegExp(`\\bGRANT\\s+(.+?)\\s+ON\\s+FUNCTION\\s+(?:public\\.)?(${nameAlt})\\s*\\(`, 'is');
const REVOKE_RE = new RegExp(`\\bREVOKE\\s+(.+?)\\s+ON\\s+FUNCTION\\s+(?:public\\.)?(${nameAlt})\\s*\\(`, 'is');

// The role list of a GRANT … TO / REVOKE … FROM, normalised. `PUBLIC` is the
// pseudo-role every other role inherits, so it is tracked under the same name
// CLIENT_ROLES uses.
function rolesIn(stmt: string, keyword: 'TO' | 'FROM'): string[] {
  const m = new RegExp(`\\b${keyword}\\s+([^;]+)$`, 'is').exec(stmt);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((r) => r.trim().toLowerCase().replace(/["']/g, ''))
    .filter((r) => (CLIENT_ROLES as readonly string[]).includes(r));
}

function replay(): Map<string, State> {
  const live = new Map<string, State>();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));

    for (const stmt of statements(sql)) {
      const create = CREATE_RE.exec(stmt);
      if (create) {
        const name = create[1].toLowerCase();
        const prior = live.get(name);
        live.set(name, {
          // The whole point: a replacement that omits SECURITY DEFINER RESETS it.
          definer: /\bSECURITY\s+DEFINER\b/i.test(stmt),
          pinned: /\bSET\s+search_path\s*(?:=|\bTO\b)/i.test(stmt),
          // CREATE OR REPLACE preserves grants; a first CREATE gets the
          // PUBLIC-EXECUTE default that Postgres hands every new function.
          execute: prior ? new Set(prior.execute) : new Set(CLIENT_ROLES),
          lastTouchedBy: file,
        });
        continue;
      }

      const alter = ALTER_RE.exec(stmt);
      if (alter) {
        const name = alter[1].toLowerCase();
        const s = live.get(name);
        if (!s) continue;
        if (/\bSECURITY\s+DEFINER\b/i.test(stmt)) s.definer = true;
        if (/\bSECURITY\s+INVOKER\b/i.test(stmt)) s.definer = false;
        if (/\bSET\s+search_path\s*(?:=|\bTO\b)/i.test(stmt)) s.pinned = true;
        if (/\bRESET\s+search_path\b/i.test(stmt)) s.pinned = false;
        s.lastTouchedBy = file;
        continue;
      }

      const revoke = REVOKE_RE.exec(stmt);
      if (revoke) {
        const s = live.get(revoke[2].toLowerCase());
        if (!s) continue;
        for (const role of rolesIn(stmt, 'FROM')) {
          s.execute.delete(role);
          // Revoking from PUBLIC removes the grant every role inherited through
          // it — it does not survive as an implicit grant to anon/authenticated.
          if (role === 'public') { s.execute.delete('anon'); s.execute.delete('authenticated'); }
        }
        s.lastTouchedBy = revoke ? s.lastTouchedBy : s.lastTouchedBy;
        continue;
      }

      const grant = GRANT_RE.exec(stmt);
      if (grant) {
        const s = live.get(grant[2].toLowerCase());
        if (!s) continue;
        for (const role of rolesIn(stmt, 'TO')) s.execute.add(role);
      }
    }
  }
  return live;
}

const live = replay();

// ── Assertions ───────────────────────────────────────────────────────────────

describe('migration replay finds every guarded function', () => {
  // If a rename or a regex slip made the replay match nothing, every posture
  // assertion below would vacuously "pass" against an absent entry. This is the
  // canary — same role M6 plays in lib/storagePolicies.test.ts.
  it.each(NAMES)('%s is defined by some migration', (name) => {
    expect(live.get(name)).toBeDefined();
  });
});

describe('SECURITY DEFINER / search_path posture survives the whole migration history', () => {
  it.each(NAMES)('%s', (name) => {
    const s = live.get(name)!;
    const want = EXPECTED[name];

    expect({ definer: s.definer, pinned: s.pinned }).toEqual({
      definer: want.definer,
      pinned: want.pinned,
    });

    if (s.definer !== want.definer || s.pinned !== want.pinned) {
      throw new Error(`${name}: ${want.why} (last touched by ${s.lastTouchedBy})`);
    }
  });
});

describe('client-role EXECUTE is closed on every SECURITY DEFINER function', () => {
  it.each(NAMES)('%s', (name) => {
    const s = live.get(name)!;
    const want = EXPECTED[name];
    const got = [...s.execute].sort();
    const expected = [...want.execute].sort();

    expect({ fn: name, execute: got }).toEqual({ fn: name, execute: expected });
  });

  // Stated as its own case because it is the invariant, not an accident of the
  // table above: anything running as its owner must not be reachable from a
  // client role. `record_ai_usage` is the ONE deliberate exception, and it is
  // named here so adding a second requires editing this assertion on purpose.
  it('no SECURITY DEFINER function is client-callable except record_ai_usage', () => {
    const offenders = NAMES.filter(
      (n) => live.get(n)!.definer && live.get(n)!.execute.size > 0 && n !== 'record_ai_usage',
    );
    expect(offenders).toEqual([]);
  });

  it('record_ai_usage keeps authenticated EXECUTE — six Edge Functions fail OPEN without it', () => {
    const s = live.get('record_ai_usage')!;
    expect(s.execute.has('authenticated')).toBe(true);
    expect(s.execute.has('anon')).toBe(false);
    expect(s.execute.has('public')).toBe(false);
  });
});

describe('the replay itself', () => {
  // A guard on the guard. If dollar-quote handling regressed, 047's rollback
  // block — which contains `ALTER FUNCTION … SECURITY INVOKER` and
  // `GRANT EXECUTE … TO PUBLIC, anon, authenticated` as COMMENTS — would replay
  // as live and flip every expectation above. This asserts the stripper removes
  // commented SQL, so a red build points at the lexer rather than at the schema.
  it('does not replay commented-out SQL', () => {
    const stripped = stripSqlComments(
      readFileSync(join(MIGRATIONS_DIR, '047_pre_release_config_hardening.sql'), 'utf8'),
    );
    expect(stripped).not.toMatch(/SECURITY\s+INVOKER/i);
    expect(stripped).not.toMatch(/GRANT\s+EXECUTE[\s\S]{0,120}TO\s+PUBLIC/i);
  });

  it('keeps the live statements it is supposed to see', () => {
    const stripped = stripSqlComments(
      readFileSync(join(MIGRATIONS_DIR, '047_pre_release_config_hardening.sql'), 'utf8'),
    );
    expect(stripped).toMatch(/ALTER FUNCTION public\.enforce_dose_paired_event_same_pet\(\) SECURITY DEFINER/);
    expect(stripped).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_ai_usage\(TEXT, UUID\) TO authenticated/);
  });
});
