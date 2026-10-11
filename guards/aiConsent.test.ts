// `ai_consent` (100, CUL-552, App Review 5.1.2(i)): the pins that keep the owner's answer
// the owner's, in the owner's words, at the database's time.
//
// WHAT THE RULES ARE (each a pin over the migration FILES, replayed in order, because a
// later migration that re-grants a verb or adds a policy would quietly undo what 100 set):
//   1. COLUMN GRANTS ONLY. A table-level `GRANT INSERT | UPDATE | ALL` to a client role
//      re-covers every column, `decided_at` included (032's maintenance warning, which
//      until now nothing enforced). And no column grant may name `decided_at`.
//   2. NO DELETE FOR CLIENTS. Withdrawal is `granted = false`. An erased row reads as
//      "never asked" and destroys the record that the owner said no. So no DELETE
//      policy, no `FOR ALL` policy, and no DELETE grant to a client role.
//   3. THE TRIGGER. `stamp_ai_consent_decided_at`'s body is pinned by equality (a
//      dropped key-freeze arm is the realistic regression: a PostgREST upsert needs the
//      key columns granted for UPDATE, so the trigger is the only thing keeping `scope`
//      from being relabelled), and its trigger must be live, BEFORE INSERT OR UPDATE.
//   4. NO DEFAULT ON `granted`. A default would let an insert that forgot the answer
//      record one, and absence must never read as yes.
//
// WHAT IT DOES NOT CLAIM (C-38: a blind spot left unstated reads as coverage):
//   · It cannot execute plpgsql or RLS. The behavioural proof (17 attacks: cross-account
//     insert and upsert, forged decided_at on insert and update, key moves, delete,
//     anon, the service-role plant, the cascade, and the key-freeze mutant) ran on a
//     PG16 replay and is recorded in the PR.
//   · It reads migration files, so a grant or policy changed by hand in the dashboard
//     (the B-505 class) is invisible here; `get_advisors` after apply covers that.
//   · `ALTER TABLE … DISABLE TRIGGER` and `ALTER DEFAULT PRIVILEGES` are matched only in
//     their plain spellings.

import * as fs from 'fs';
import * as path from 'path';

import { stripSqlComments } from './sqlComments';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const MIGRATION = '100_ai_consent.sql';
const TABLE = 'ai_consent';
const FN = 'stamp_ai_consent_decided_at';
const TRIGGER = 'trg_ai_consent_decided_at';
const CLIENT_ROLES = /\b(authenticated|anon|public)\b/i;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

const FN_BODY = squash(`
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
`);

/** The migration texts from 100 on, comments stripped, in apply order. */
function migrationsFrom100(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f >= MIGRATION)
    .sort()
    .map((f) => stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')));
}

const T = `(?:public\\.)?${TABLE}\\b`;

/** Rule 1: every GRANT on the table to a client role that is not a column-list grant, or
 *  whose column list names decided_at. */
export function findWideGrants(sqls: string[]): string[] {
  const out: string[] = [];
  const re = new RegExp(`GRANT\\s+([\\s\\S]*?)\\s+ON\\s+(?:TABLE\\s+)?${T}\\s+TO\\s+([^;]+);`, 'gi');
  for (const sql of sqls) {
    for (const m of sql.matchAll(re)) {
      if (!CLIENT_ROLES.test(m[2])) continue;
      // Split the privilege list into verbs, keeping each verb's column list with it.
      const privs = m[1].split(/,(?![^()]*\))/).map((p) => p.trim());
      for (const p of privs) {
        const cols = /\(([^)]*)\)/.exec(p);
        const verb = p.replace(/\([^)]*\)/, '').trim().toUpperCase();
        if (verb === 'SELECT' && !cols) continue; // the read is RLS's, not the grant's
        if (!cols || /\bdecided_at\b/i.test(cols[1])) out.push(squash(m[0]));
      }
    }
  }
  return out;
}

/** Rule 2: any client path to DELETE. */
export function findDeletePaths(sqls: string[]): string[] {
  const out: string[] = [];
  const policy = new RegExp(`CREATE\\s+POLICY\\s+[\\s\\S]*?ON\\s+${T}\\s+(?:AS\\s+\\w+\\s+)?FOR\\s+(DELETE|ALL)\\b[^;]*;`, 'gi');
  const grant = new RegExp(`GRANT\\s+([\\s\\S]*?)\\s+ON\\s+(?:TABLE\\s+)?${T}\\s+TO\\s+([^;]+);`, 'gi');
  for (const sql of sqls) {
    for (const m of sql.matchAll(policy)) out.push(squash(m[0]));
    for (const m of sql.matchAll(grant)) {
      if (CLIENT_ROLES.test(m[2]) && /\b(DELETE|ALL)\b/i.test(m[1])) out.push(squash(m[0]));
    }
  }
  return out;
}

interface TriggerState {
  body: string | null;
  live: boolean;
}

/** Rule 3: the function's last body, and whether its trigger is still live and BEFORE
 *  INSERT OR UPDATE. */
