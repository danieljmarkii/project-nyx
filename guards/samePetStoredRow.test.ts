import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-2064 (migration 108): a same-pet guard must pass a row it already stores.
// The sync push is INSERT ... ON CONFLICT (id) DO UPDATE, and PostgreSQL fires
// the BEFORE INSERT trigger on the proposed row before it finds the conflict, so
// a guard's INSERT arm runs on EVERY push. A guard that re-judges the parent
// there bricks the row for good once the parent moves pet or changes type (C-38):
// measured on a PG16 replay, 11 of 11 unchanged-row edits refused 23514 across
// the four guards below before 108, 0 after (the PR records the 45-case probe).
//
// For each guard of the class, the LAST definition in filename order is the
// live one, and it must keep all three arms:
//   * the caller arm (auth.uid(), the caller's own pet) in front of every read,
//     so the stored-row read answers nothing about another account's rows;
//   * the stored-row arm: on INSERT, this row already stored, keyed by NEW.id
//     and the row's identity columns, read from the guard's own table;
//   * the UPDATE arm reads nothing while the identity is unchanged
//     (IS NOT DISTINCT FROM OLD on the identity columns).
// And one RAISE naming only NEW.* values (C-31).
//
// WHAT IT DOES NOT CLAIM (C-38: an unstated blind spot reads as coverage):
//   * It reads the migration files, not production. A hand edit in the
//     dashboard is the B-505 class; 108's VERIFY block and get_advisors cover it.
//   * It pins shape, not behaviour. The behaviour is the probe in the PR.
//   * It lists the class as of 108. A NEW guard of the shape (a child's INSERT
//     arm that reads its parent) is not discovered here; the registry below is
//     the class, and a new member is added to it the PR it ships.
//   * 066/067's enforce_vet_visit_link_same_pet is not in the class: its parent
//     (vet_visits.pet_id) is frozen by 067 and has no type, so an unchanged row
//     always passes again. 074's server-written guard is out too: every upsert
//     sends the event's current pet_id. Both are named here so their absence is
//     a decision, not an omission.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

interface Guard {
  readonly fn: string;
  readonly table: string;
  /** Identity columns the stored-row arm keys on. */
  readonly identity: readonly string[];
  /** Columns the UPDATE arm compares with OLD before it reads anything. */
  readonly updateKeys: readonly string[];
  /**
   * Must the stored-row read lock the row it matches (FOR KEY SHARE)? Without
   * it, an owner's DELETE (or key change) raced against an upsert of the old id
   * let the upsert pass on the committed row and then INSERT a fresh one on the
   * moved parent: measured on the replay, 1 row minted per table with the lock
   * removed, 0 with it. 105 is false: meal_components has no DELETE grant and a
   * frozen id, so the race has no first half there.
   */
  readonly keyLock: boolean;
}

