import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-2105 (migration 109): a DEFINER same-pet guard asks who the caller is
// before it reads anything. A BEFORE trigger runs ahead of RLS WITH CHECK and,
// under SECURITY DEFINER, its lookup sees every tenant. Without the caller arm,
// another account naming a victim's pet and a vet visit (or a document group)
// learned from the error code whether the two belong together: 42501 from RLS
// for a real pair, 23514 from the guard for a made-up one. Measured on a PG16
// replay before 109 on all four tables below, as another account and as anon;
// after 109, one 23514 for the account and 42501 permission denied for anon
// (the PR records the 48-case probe).
//
// For each guard, the LAST definition in filename order is the live one, and:
//   * it binds the caller (auth.uid()) and checks the row's pet is the
//     caller's, ahead of every read of another table and every lock;
//   * anon holds no verb on the tables it guards, because the caller arm cannot
//     tell the anon key (no user) from the service role (no user).
//
// WHAT IT DOES NOT CLAIM (C-38: an unstated blind spot reads as coverage):
//   * It reads the migration files, not production. 109's VERIFY block and
//     get_advisors cover a hand edit in the dashboard (the B-505 class).
//   * It pins shape, not behaviour. The behaviour is the probe in the PR.
//   * It lists the two guards 109 fixed. 108's five live in
//     samePetStoredRow.test.ts, 082's in careRecord.test.ts. A NEW DEFINER guard
//     is not discovered here; it joins a registry the PR it ships.
//   * The planner's order inside one EXISTS: enforce_vet_visit_link_same_pet
//     reads pets and vet_visits in one statement, so "caller first" is the
//     textual order, not an execution guarantee. It takes no lock, so the most
//     it can leak is timing.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

interface Guard {
  readonly fn: string;
  readonly tables: readonly string[];
}

const GUARDS: readonly Guard[] = [
  { fn: 'enforce_vet_visit_link_same_pet', tables: ['medications', 'diet_trials', 'vet_appointments'] },
  { fn: 'enforce_vet_document_pet_scope', tables: ['vet_documents'] },
];

function allMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n');
}

/** The live body, with the comments inside it removed too (the stripper keeps $$ bodies verbatim). */
function liveBody(sql: string, fn: string): string {
  const defs = [
    ...sql.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${fn}\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, 'g')),
  ];
  expect(defs.length).toBeGreaterThan(0);
  return defs[defs.length - 1][1].replace(/--[^\n]*/g, '');
}

describe('vet visit and vet document guards answer a stranger once (CUL-2105)', () => {
  const sql = allMigrations();

  describe.each(GUARDS)('$fn', ({ fn, tables }) => {
    const body = liveBody(sql, fn);

    it('binds the caller and checks the caller\'s pet', () => {
      expect(body).toMatch(/me\s+uuid := auth\.uid\(\);/);
      expect(body).toMatch(/WHERE p\.id = NEW\.pet_id\s+AND (?:\(me IS NULL OR )?p\.user_id = me/);
    });

    it('checks the caller before it reads another table or takes a lock', () => {
      const caller = body.search(/p\.user_id = me/);
      expect(caller).toBeGreaterThan(-1);
      for (const read of [/FROM public\.vet_visits\b/, /FROM public\.vet_documents\b/, /pg_advisory_xact_lock/]) {
        const at = body.search(read);
        if (at > -1) expect(at).toBeGreaterThan(caller);
      }
      // Non-vacuity: every guard here reads vet_visits.
      expect(body.search(/FROM public\.vet_visits\b/)).toBeGreaterThan(caller);
    });

    it('names only NEW.* in every RAISE (C-31)', () => {
      const raises = [...body.matchAll(/RAISE EXCEPTION((?:'(?:[^']|'')*'|[^;'])*);/g)];
      expect(raises.length).toBeGreaterThan(0);
      for (const [, tail] of raises) {
        expect(tail).toMatch(/USING ERRCODE = 'check_violation'/);
        const args = tail.replace(/'(?:[^']|'')*'/g, '').replace(/USING[\s\S]*$/, '');
        for (const arg of args.split(',').map((a) => a.trim()).filter(Boolean)) {
          expect(arg).toMatch(/^NEW\.\w+$/);
        }
      }
    });

    it.each(tables)('anon holds no verb on %s', (table) => {
      // Replay the grants in order: the LAST statement touching anon on the
      // table is the revoke.
      const grants = [
        ...sql.matchAll(new RegExp(`\\b(GRANT|REVOKE)\\s[^;]*?\\bON\\s+(?:TABLE\\s+)?(?:public\\.)?${table}\\b[^;]*?\\b(?:TO|FROM)\\s+[^;]*\\banon\\b[^;]*;`, 'gi')),
      ];
      expect(grants.length).toBeGreaterThan(0);
      const revoke = grants[grants.length - 1];
      expect(revoke[0]).toBe(`REVOKE ALL ON TABLE public.${table} FROM anon;`);
      // A schema-wide grant names no table, so the replay above cannot see it:
      // none may follow the revoke (rls-privacy-reviewer on 109).
      const after = sql.slice((revoke.index ?? 0) + revoke[0].length);
      expect(after).not.toMatch(/\bGRANT\s[^;]*\bON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\b[^;]*\bTO\s+[^;]*\banon\b/i);
    });
  });
});
