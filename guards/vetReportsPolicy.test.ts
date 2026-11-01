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
//     freeze (closed by 113's edit below); `GRANT authenticated TO anon`; renaming the CHECK and dropping it
//     under its new name; renaming the table. ALTER POLICY, ALTER / DROP
//     FUNCTION on the freeze and ENABLE REPLICA / ALWAYS on its trigger ARE
//     refused, by the test that says so.
//   * VR2-7 (CUL-2287, migration 113) edited this file: the storage_path CHECK
//     is now 113's row key, the freeze compares through oldj / newj so an FK's
//     ON DELETE SET NULL passes, and the trigger-order test reads INSERT OR
//     UPDATE triggers too (closing the blind spot named above). CONTROL is
//     unchanged: clients still move token_expires_at only.

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const TABLE = String.raw`(?:public\.)?vet_reports\b`;
const OWNED = String.raw`pet_id IN \(SELECT p\.id FROM public\.pets p WHERE p\.user_id = \(SELECT auth\.uid\(\)\)\)`;
const CONTROL = ['token_expires_at', 'updated_at'];

function allMigrations(dir: string = MIGRATIONS_DIR): string {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => stripSqlComments(readFileSync(join(dir, f), 'utf8')))
    .join('\n')
    // A quoted identifier is the same object ("vet_reports_no_live_token"): the
    // rls-privacy-reviewer's quoted DROP survived every pin before this.
    .replace(/"/g, '');
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
    ...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.vet_reports_client_freeze\(\)([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\2\$;/g),
  ];
  expect(defs.length).toBeGreaterThan(0);
  const last = defs[defs.length - 1];
  return { header: last[1], body: last[3].replace(/--[^\n]*/g, '') };
}