const CLASS: readonly Guard[] = [
  { fn: 'enforce_intake_check_same_pet', table: 'intake_checks', identity: ['id', 'pet_id', 'event_id', 'since', 'form'], updateKeys: ['id', 'pet_id', 'event_id', 'since', 'form'], keyLock: true },
  { fn: 'enforce_look_paired_event_same_pet', table: 'looks', identity: ['id', 'pet_id', 'event_id', 'local_day'], updateKeys: ['id', 'pet_id', 'event_id', 'local_day'], keyLock: true },
  { fn: 'enforce_diet_trial_food_same_pet', table: 'diet_trial_foods', identity: ['id', 'pet_id', 'diet_trial_id'], updateKeys: ['id', 'pet_id', 'diet_trial_id'], keyLock: true },
  { fn: 'enforce_dose_paired_event_same_pet', table: 'medication_administrations', identity: ['id', 'pet_id', 'paired_event_id'], updateKeys: ['id', 'pet_id', 'paired_event_id'], keyLock: true },
  { fn: 'enforce_meal_component_same_pet', table: 'meal_components', identity: ['id', 'pet_id', 'event_id', 'position'], updateKeys: ['id', 'pet_id', 'event_id', 'position'], keyLock: false },
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

describe('same-pet guards pass a row they already store (CUL-2064)', () => {
  const sql = allMigrations();

  it.each(['diet_trial_foods', 'medication_administrations'])(
    'anon holds no verb on %s, so the user-less caller arm admits only the trusted server',
    (table) => {
      // The caller arm skips any request with no user. The anon key carries none,
      // so with an anon grant in place an anon POST reads 42501 for a real parent
      // and 23514 for a made-up one (rls-privacy-reviewer on 108). Replay the
      // grants in order: the LAST statement touching anon on the table is the revoke.
      const grants = [
        ...sql.matchAll(new RegExp(`\\b(GRANT|REVOKE)\\s[^;]*?\\bON\\s+(?:TABLE\\s+)?(?:public\\.)?${table}\\b[^;]*?\\b(?:TO|FROM)\\s+[^;]*\\banon\\b[^;]*;`, 'gi')),
      ];
      expect(grants.length).toBeGreaterThan(0);
      expect(grants[grants.length - 1][0]).toBe(`REVOKE ALL ON TABLE public.${table} FROM anon;`);
    },
  );

  describe.each(CLASS)('$fn', ({ fn, table, identity, updateKeys, keyLock }) => {
    const body = liveBody(sql, fn);

    it('keeps its one RAISE (non-vacuity: the body was found)', () => {
      // String-aware: a message may hold a `;` (105's does).
      const raises = [...body.matchAll(/RAISE EXCEPTION((?:'(?:[^']|'')*'|[^;'])*);/g)];
      expect(raises).toHaveLength(1);
      expect(raises[0][1]).toMatch(/USING ERRCODE = 'check_violation'/);
      // C-31: the format arguments are NEW.* only.
      const args = raises[0][1].replace(/'(?:[^']|'')*'/g, '').replace(/USING[\s\S]*$/, '');
      for (const arg of args.split(',').map((a) => a.trim()).filter(Boolean)) {
        expect(arg).toMatch(/^NEW\.\w+$/);
      }
    });

    it('binds the caller and checks the caller\'s pet', () => {
      expect(body).toMatch(/me\s+uuid := auth\.uid\(\);/);
      expect(body).toMatch(/me IS NULL\s+OR\s+(?:EXISTS \(SELECT 1 FROM public\.pets p\s+WHERE p\.id = NEW\.pet_id AND )?p\.user_id = me/);
    });

    it('passes an INSERT that is this row already stored, keyed on its identity', () => {
      const read = new RegExp(`FROM public\\.${table} (\\w+)\\s+WHERE ([\\s\\S]*?)\\)`).exec(body);
      expect(read).not.toBeNull();
      const [, alias, where] = read as RegExpExecArray;
      for (const col of identity) {
        expect(where).toMatch(new RegExp(`\\b${alias}\\.${col} = NEW\\.${col}\\b`));
      }
      if (keyLock) expect(where).toMatch(/\bFOR KEY SHARE\s*$/);
    });

    it('reads nothing on an UPDATE that leaves the identity unchanged', () => {
      // A frozen identity (097, 105) or the reference and scope that may change
      // (064, 041, 023), compared with IS NOT DISTINCT FROM OLD before any read.
      const firstRead = body.search(/FROM public\./);
      const head = body.slice(0, firstRead);
      expect(head).toMatch(/TG_OP = 'UPDATE'/);
      for (const col of updateKeys) {
        expect(head).toMatch(new RegExp(`NEW\\.${col}\\s+IS NOT DISTINCT FROM OLD\\.${col}`));
      }
    });

    it('reads its own table only after the caller arm', () => {
      const caller = body.search(/p\.user_id = me/);
      const stored = body.search(new RegExp(`FROM public\\.${table}\\b`));
      expect(caller).toBeGreaterThan(-1);
      expect(stored).toBeGreaterThan(caller);
    });
  });
});
