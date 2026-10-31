import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { stripSqlComments } from './sqlComments';

// CUL-283 (migration 110): the vet_reports policy rewrite. Before 110 the one
// policy was FOR ALL USING (auth.uid() = generated_by) with no WITH CHECK, so
// any signed-in account could insert a row naming another account's pet and a
// storage_path of its choosing, then edit or extend it. Measured on a PG16
// replay of 001 to 109 (the PR records the probe). Vet report v2 keeps a saved
// copy of every report sent there, so this pins the shape 110 leaves:
//
//   * live policies: exactly a SELECT and an UPDATE, both TO authenticated,
//     pet ownership through pets.user_id, and the UPDATE checks it in WITH CHECK
//     too. No INSERT, DELETE or FOR ALL policy, ever again, without editing this;
//   * grants: anon nothing; authenticated SELECT and UPDATE (token_expires_at);
//   * the storage_path CHECK is present, anchored, and starts at the row's pet;
//   * the client freeze is an allowlist of exactly token_expires_at and
//     updated_at, refuses an extension, names no value, and fires before the
//     updated_at stamp.
//
// For each object the LAST statement in filename order is the live one.
//
// MUTANTS, run against 110 on 2026-10-31 (each applied to the real file, the
// suite run, the file restored), all 31 killed (the five after the list are
// the second pass's N15, N3, N6, N7 and N8 spellings). The first 17 are the author's;
// R1 to R7 are the rls-privacy-reviewer's survivors of the first cut, which
// the exemption, CHECK, PUBLIC, DISABLE and role-list tests now pin:
//   ✗ a FOR INSERT policy added              ✗ the UPDATE's WITH CHECK dropped
//   ✗ the SELECT policy back to generated_by ✗ TO authenticated dropped
//   ✗ GRANT INSERT to authenticated          ✗ GRANT UPDATE table-wide
//   ✗ anon's REVOKE removed                  ✗ a schema-wide grant after it
//   ✗ the CHECK's '^' anchor dropped         ✗ the CHECK's '$' anchor dropped
//   ✗ the CHECK dropped later                ✗ share_token added to the allowlist
//   ✗ the extension test removed             ✗ a value formatted into the RAISE
//   ✗ the trigger renamed past updated_at    ✗ the trigger dropped later
//   ✗ the freeze made SECURITY DEFINER       ✗ R1 the exemption forced on
//   ✗ R2 the CHECK's middle loosened (-.*)   ✗ R3 GRANT SELECT ... TO PUBLIC
//   ✗ R4 DISABLE TRIGGER the freeze          ✗ R5 DISABLE ROW LEVEL SECURITY
//   ✗ R6 SELECT TO authenticated, anon       ✗ R7 exemption on current_user only
//   ✗ the session-role arm removed           ✗ DISABLE TRIGGER ALL
//
// WHAT IT DOES NOT CLAIM (C-38):
//   * It reads the migration files, not production. 110's VERIFY block and
//     get_advisors cover a hand edit in the dashboard.
//   * It pins shape, not behaviour. The behaviour is the probe in the PR.
//   * A policy or grant made through a DO block's EXECUTE is invisible here.
//   * Each mutant above is one spelling. Later-file forms it does NOT catch
//     (rls-privacy-reviewer, second pass, measured): a replacement freeze
//     written with a named dollar tag (`$function$`), which freezeBody skips;
//     a trigger declared `BEFORE INSERT OR UPDATE` that sorts ahead of the
//     freeze; `GRANT authenticated TO anon`; renaming the CHECK and dropping it
//     under its new name; renaming the table. ALTER POLICY, ALTER / DROP
//     FUNCTION on the freeze and ENABLE REPLICA / ALWAYS on its trigger ARE
//     refused, by the test that says so.
//   * VR2-7 (CUL-2287) adds columns and its own content freeze; when it names a
//     new control column it edits CONTROL below, which is the point.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const TABLE = String.raw`(?:public\.)?vet_reports\b`;
const OWNED = String.raw`pet_id IN \(SELECT p\.id FROM public\.pets p WHERE p\.user_id = \(SELECT auth\.uid\(\)\)\)`;
const CONTROL = ['token_expires_at', 'updated_at'];

function allMigrations(dir: string = MIGRATIONS_DIR): string {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(dir, f), 'utf8')))
    .join('\n');
}

/** Replays CREATE / DROP POLICY on vet_reports in order; the survivors with their text. */
function livePolicies(sql: string): Map<string, string> {
  const live = new Map<string, string>();
  const re = new RegExp(String.raw`\b(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+${TABLE}[^;]*;`, 'gi');
  for (const m of sql.matchAll(re)) {
    if (m[1].toUpperCase() === 'CREATE') live.set(m[2], m[0].replace(/\s+/g, ' '));
    else live.delete(m[2]);
  }
  return live;
}

