import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-1457 (migration 083): the looks same-pet guard checks the caller's pet
// BEFORE it reads the parent event. Without that order, a write naming another
// account's real (pet, check_in) pair passes the trigger on the three days
// around the parent's UTC date and is refused by RLS (42501), and refused here
// (23514) on every other day: the code leaks the parent's date. Proven on a PG16
// replay before and after 083 (the PR records the sweep). The LAST definition in
// filename order is the live one, so a later CREATE OR REPLACE that drops the
// arm, moves the lookup above it, or re-grants looks to anon, reds here.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

function allMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
    .join('\n');
}

function liveDefinition(): string {
  const sql = allMigrations();
  const defs = [
    ...sql.matchAll(/CREATE OR REPLACE FUNCTION (?:public\.)?enforce_look_paired_event_same_pet\(\)[\s\S]*?\$\$;/g),
  ];
  // Non-vacuity: 064 and 083 both define it.
  expect(defs.length).toBeGreaterThanOrEqual(2);
  return defs[defs.length - 1][0];
}

describe('enforce_look_paired_event_same_pet (CUL-1457)', () => {
  let live = '';
  beforeAll(() => {
    live = liveDefinition();
  });

  it('binds the caller from auth.uid()', () => {
    expect(live).toMatch(/me\s+uuid := auth\.uid\(\);/);
  });

  it('reads the parent only inside the ownership arm', () => {
    const arm = /IF me IS NULL\s+OR EXISTS \(SELECT 1 FROM public\.pets p\s+WHERE p\.id = NEW\.pet_id AND p\.user_id = me\) THEN([\s\S]*?)END IF;/.exec(live);
    expect(arm).not.toBeNull();
    expect((arm as RegExpExecArray)[1]).toMatch(/FROM public\.events e/);
    // Exactly one events read in the body, and it is the one inside the arm.
    expect(live.match(/FROM public\.events\b/g)).toHaveLength(1);
  });

  it('keeps one RAISE that names only NEW.* values (C-31)', () => {
    const raises = [...live.matchAll(/RAISE EXCEPTION([\s\S]*?);/g)];
    expect(raises).toHaveLength(1);
    const args = raises[0][1].replace(/'[^']*'/g, '');
    expect(args).not.toMatch(/parent_day/);
    expect(raises[0][1]).toMatch(/USING ERRCODE = 'check_violation'/);
  });

  it('anon holds no verb on looks, so the user-less arm admits only the trusted server', () => {
    // The arm trusts every request with no user. The anon key carries none, so with
    // an anon grant left in place an anon POST reads the parent and RLS answers
    // 42501 inside the band, 23514 outside: the oracle again, with no account
    // (rls-privacy-reviewer on 083's PR). Replay the grants in order: the LAST
    // statement touching anon on looks must be the revoke.
    const sql = allMigrations();
    const grants = [
      ...sql.matchAll(/\b(GRANT|REVOKE)\s[^;]*?\bON\s+(?:TABLE\s+)?(?:public\.)?looks\b[^;]*?\b(?:TO|FROM)\s+[^;]*\banon\b[^;]*;/gi),
    ];
    expect(grants.length).toBeGreaterThan(0);
    expect(grants[grants.length - 1][0]).toMatch(/^REVOKE ALL ON TABLE public\.looks FROM anon;$/);
  });

  it('keeps the B-520 posture', () => {
    expect(live).toMatch(/SECURITY DEFINER/);
    expect(live).toMatch(/SET search_path = ''/);
  });
});