function lastFunctionIn(sql: string, name: string): { header: string; body: string } {
  // Any dollar tag: a `$function$` redefinition is the same redefinition.
  const defs = [...sql.matchAll(new RegExp(String.raw`CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?${name}\(\)([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\2\$;`, 'g'))];
  expect(defs.length).toBeGreaterThan(0);
  // Every redefinition must be one this reader can see. A single-quoted body
  // (AS 'BEGIN RETURN NULL; END') or a space before the parentheses slipped
  // past the pattern above and replaced the live body unread (CUL-2339,
  // rls-privacy-reviewer pass 2, M1 to M4); so does an overload that a
  // later CREATE TRIGGER could name instead.
  const any = sql.match(new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?${name}\s*\(`, 'gi')) ?? [];
  expect(any.length).toBe(defs.length);
  const last = defs[defs.length - 1];
  return { header: last[1], body: last[3].replace(/--[^\n]*/g, '') };
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

  it('keeps a whole-shape storage_path CHECK: 113\'s row key, which replaced 110\'s pattern', () => {
    // 113 (CUL-2287) replaced 110's `{pet_id}/{any uuid}.(html|pdf)` with the
    // row's own key, strictly narrower. 110's may only go in the statement
    // before the one that adds the row key.
    const drop = lastIndexOf(sql, /DROP CONSTRAINT vet_reports_storage_path_shape\b/);
    const add = lastIndexOf(sql, /ADD CONSTRAINT vet_reports_storage_path_is_row_key CHECK/);
    expect(add).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(add);
    expect(sql.slice(drop, add)).toMatch(/^DROP CONSTRAINT vet_reports_storage_path_shape;\s*ALTER TABLE public\.vet_reports\s*$/);
    expect(sql.slice(add)).not.toMatch(/DROP CONSTRAINT (?:IF EXISTS )?vet_reports_storage_path_is_row_key\b/);
    const check = sql.slice(add, sql.indexOf(';', add));
    // Verbatim: any looser form (a pattern, another prefix, a third segment)
    // is a key the deletion purge may not reach (guards/vetReportPathShape.test.ts).
    expect(check.replace(/\s+/g, ' ')).toBe(
      "ADD CONSTRAINT vet_reports_storage_path_is_row_key CHECK ( storage_path IN ( pet_id::text || '/' || id::text || '.html', pet_id::text || '/' || id::text || '.pdf' ) )",
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
    // 113 (CUL-2287) compares through oldj / newj so a link going to NULL (the
    // FKs' ON DELETE SET NULL; a client holds no grant on either link) reads as
    // unchanged. Both arms verbatim: flipping IS NULL lets a client re-point a
    // link the day it is granted.
    const flat = body.replace(/\s+/g, ' ');
    expect(flat).toContain('oldj jsonb := to_jsonb(OLD); newj jsonb := to_jsonb(NEW);');
    expect(flat).toContain(
      "IF NEW.vet_visit_id IS NULL THEN newj := jsonb_set(newj, '{vet_visit_id}', coalesce(oldj -> 'vet_visit_id', 'null'::jsonb)); END IF;",
    );
    expect(flat).toContain(
      "IF NEW.vet_appointment_id IS NULL THEN newj := jsonb_set(newj, '{vet_appointment_id}', coalesce(oldj -> 'vet_appointment_id', 'null'::jsonb)); END IF;",
    );
    expect(flat.match(/jsonb_set\(/g)?.length).toBe(2);
    // The whole condition through THEN: a weakened bound (`> OLD + interval`)
    // must not pass as a prefix match. 113: NULL-aware, because the column is
    // nullable now and 110's `NEW > OLD` let a client clear or set it (F3).
    expect(flat).toContain(
      'IF (newj - control) IS DISTINCT FROM (oldj - control) OR (NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at AND NOT (OLD.token_expires_at IS NOT NULL AND NEW.token_expires_at IS NOT NULL AND NEW.token_expires_at < OLD.token_expires_at)) THEN',
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
    // INSERT OR UPDATE triggers fire on UPDATE too (113 adds three).
    const others = [...sql.matchAll(/CREATE TRIGGER (\w+)\s+BEFORE (?:INSERT OR )?UPDATE(?: OR INSERT)? ON (?:public\.)?vet_reports\b/g)]
      .map((m) => m[1])
      .filter((n) => n !== 'trg_vet_reports_client_freeze');
    expect(others).toContain('trg_vet_reports_updated_at');
    for (const name of others) expect('trg_vet_reports_client_freeze' < name).toBe(true);
  });
});

// CUL-2287 (migration 113): the saved copy. The behaviour is the probe in the
// PR (scripts/probes/vet-report-113, 67 cases); this pins the shapes a later
// file could quietly undo. Blind spots, stated: a DO block's EXECUTE, a bucket
// name built by concatenation inside a policy that does filter on bucket_id,
// and anything done in the dashboard (VERIFY covers that). MUTANTS, run
// 2026-11-01, all killed: an auth.uid()
// exemption in the content freeze; a pets.user_id read formatted into the
// maker RAISE; the client freeze's unlink arm flipped to IS NOT NULL; the
// appointment pet trigger removed; a later bucket INSERT; snapshot added to the
// kept-copy control list; the no-live-token CHECK dropped later.
// Second round, the rls-privacy-reviewer's 11 survivors, each as a later
// migration file, all killed now: DROP FUNCTION … CASCADE on the content
// freeze, the maker guard and the appointment pet guard; a quoted DROP of the
// row key and of the no-live-token CHECK; a `$function$` redefinition with an
// exemption; ENABLE REPLICA TRIGGER; RENAME then DROP of the row key; a quoted
// "storage"."buckets" INSERT; a bucket-wide anon policy on storage.objects; a
// policy naming 'nyx-' || 'vet-reports'. Plus DISABLE TRIGGER on the delete
// guard. Pass 2's survivors, all killed now: DROP TRIGGER on the delete and
// truncate guards; CREATE OR REPLACE TRIGGER with WHEN (false) or another
// function; kept_complete re-added without the hash; DROP COLUMN
// content_sha256; a migration trigger whose function DELETEs saved copies.
// Still not caught, stated: renaming the table (110's line above), dropping
// the pet FK, and a DELETE built by EXECUTE inside a function body.
describe('vet_reports saved copy (CUL-2287, migration 113)', () => {
  const sql = allMigrations();

  const lastFunction = (name: string) => lastFunctionIn(sql, name);

  it('holds every token NULL: no row carries a live share link (R-7)', () => {
    const add = lastIndexOf(sql, /ADD CONSTRAINT vet_reports_no_live_token\b/);
    expect(add).toBeGreaterThan(-1);
    expect(sql.slice(add)).not.toMatch(/DROP CONSTRAINT (?:IF EXISTS )?vet_reports_no_live_token\b/);
    expect(sql.slice(add, sql.indexOf(';', add)).replace(/\s+/g, ' ')).toBe(
      'ADD CONSTRAINT vet_reports_no_live_token CHECK (share_token IS NULL AND token_expires_at IS NULL)',
    );
  });

  it('freezes a kept copy for every writer, with no exemption branch', () => {
    const { header, body } = lastFunction('vet_reports_content_freeze');
    expect(header).toMatch(/SECURITY INVOKER/);
    expect(header).toMatch(/SET search_path = ''/);
    const control = /control text\[\] := ARRAY\[([^\]]*)\];/.exec(body);
    expect((control?.[1] ?? '').split(',').map((c) => c.trim().replace(/'/g, ''))).toEqual([
      'vet_visit_id', 'vet_appointment_id', 'shared_via', 'shared_at', 'token_expires_at', 'updated_at',
    ]);
    // One RETURN NEW, at the end: any early return is an exemption (CUL-2318).
    expect(body.match(/RETURN NEW;/g)?.length).toBe(1);
    expect(body).not.toMatch(/auth\.uid\(\)|current_user|current_setting|session_user/);
    const flat = body.replace(/\s+/g, ' ');
    // id and key fixed on every row (F6).
    expect(flat).toContain('IF NEW.id IS DISTINCT FROM OLD.id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN');
    expect(flat).toContain(
      "IF OLD.status = 'kept' AND ( (to_jsonb(NEW) - control) IS DISTINCT FROM (to_jsonb(OLD) - control) OR (NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at AND NOT (OLD.token_expires_at IS NOT NULL AND NEW.token_expires_at IS NOT NULL AND NEW.token_expires_at < OLD.token_expires_at)) ) THEN",
    );
    const create = lastIndexOf(sql, /CREATE TRIGGER trg_vet_reports_content_freeze\s+BEFORE UPDATE ON public\.vet_reports\s+FOR EACH ROW EXECUTE FUNCTION public\.vet_reports_content_freeze\(\);/);
    expect(create).toBeGreaterThan(-1);
    const after = sql.slice(create);
    expect(after).not.toMatch(/DROP TRIGGER (?:IF EXISTS )?trg_vet_reports_content_freeze\b/);
    expect(after).not.toMatch(/DISABLE\s+TRIGGER\s+(?:ALL|USER|trg_vet_reports_content_freeze)\b/i);
  });

  it.each([
    ['enforce_vet_report_maker_is_owner', 'trg_vet_reports_maker_is_owner', 'vet_reports'],
    ['enforce_vet_appointment_link_same_pet', 'trg_vet_reports_link_appointment', 'vet_reports'],
    ['enforce_vet_visit_link_same_pet', 'trg_vet_reports_link_visit', 'vet_reports'],
  ])('%s guards vet_reports as a pinned, client-uncallable DEFINER naming only NEW.* (C-31)', (fn, trigger, table) => {
    const { header, body } = lastFunction(fn);
    expect(header).toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/SET search_path = ''/);
    const raises = [...body.matchAll(/RAISE EXCEPTION\s*('(?:[^']|'')*')\s*,?\s*([^;]*);/g)];
    expect(raises.length).toBe(1);
    // Every format argument is a NEW.* column; the USING clause is the errcode.
    const args = raises[0][2].replace(/\s+/g, ' ').split(/ USING /)[0].split(',').map((a) => a.trim()).filter(Boolean);
    for (const a of args) expect(a).toMatch(/^NEW\.\w+$/);
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toMatch(new RegExp(String.raw`REVOKE ALL ON FUNCTION public\.${fn}\(\) FROM ${role};`));
    }
    expect(sql).toMatch(new RegExp(String.raw`CREATE TRIGGER ${trigger}\s+BEFORE INSERT OR UPDATE ON public\.${table}\s+FOR EACH ROW EXECUTE FUNCTION public\.${fn}\(\);`));
    expect(sql.slice(lastIndexOf(sql, new RegExp(String.raw`CREATE TRIGGER ${trigger}\b`)))).not.toMatch(
      new RegExp(String.raw`DROP TRIGGER (?:IF EXISTS )?${trigger}\b`),
    );
  });

  it('binds generated_by to the pet\'s owner, re-judged only when it or the pet moves (C-38)', () => {
    const flat = lastFunction('enforce_vet_report_maker_is_owner').body.replace(/\s+/g, ' ');
    expect(flat).toContain(
      "IF ( TG_OP = 'INSERT' OR NEW.generated_by IS DISTINCT FROM OLD.generated_by OR NEW.pet_id IS DISTINCT FROM OLD.pet_id ) AND NOT EXISTS ( SELECT 1 FROM public.pets p WHERE p.id = NEW.pet_id AND p.user_id = NEW.generated_by ) THEN",
    );
  });

  it('makes vet_appointments.pet_id immutable, the parent half of the link (C-38)', () => {
    const flat = lastFunction('enforce_vet_appointment_pet_immutable').body.replace(/\s+/g, ' ');
    expect(flat).toContain('IF NEW.pet_id IS DISTINCT FROM OLD.pet_id THEN');
    const create = lastIndexOf(sql, /CREATE TRIGGER trg_vet_appointments_pet_immutable\s+BEFORE UPDATE ON public\.vet_appointments\b/);
    expect(create).toBeGreaterThan(-1);
    expect(sql.slice(create)).not.toMatch(/DROP TRIGGER (?:IF EXISTS )?trg_vet_appointments_pet_immutable\b/);
  });

  it('refuses a kept copy\'s DELETE while its pet and maker stand, and TRUNCATE (F1; 114 E3)', () => {
    const { header, body } = lastFunction('vet_reports_kept_not_deleted');
    // 114 (CUL-2339): DEFINER, because it reads pets and auth.users.
    expect(header).toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/SET search_path = ''/);
    const flat = body.replace(/\s+/g, ' ');
    // The parent test, not trigger depth: a DELETE from inside a trigger runs
    // at depth 2, as a cascade does, and passed 113's depth-1 test (E3).
    expect(flat).toContain(
      "IF OLD.status = 'kept' AND EXISTS (SELECT 1 FROM public.pets p WHERE p.id = OLD.pet_id) AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.generated_by) THEN",
    );
    expect(flat).not.toMatch(/pg_trigger_depth|current_user|current_setting|session_user|auth\.uid\(\)/);
    // One refusal per arm, and the only RETURN is the last line: an early
    // RETURN OLD is an exemption.
    expect(flat.match(/RETURN OLD;/g)?.length).toBe(1);
    expect(flat.match(/RAISE EXCEPTION '[^']*' USING ERRCODE = 'check_violation';/g)?.length).toBe(2);
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(sql).toMatch(new RegExp(String.raw`REVOKE ALL ON FUNCTION public\.vet_reports_kept_not_deleted\(\) FROM ${role};`));
    }
    expect(flat).toContain("IF TG_OP = 'TRUNCATE' THEN RAISE EXCEPTION");
    expect(sql).toMatch(/CREATE TRIGGER trg_vet_reports_kept_not_deleted\s+BEFORE DELETE ON public\.vet_reports\s+FOR EACH ROW EXECUTE FUNCTION public\.vet_reports_kept_not_deleted\(\);/);
    expect(sql).toMatch(/CREATE TRIGGER trg_vet_reports_no_truncate\s+BEFORE TRUNCATE ON public\.vet_reports\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.vet_reports_kept_not_deleted\(\);/);
  });

  // The ways a later file switches a guard off without touching its body.
  // Each was a surviving mutant in the rls-privacy-reviewer's pass.
  const GUARDED_FUNCTIONS = [
    'vet_reports_client_freeze',
    'vet_reports_content_freeze',
    'vet_reports_kept_not_deleted',
    'enforce_vet_report_maker_is_owner',
    'enforce_vet_appointment_link_same_pet',
    'enforce_vet_visit_link_same_pet',
    'enforce_vet_appointment_pet_immutable',
    'reserve_vet_report_kept_id',
    'vet_report_kept_ids_append_only',
  ];
  const GUARDED_TRIGGERS = [
    'trg_vet_reports_client_freeze',
    'trg_vet_reports_content_freeze',
    'trg_vet_reports_kept_not_deleted',
    'trg_vet_reports_no_truncate',
    'trg_vet_reports_maker_is_owner',
    'trg_vet_reports_link_appointment',
    'trg_vet_reports_link_visit',
    'trg_vet_appointments_pet_immutable',
    'trg_vet_reports_reserve_kept_id',
    'trg_vet_report_kept_ids_append_only',
    'trg_vet_report_kept_ids_no_truncate',
  ];

  it.each(GUARDED_FUNCTIONS)('never drops or alters %s', (fn) => {
    expect(sql).not.toMatch(new RegExp(String.raw`\b(?:DROP|ALTER)\s+(?:FUNCTION|ROUTINE)\s+(?:IF\s+EXISTS\s+)?(?:public\.)?${fn}\b`, 'i'));
  });

  it.each(GUARDED_TRIGGERS)('never drops %s after creating it, and never replaces it in place', (tg) => {
    const create = lastIndexOf(sql, new RegExp(String.raw`\bCREATE TRIGGER ${tg}\b`));
    expect(create).toBeGreaterThan(-1);
    expect(sql.slice(create)).not.toMatch(new RegExp(String.raw`\bDROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?${tg}\b`, 'i'));
    // CREATE OR REPLACE TRIGGER (PG14+) can swap the function or add WHEN (false)
    // while every CREATE TRIGGER pin above still reads the original.
    expect(sql).not.toMatch(new RegExp(String.raw`\bCREATE\s+OR\s+REPLACE\s+(?:CONSTRAINT\s+)?TRIGGER\s+${tg}\b`, 'i'));
  });

  it.each(GUARDED_TRIGGERS)('never disables, re-modes or renames %s', (tg) => {
    expect(sql).not.toMatch(new RegExp(String.raw`\b(?:DISABLE|ENABLE\s+(?:REPLICA|ALWAYS))\s+TRIGGER\s+${tg}\b`, 'i'));
    expect(sql).not.toMatch(new RegExp(String.raw`\bALTER\s+TRIGGER\s+${tg}\b`, 'i'));
  });

  it('never disables every trigger on vet_reports or vet_appointments after 113', () => {
    const at = lastIndexOf(sql, /CREATE TRIGGER trg_vet_reports_kept_not_deleted\b/);
    expect(at).toBeGreaterThan(-1);
    expect(sql.slice(at)).not.toMatch(/ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?vet_(?:reports|appointments)\b[^;]*\bDISABLE\s+TRIGGER\s+(?:ALL|USER)\b/i);
  });

  it('requires the content hash on a kept copy, and keeps the column', () => {
    const add = lastIndexOf(sql, /ADD CONSTRAINT vet_reports_kept_complete\b/);
    expect(add).toBeGreaterThan(-1);
    expect(sql.slice(add)).not.toMatch(/DROP CONSTRAINT (?:IF EXISTS )?vet_reports_kept_complete\b/i);
    expect(sql.slice(add, sql.indexOf(';', add)).replace(/\s+/g, ' ')).toContain(
      "ADD CONSTRAINT vet_reports_kept_complete CHECK (status <> 'kept' OR (snapshot IS NOT NULL AND short_id IS NOT NULL AND shared_at IS NOT NULL AND content_sha256 IS NOT NULL))",
    );
    expect(sql).not.toMatch(/ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?vet_reports\b[^;]*\bDROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(?:content_sha256|status|snapshot)\b/i);
  });

  it('has no function that deletes saved copies', () => {
    // 113's delete guard told a cascade from a direct DELETE by trigger depth,
    // so a function issuing its own DELETE on vet_reports was a way round it
    // (rls-privacy-reviewer pass 2, G2). 114 closed that with the parent test
    // (CUL-2339, E3); this stays as the second wall: nothing in the schema
    // deletes saved copies except the FK cascades.
    const bodies = [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?\$(\w*)\$([\s\S]*?)\$\1\$/g)].map((m) => m[2]);
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b).not.toMatch(/\bDELETE\s+FROM\s+(?:ONLY\s+)?(?:public\.)?vet_reports\b/i);
  });

  it('never renames a vet_reports constraint (a rename then a drop evades every pin)', () => {
    expect(sql).not.toMatch(/ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?vet_reports\b[^;]*\bRENAME\s+CONSTRAINT\b/i);
  });

  it('creates no bucket and no Storage policy for nyx-vet-reports, and no bucket-wide policy (CUL-2313)', () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+storage\.buckets[^;]*vet-reports/i);
    const policies = [...sql.matchAll(/CREATE\s+POLICY[^;]*\bON\s+storage\.objects\b[^;]*;/gi)].map((m) => m[0]);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect(p).not.toMatch(/vet-reports/i);
      // A policy with no bucket_id filter reaches every bucket, this one included.
      expect(p).toMatch(/bucket_id/);
    }
  });
});

// CUL-2339 (migration 114): a kept copy's id and label are never used again.
// E4 (rls-privacy-reviewer pass 2 on 113): a server transaction deleted the
// pet (the cascade passes, as it must), re-created it under the same id and
// re-inserted the kept copy with a softer snapshot. 114 reserves a copy's id
// and (pet, label) the moment it is kept, in a server-only, append-only table,
// and refuses a second keep under either. The behaviour (E3, E4, the
// reviewer's pass-1 shapes M1 / M6 / M7 / M14, and the two-session race R1 /
// R2 in race.sh) is the probe in the PR: scripts/probes/vet-report-114, 42
// cases and 4 race checks; with MIGRATION_114=/dev/null every E3 / E4 case and
// the race land. This pins the shapes a later file could quietly undo.
// Blind spots, stated: a DO block's EXECUTE; a grant through role membership
// (GRANT postgres TO service_role); a superuser's replica mode; a later
// BEFORE trigger that rewrites NEW.snapshot on INSERT (the content freeze
// judges UPDATEs; an INSERT's content is the writer's to choose).
// MUTANTS, run 2026-11-01 against 114 (each applied to the real file or added
// as a later migration, the suite run, the file restored), all killed: the
// depth test restored; the maker arm dropped; the delete guard back to
// INVOKER; the reservations' service_role REVOKE dropped; a later GRANT on
// them; the reserve test's OR -> AND; the row-count check dropped; the
// reserve trigger dropped later; an early RETURN in the append-only guard; a
// later GRANT EXECUTE on the reserve function; pass 1's M3 (OWNER TO), M6 (a
// further trigger on the reservations), M13 (the per-pet label UNIQUE
// dropped), M14 (a rule), and the upper() dropped from the label index (M10).
// Pass 2's 13 later-migration survivors, now killed but for M13: a
// single-quoted or spaced redefinition of each guard (M1 to M4), INHERITS and
// PARTITION OF (M5), DROP INDEX CONCURRENTLY (M6), replica mode (M7), ALTER
// ROUTINE (M8), the Crockford CHECK dropped (M9), ALTER COLUMN on the
// reservations (M11), an overload (M12). M13, a widened status CHECK, is
// stated in the migration's blind spots.
describe('vet_reports kept-id reservations (CUL-2339, migration 114)', () => {
  const sql = allMigrations();
  const KEPT = String.raw`(?:public\.)?vet_report_kept_ids\b`;

  it('closes the reservations to every caller role, service_role included', () => {
    const create = lastIndexOf(sql, /CREATE TABLE public\.vet_report_kept_ids\b/);
    expect(create).toBeGreaterThan(-1);
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(sql.slice(create)).toMatch(new RegExp(String.raw`REVOKE ALL ON TABLE public\.vet_report_kept_ids FROM ${role};`));
    }
    expect(sql.slice(create)).toMatch(/ALTER TABLE public\.vet_report_kept_ids ENABLE ROW LEVEL SECURITY;/);
    // No grant, no policy, no RLS off, ever, and no schema-wide grant after it
    // (one would reach the table as it reaches every table).
    expect(sql).not.toMatch(new RegExp(String.raw`\bGRANT\s[^;]*\bON\s+(?:TABLE\s+)?${KEPT}`, 'i'));
    expect(sql).not.toMatch(new RegExp(String.raw`\bCREATE\s+POLICY\s[^;]*\bON\s+${KEPT}`, 'i'));
    expect(sql.slice(create)).not.toMatch(/\bGRANT\s[^;]*\bON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\b/i);
    expect(sql).not.toMatch(new RegExp(String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?${KEPT}`, 'i'));
    expect(sql).not.toMatch(new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${KEPT}[^;]*\b(?:DROP|RENAME|DISABLE|NO\s+FORCE|SET\s+SCHEMA|OWNER|ALTER\s+COLUMN|ADD|INHERIT|ATTACH|DETACH)\b`, 'i'));
  });

  it('keeps the reservations append-only for every role, with no other trigger or rule on them', () => {
    const { header, body } = lastFunctionIn(sql, 'vet_report_kept_ids_append_only');
    expect(header).toMatch(/SET search_path = ''/);
    // Raises unconditionally: no branch, no RETURN.
    expect(body.replace(/\s+/g, ' ').trim()).toBe(
      "BEGIN RAISE EXCEPTION 'vet_report_kept_ids: a kept copy''s reservation is never changed or removed' USING ERRCODE = 'check_violation'; END;",
    );
    expect(sql).toMatch(/CREATE TRIGGER trg_vet_report_kept_ids_append_only\s+BEFORE UPDATE OR DELETE ON public\.vet_report_kept_ids\s+FOR EACH ROW EXECUTE FUNCTION public\.vet_report_kept_ids_append_only\(\);/);
    expect(sql).toMatch(/CREATE TRIGGER trg_vet_report_kept_ids_no_truncate\s+BEFORE TRUNCATE ON public\.vet_report_kept_ids\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.vet_report_kept_ids_append_only\(\);/);
    // Exactly these two: a further BEFORE INSERT ... RETURN NULL swallowed the
    // reservation in pass 1 (M6). The row count refuses that at runtime too.
    const triggers = [...sql.matchAll(new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(\w+)[^;]*?\bON\s+${KEPT}`, 'gi'))].map((m) => m[1]);
    expect(triggers.sort()).toEqual(['trg_vet_report_kept_ids_append_only', 'trg_vet_report_kept_ids_no_truncate']);
    expect(sql).not.toMatch(new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?RULE\s[^;]*\bTO\s+${KEPT}`, 'i'));
  });

  it('keeps the label key per pet and case-blind', () => {
    const at = lastIndexOf(sql, /CREATE UNIQUE INDEX idx_vet_report_kept_ids_label\b/);
    expect(at).toBeGreaterThan(-1);
    expect(sql.slice(at, sql.indexOf(';', at)).replace(/\s+/g, ' ')).toBe(
      'CREATE UNIQUE INDEX idx_vet_report_kept_ids_label ON public.vet_report_kept_ids (pet_id, upper(short_id))',
    );
    expect(sql).not.toMatch(/\bDROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:public\.)?idx_vet_report_kept_ids_label\b/i);
    expect(sql).not.toMatch(/\bALTER\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:public\.)?idx_vet_report_kept_ids_label\b/i);
    // The live per-pet UNIQUE on vet_reports stays (pass 1, M13), and so does
    // the label's alphabet: without it a look-alike label (a trailing
    // zero-width space) is a different key that prints the same (pass 2, M9).
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?vet_reports_short_id_(?:per_pet|crockford)\b/i);
  });

  it('reserves a row as it is kept, judged AFTER the write, and refuses a reservation that did not land (C-31)', () => {
    const { header, body } = lastFunctionIn(sql, 'reserve_vet_report_kept_id');
    expect(header).toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/SET search_path = ''/);
    expect(body.replace(/\s+/g, ' ').trim()).toBe(
      "DECLARE n bigint := 0; BEGIN IF NEW.status = 'kept' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'kept') THEN BEGIN"
        + ' INSERT INTO public.vet_report_kept_ids (id, pet_id, short_id) VALUES (NEW.id, NEW.pet_id, NEW.short_id);'
        + ' GET DIAGNOSTICS n = ROW_COUNT; EXCEPTION WHEN unique_violation OR not_null_violation THEN n := 0; END;'
        + " IF n <> 1 THEN RAISE EXCEPTION 'vet_reports: a kept copy needs an id and label never kept before'"
        + " USING ERRCODE = 'check_violation'; END IF; END IF; RETURN NULL; END;",
    );
    expect(sql).toMatch(/CREATE TRIGGER trg_vet_reports_reserve_kept_id\s+AFTER INSERT OR UPDATE ON public\.vet_reports\s+FOR EACH ROW EXECUTE FUNCTION public\.reserve_vet_report_kept_id\(\);/);
  });

  it('never lets a child or partition of vet_reports hold rows the reservations cannot see (pass 2, M5)', () => {
    // A table that INHERITS vet_reports shares none of its keys or triggers,
    // and its rows are read by every SELECT on the parent: a second copy under
    // a kept id and label, softer, with no reservation and no PK clash.
    expect(sql).not.toMatch(/\bINHERITS\s*\([^)]*\bvet_reports\b/i);
    expect(sql).not.toMatch(/\bPARTITION\s+OF\s+(?:public\.)?vet_reports\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\s+[^;]*\bINHERIT\s+(?:public\.)?vet_reports\b/i);
    expect(sql).not.toMatch(/\bATTACH\s+PARTITION\b[^;]*\bvet_reports\b|\bvet_reports\b[^;]*\bATTACH\s+PARTITION\b/i);
  });

  it('never turns triggers off for a session after 114 (pass 2, M7)', () => {
    // Replica mode skips every guard on both tables. A later file that sets it
    // (a statement, set_config, or a function's SET clause) must argue here.
    const at = lastIndexOf(sql, /CREATE TRIGGER trg_vet_reports_reserve_kept_id\b/);
    expect(at).toBeGreaterThan(-1);
    expect(sql.slice(at)).not.toMatch(/session_replication_role/i);
  });

  it('never changes the owner of vet_reports or adds a rule to it (pass 1, M3)', () => {
    expect(sql).not.toMatch(/\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?vet_reports\b[^;]*\bOWNER\s+TO\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+(?:OR\s+REPLACE\s+)?RULE\s[^;]*\bTO\s+(?:public\.)?vet_reports\b/i);
    expect(sql).not.toMatch(/\bREASSIGN\s+OWNED\b/i);
  });

  it.each(['reserve_vet_report_kept_id', 'vet_report_kept_ids_append_only'])(
    'revokes EXECUTE on %s from every caller role',
    (fn) => {
      for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
        expect(sql).toMatch(new RegExp(String.raw`REVOKE ALL ON FUNCTION public\.${fn}\(\) FROM ${role};`));
      }
      expect(sql).not.toMatch(new RegExp(String.raw`\bGRANT\s[^;]*\bON\s+FUNCTION\s+(?:public\.)?${fn}\b`, 'i'));
    },
  );
});