export function replayTrigger(sqls: string[]): TriggerState {
  const state: TriggerState = { body: null, live: false };
  for (const sql of sqls) {
    const events: { at: number; apply: () => void }[] = [];
    const on = (re: RegExp, apply: (m: RegExpMatchArray) => void) => {
      for (const m of sql.matchAll(re)) events.push({ at: m.index ?? 0, apply: () => apply(m) });
    };
    on(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${FN}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi'), (m) => {
      state.body = squash(m[1]);
    });
    on(new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${FN}\\b`, 'gi'), () => {
      state.body = null;
      state.live = false;
    });
    on(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+${TRIGGER}\\s+(BEFORE|AFTER)\\s+([\\w\\s]+?)\\s+ON\\s+${T}[\\s\\S]*?EXECUTE\\s+FUNCTION\\s+(?:public\\.)?(\\w+)`, 'gi'), (m) => {
      state.live = m[1].toUpperCase() === 'BEFORE' && /INSERT\s+OR\s+UPDATE/i.test(m[2]) && m[3] === FN;
    });
    on(new RegExp(`DROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${TRIGGER}\\b`, 'gi'), () => {
      state.live = false;
    });
    on(new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${T}\\s+DISABLE\\s+TRIGGER\\s+(${TRIGGER}|ALL)\\b`, 'gi'), () => {
      state.live = false;
    });
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return state;
}

/** Rule 4: does `granted` carry a DEFAULT anywhere (the CREATE, or a later ALTER)? */
export function grantedHasDefault(sqls: string[]): boolean {
  for (const sql of sqls) {
    const create = new RegExp(`CREATE\\s+TABLE\\s+${T}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql);
    if (create && /\bgranted\b[^,\n]*\bDEFAULT\b/i.test(create[1])) return true;
    if (new RegExp(`ALTER\\s+TABLE\\s+${T}[\\s\\S]*?ALTER\\s+(?:COLUMN\\s+)?granted\\s+SET\\s+DEFAULT`, 'i').test(sql)) return true;
  }
  return false;
}

describe('ai_consent — the owner\'s answer, at the database\'s time (CUL-552)', () => {
  const sqls = migrationsFrom100();

  it('reads the migration that creates the table (non-vacuity)', () => {
    expect(sqls.length).toBeGreaterThanOrEqual(1);
    expect(sqls[0]).toMatch(new RegExp(`CREATE\\s+TABLE\\s+${T}`, 'i'));
    // The grants rule 1 judges exist at all: two column-list grants to authenticated.
    expect(sqls[0].match(new RegExp(`GRANT\\s+(INSERT|UPDATE)\\s*\\([^)]*\\)\\s+ON\\s+${T}\\s+TO\\s+authenticated`, 'gi'))).toHaveLength(2);
  });

  it('rule 1: client roles get column grants only, and never decided_at', () => {
    expect(findWideGrants(sqls)).toEqual([]);
  });

  it('rule 2: no client path to DELETE', () => {
    expect(findDeletePaths(sqls)).toEqual([]);
  });

  it('rule 3: the stamp-and-freeze trigger is live with its pinned body', () => {
    const state = replayTrigger(sqls);
    expect(state.body).toBe(FN_BODY);
    expect(state.live).toBe(true);
  });

  it('rule 4: granted has no DEFAULT', () => {
    expect(grantedHasDefault(sqls)).toBe(false);
  });
});

// Each detector driven over the real migration text with one mutation applied: the
// mutant must red, the original must not (C-18). In memory, so nothing is written.
describe('ai_consent guard — mutants, each killed', () => {
  const base = migrationsFrom100();
  const plus = (extra: string) => [...base, extra];
  const mutate = (from: RegExp, to: string) => {
    const out = [...base];
    expect(from.test(out[0])).toBe(true);
    out[0] = out[0].replace(from, to);
    return out;
  };

  it('a later table-level re-grant reds rule 1', () => {
    expect(findWideGrants(plus('GRANT INSERT ON public.ai_consent TO authenticated;'))).toHaveLength(1);
    expect(findWideGrants(plus('GRANT ALL ON ai_consent TO authenticated;'))).toHaveLength(1);
  });

  it('decided_at added to a column grant reds rule 1', () => {
    expect(findWideGrants(plus('GRANT UPDATE (granted, decided_at) ON public.ai_consent TO authenticated;'))).toHaveLength(1);
  });

  it('a service_role grant is not a client grant', () => {
    expect(findWideGrants(plus('GRANT ALL ON public.ai_consent TO service_role;'))).toEqual([]);
  });

  it('a DELETE policy, a FOR ALL policy or a DELETE grant reds rule 2', () => {
    expect(findDeletePaths(plus('CREATE POLICY "x" ON public.ai_consent FOR DELETE TO authenticated USING (true);'))).toHaveLength(1);
    expect(findDeletePaths(plus('CREATE POLICY "x" ON public.ai_consent FOR ALL TO authenticated USING (true);'))).toHaveLength(1);
    expect(findDeletePaths(plus('GRANT DELETE ON public.ai_consent TO authenticated;'))).toHaveLength(1);
  });

  it('dropping the key-freeze arm reds rule 3', () => {
    const m = mutate(/IF TG_OP = 'UPDATE'[\s\S]*?END IF;/, '');
    expect(replayTrigger(m).body).not.toBe(FN_BODY);
  });

  it('a dropped, disabled or AFTER trigger reds rule 3', () => {
    expect(replayTrigger(plus('DROP TRIGGER trg_ai_consent_decided_at ON public.ai_consent;')).live).toBe(false);
    expect(replayTrigger(plus('ALTER TABLE public.ai_consent DISABLE TRIGGER trg_ai_consent_decided_at;')).live).toBe(false);
    expect(replayTrigger(mutate(/BEFORE INSERT OR UPDATE ON public\.ai_consent/, 'BEFORE INSERT ON public.ai_consent')).live).toBe(false);
  });

  it('a DEFAULT on granted reds rule 4', () => {
    expect(grantedHasDefault(mutate(/granted\s+BOOLEAN NOT NULL,/, 'granted BOOLEAN NOT NULL DEFAULT false,'))).toBe(true);
    expect(grantedHasDefault(plus('ALTER TABLE public.ai_consent ALTER COLUMN granted SET DEFAULT true;'))).toBe(true);
  });
});