/** Every GRANT / REVOKE on vet_reports naming the role, in order. */
function grantsFor(sql: string, role: string): string[] {
  const re = new RegExp(String.raw`\b(?:GRANT|REVOKE)\s[^;]*?\bON\s+(?:TABLE\s+)?${TABLE}[^;]*?\b(?:TO|FROM)\s+[^;]*\b${role}\b[^;]*;`, 'gi');
  return [...sql.matchAll(re)].map((m) => m[0].replace(/\s+/g, ' '));
}

function lastIndexOf(sql: string, re: RegExp): number {
  let at = -1;
  for (const m of sql.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) at = m.index ?? at;
  return at;
}

function freezeBody(sql: string): { header: string; body: string } {
  const defs = [
    ...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.vet_reports_client_freeze\(\)([\s\S]*?)\$\$([\s\S]*?)\$\$;/g),
  ];
  expect(defs.length).toBeGreaterThan(0);
  const last = defs[defs.length - 1];
  return { header: last[1], body: last[2].replace(/--[^\n]*/g, '') };
}

describe('vet_reports policy rewrite (CUL-283, migration 110)', () => {
  const sql = allMigrations();

  it('leaves exactly an owner SELECT and an owner UPDATE', () => {
    const live = livePolicies(sql);
    expect([...live.keys()].sort()).toEqual(['vet_reports_select_owner', 'vet_reports_update_owner']);
    for (const text of live.values()) {
      expect(text).not.toMatch(/\bFOR\s+(?:ALL|INSERT|DELETE)\b/i);
      // Exactly one role: `TO authenticated, anon` would reach anon the day a
      // grant does.
      expect(text).toMatch(/\bTO authenticated (?:USING|WITH CHECK)\b/);
      expect(text).not.toMatch(/generated_by/);
    }
  });

  it('binds the SELECT to the caller\'s pets', () => {
    const text = livePolicies(sql).get('vet_reports_select_owner') ?? '';
    expect(text).toMatch(/\bFOR SELECT\b/);
    expect(text).toMatch(new RegExp(String.raw`USING \( ${OWNED} \)`));
  });

  it('checks pet ownership on the UPDATE in USING and in WITH CHECK', () => {
    const text = livePolicies(sql).get('vet_reports_update_owner') ?? '';
    expect(text).toMatch(/\bFOR UPDATE\b/);
    expect(text).toMatch(new RegExp(String.raw`USING \( ${OWNED} \) WITH CHECK \( ${OWNED} \)`));
  });

  it('gives anon nothing', () => {
    const anon = grantsFor(sql, 'anon');
    expect(anon[anon.length - 1]).toBe('REVOKE ALL ON TABLE public.vet_reports FROM anon;');
  });

  it('never grants to PUBLIC, which reaches anon', () => {
    expect(grantsFor(sql, 'PUBLIC').filter((g) => /^GRANT\b/i.test(g))).toEqual([]);
  });

  it('gives authenticated SELECT and UPDATE (token_expires_at) only', () => {
    const authed = grantsFor(sql, 'authenticated');
    const reset = authed.lastIndexOf('REVOKE ALL ON TABLE public.vet_reports FROM authenticated;');
    expect(reset).toBeGreaterThan(-1);
    expect(authed.slice(reset + 1)).toEqual([
      'GRANT SELECT ON TABLE public.vet_reports TO authenticated;',
      'GRANT UPDATE (token_expires_at) ON TABLE public.vet_reports TO authenticated;',
    ]);
  });

  it('has no schema-wide grant to a client role after the revokes', () => {
    const revoke = lastIndexOf(sql, /REVOKE ALL ON TABLE public\.vet_reports FROM authenticated;/);
    expect(revoke).toBeGreaterThan(-1);
    expect(sql.slice(revoke)).not.toMatch(
      /\bGRANT\s[^;]*\bON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\b[^;]*\bTO\s+[^;]*\b(?:anon|authenticated)\b/i,
    );
  });

  it('keeps RLS and the freeze switched on after 110', () => {
    const create = lastIndexOf(sql, /CREATE TRIGGER trg_vet_reports_client_freeze\b/);
    expect(create).toBeGreaterThan(-1);
    const after = sql.slice(create);
    const alter = new RegExp(String.raw`ALTER TABLE\s+(?:ONLY\s+)?${TABLE}[^;]*?\b(?:DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+TRIGGER\s+(?:ALL|USER|trg_vet_reports_client_freeze))\b`, 'i');
    expect(after).not.toMatch(alter);
    expect(sql).toMatch(new RegExp(String.raw`ALTER TABLE\s+${TABLE}\s+ENABLE ROW LEVEL SECURITY`, 'i'));
  });

  it('never alters a policy, or alters or drops the freeze function, in place', () => {
    // The live text is the CREATE the replay above reads; an ALTER would change
    // it where this file does not look. A later file that needs a change drops
    // and recreates the policy, or CREATE OR REPLACEs the function.
    expect(sql).not.toMatch(new RegExp(String.raw`\bALTER\s+POLICY\s+"?\w+"?\s+ON\s+${TABLE}`, 'i'));
    expect(sql).not.toMatch(/\b(?:ALTER|DROP)\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?vet_reports_client_freeze\b/i);
    expect(sql).not.toMatch(/\bENABLE\s+(?:REPLICA|ALWAYS)\s+TRIGGER\s+trg_vet_reports_client_freeze\b/i);
  });

  it('keeps the whole-shape storage_path CHECK, anchored at the row\'s pet', () => {
    const add = lastIndexOf(sql, /ADD CONSTRAINT vet_reports_storage_path_shape CHECK/);
    expect(add).toBeGreaterThan(-1);
    expect(sql.slice(add)).not.toMatch(/DROP CONSTRAINT (?:IF EXISTS )?vet_reports_storage_path_shape\b/);
    const check = sql.slice(add, sql.indexOf(';', add));
    // The whole pattern, verbatim: a looser middle (`-.*`) brings traversal back.
    expect(check.replace(/\s+/g, ' ')).toContain(
      "storage_path ~ ( '^' || pet_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(html|pdf)$' )",
    );
  });

  it('freezes every column but the control set, and only lets the expiry move earlier', () => {
    const { header, body } = freezeBody(sql);
    expect(header).toMatch(/SECURITY INVOKER/);
    expect(header).toMatch(/SET search_path = ''/);
    const control = /control text\[\] := ARRAY\[([^\]]*)\];/.exec(body);
    expect(control).not.toBeNull();
    expect((control?.[1] ?? '').split(',').map((c) => c.trim().replace(/'/g, ''))).toEqual(CONTROL);
    // The exemption, verbatim: all three must hold to skip the freeze. The
    // session role is what a SECURITY DEFINER function called by anon cannot
    // hide (there current_user is the owner).
    expect(body.replace(/\s+/g, ' ')).toContain(
      "IF auth.uid() IS NULL AND current_user NOT IN ('anon', 'authenticated') AND coalesce(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;",
    );
    expect(body.match(/RETURN NEW;/g)?.length).toBe(2);
    // The whole condition through THEN: a weakened bound (`> OLD + interval`)
    // must not pass as a prefix match.
    expect(body.replace(/\s+/g, ' ')).toContain(
      'IF (to_jsonb(NEW) - control) IS DISTINCT FROM (to_jsonb(OLD) - control) OR NEW.token_expires_at > OLD.token_expires_at THEN',
    );
  });

  it('names no value in its RAISE (C-31)', () => {
    const { body } = freezeBody(sql);
    const raises = [...body.matchAll(/RAISE EXCEPTION\s*('(?:[^']|'')*')\s*([^;]*);/g)];
    expect(raises.length).toBe(1);
    expect(raises[0][1]).not.toMatch(/%/);
    expect(raises[0][2].trim()).toBe("USING ERRCODE = 'check_violation'");
  });

  it('binds the freeze ahead of the updated_at stamp', () => {
    const create = lastIndexOf(sql, /CREATE TRIGGER trg_vet_reports_client_freeze\s+BEFORE UPDATE ON public\.vet_reports\s+FOR EACH ROW EXECUTE FUNCTION public\.vet_reports_client_freeze\(\);/);
    expect(create).toBeGreaterThan(-1);
    expect(sql.slice(create)).not.toMatch(/DROP TRIGGER (?:IF EXISTS )?trg_vet_reports_client_freeze\b/);
    // Same-event triggers fire in name order: the freeze sorts before every
    // other BEFORE UPDATE trigger on the table, so it judges the client's row.
    const others = [...sql.matchAll(/CREATE TRIGGER (\w+)\s+BEFORE UPDATE ON (?:public\.)?vet_reports\b/g)]
      .map((m) => m[1])
      .filter((n) => n !== 'trg_vet_reports_client_freeze');
    expect(others).toContain('trg_vet_reports_updated_at');
    for (const name of others) expect('trg_vet_reports_client_freeze' < name).toBe(true);
  });
});
