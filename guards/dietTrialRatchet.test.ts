import { readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Migration 069's ratchet, asserted on its BEHAVIOUR rather than its posture.
//
// WHY THIS EXISTS. `lib/functionHardening.test.ts` already pins 069's security
// posture (INVOKER, `search_path` pinned, no client EXECUTE) and that is real
// coverage — but it is the only thing in the repo that referenced this function,
// and posture is not behaviour. `rls-privacy-reviewer` made the gap concrete on
// CUL-1051 by running the mutation this file now forbids:
//
//   replace `RETURN NEW` with `RETURN NULL` in the INSERT branch
//
// 069 fires FIRST of the three triggers on `diet_trials` (alphabetically, ahead
// of `trg_diet_trials_updated_at` and `trg_diet_trials_visit_same_pet`). A BEFORE
// row trigger that returns NULL **silently cancels the write for every trigger
// after it**, so that one-word change made 066's cross-pet `vet_visit_id` guard
// stop running: a link the database refuses today inserted with no error at all.
// The posture test stays green through it, and so does every other suite —
// nothing else in the tree asserts what this function does.
//
// WHAT IT CANNOT SEE, stated because an undocumented blind spot reads as coverage
// (C-38). This reads the migration FILE, so it cannot see a change made by hand
// in the dashboard, and it cannot execute plpgsql — there is no Postgres in this
// test environment. It is a structural guard over the one mutation class that is
// both catastrophic and invisible, not a substitute for running the thing. The
// behavioural proof lives in CUL-1051's PR body, executed against production
// inside rolled-back transactions; if this repo ever gains a Postgres harness,
// that proof belongs here instead.
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATION = join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '069_diet_trials_initial_window_ratchet.sql',
);

const FN = 'enforce_diet_trial_initial_window_ratchet';

const sql = readFileSync(MIGRATION, 'utf8');

/** The `$$ … $$` body of the ratchet function, with nothing around it. */
function functionBody(): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${FN}()`);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('AS $$', start);
  expect(open).toBeGreaterThanOrEqual(0);
  const close = sql.indexOf('$$;', open);
  expect(close).toBeGreaterThan(open);
  return sql.slice(open + 'AS $$'.length, close);
}

/** Comments stripped, so a `RETURN NULL` written ABOUT the rule is not a hit. */
function code(body: string): string {
  return body
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

describe('migration 069 — the ratchet function is structurally present', () => {
  it('defines the function, and the file is not empty of it', () => {
    // Non-vacuity floor: every assertion below slices this body, so a rename or
    // a deleted migration must fail HERE rather than pass over an empty string.
    const body = code(functionBody());
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain('TG_OP');
  });

  it('is a BEFORE INSERT OR UPDATE row trigger on diet_trials', () => {
    // BEFORE is what lets it correct NEW at all; INSERT OR UPDATE is the scope
    // ruled for CUL-1051 (the INSERT half stamps, the UPDATE half ratchets).
    expect(sql).toMatch(
      /CREATE TRIGGER trg_diet_trials_initial_ratchet\s+BEFORE INSERT OR UPDATE ON diet_trials\s+FOR EACH ROW EXECUTE FUNCTION enforce_diet_trial_initial_window_ratchet\(\)/,
    );
  });
});

describe('migration 069 — no path may cancel the write (the mutation that disarms 066)', () => {
  it('never returns NULL', () => {
    // THE ASSERTION THIS FILE EXISTS FOR. A BEFORE row trigger returning NULL
    // cancels the operation for every later trigger, and 069 fires first.
    expect(code(functionBody())).not.toMatch(/\bRETURN\s+NULL\b/i);
  });

  it('returns NEW on every branch — one per TG_OP path', () => {
    // Three paths: INSERT, UPDATE-with-a-value (the ratchet), UPDATE-with-NULL
    // (the establishing branch). Each must hand the row on.
    const returns = code(functionBody()).match(/\bRETURN\s+NEW\b/gi) ?? [];
    expect(returns).toHaveLength(3);
  });

  it('the last statement before END is RETURN NEW, so no path falls through', () => {
    // plpgsql does not require a trailing RETURN in a trigger function; falling
    // off the end returns NULL, which is the same cancellation by another route.
    const body = code(functionBody()).trimEnd();
    expect(body).toMatch(/RETURN\s+NEW\s*;\s*END\s*;\s*$/i);
  });
});

describe('migration 069 — the correction stays observable', () => {
  it('logs a refused change, guarded so the no-change path is silent', () => {
    // The assign is unconditional, so every later trigger sees NEW = OLD on this
    // column and a refusal is otherwise invisible to any audit. The guard matters
    // as much as the log: PostgREST re-sends the column unchanged on a conflict,
    // and logging that would be noise on every sync.
    const body = code(functionBody());
    expect(body).toMatch(/IF\s+NEW\.target_duration_days_initial\s+IS DISTINCT FROM\s+OLD\.target_duration_days_initial\s+THEN/i);
    expect(body).toMatch(/RAISE\s+LOG/i);
  });

  it('the log names only NEW.* values (C-31)', () => {
    // A BEFORE trigger fires before RLS. This one reads no other row, but the
    // rule is about what the MESSAGE carries: only the caller's own id and the
    // value they themselves sent, never OLD.* or anything looked up.
    //
    // ⚠ The obvious form of this assertion, `/RAISE\s+LOG[^;]*;/`, is GREEN OVER
    // NOTHING and was caught by mutating an argument to OLD.*: the message
    // literal itself contains a `;`, so the character class terminates INSIDE the
    // string and the captured slice never reaches the arguments — which is the
    // only place a leak could be. The statement has to be scanned with the quote
    // state tracked, exactly as `guards/blankComments.ts` does for the same
    // reason (a delimiter inside a literal is not a delimiter).
    const body = code(functionBody());
    const at = body.search(/\bRAISE\s+LOG\b/i);
    expect(at).toBeGreaterThanOrEqual(0);

    let inQuote = false;
    let end = -1;
    for (let i = at; i < body.length; i++) {
      const c = body[i];
      if (c === "'") {
        // '' is an escaped quote inside a literal, not a close.
        if (inQuote && body[i + 1] === "'") { i++; continue; }
        inQuote = !inQuote;
        continue;
      }
      if (c === ';' && !inQuote) { end = i; break; }
    }
    expect(end).toBeGreaterThan(at);

    const statement = body.slice(at, end + 1);
    // Non-vacuity: the slice must actually reach the arguments, or this proves
    // nothing. The args sit after the message literal's closing quote.
    expect(statement).toMatch(/\bNEW\.id\b/);
    expect(statement).not.toMatch(/\bOLD\./);
  });
});

describe('migration 069 — the grants are re-issued beside the definition', () => {
  it('revokes EXECUTE from every client role', () => {
    // `CREATE OR REPLACE FUNCTION` restores PUBLIC EXECUTE, so these must live in
    // the same migration as the body, not at a distance. This duplicates what
    // lib/functionHardening.test.ts derives by replay, deliberately: that test
    // proves the END STATE across history, this one proves THIS FILE is
    // self-contained and can be re-applied without opening a hole.
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.${FN}() FROM ${role};`,
      );
    }
  });

  it('is not SECURITY DEFINER', () => {
    // It reads nothing, so elevation would be privilege with no purpose — and a
    // DEFINER trigger that raises is the CUL-867/C-31 cross-account oracle class.
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${FN}()`);
    const header = sql.slice(start, sql.indexOf('AS $$', start));
    expect(header).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(header).toMatch(/SET search_path = ''/);
  });
});
