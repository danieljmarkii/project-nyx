// The saved vet report's stored file is one the account-deletion purge erases
// (CUL-2311 items 1 and 3, migration 113, CUL-2287).
//
// WHAT IT PROVES. Every `storage_path` the database accepts on `vet_reports` is
// one `delete-account` removes, by both of its routes:
//   1. the row route: collectStoragePaths keeps it in the nyx-vet-reports
//      purge (scopeVetReportPaths, the two-segment owned-pet predicate);
//   2. the folder route: buildPrefixSweep lists the pet's folder in the same
//      bucket, so even an object whose row is gone is reached.
// And the converse that keeps the scope a security boundary: the same path is
// dropped when the pet is not the deleting account's.
//
// HOW THE CHECK IS READ. Nothing about the shape is hardcoded here. The live
// constraint set on vet_reports.storage_path is REPLAYED from every file in
// supabase/migrations/ in order (ADD and DROP), and the one left must be 113's
// `storage_path IN (…)`. Each item of that list is parsed against the only
// shape the purge can keep: `pet_id::text || '/' || id::text || '<.ext>'`. An
// item of any other shape (a third segment, a prefix that is not the row's own
// pet, a regex) fails the parse, and the build, before a writer can use it.
// The extensions the test then exercises are the ones the SQL lists.
//
// MUTANTS, run against this file 2026-11-01, every one killed:
//   ✗ 113's item rewritten to three segments (`pet_id::text || '/' || id::text || '/report.pdf'`)
//   ✗ 113's item rewritten to a user-id prefix (`generated_by::text || '/' || …`)
//   ✗ a later migration that drops vet_reports_storage_path_is_row_key
//   ✗ a later migration that adds a second, looser storage_path CHECK
//   ✗ scopeVetReportPaths replaced by a `.pdf`-only filter (an .html copy survives)
//   ✗ vetReports left out of SWEEP_SCOPE's pet folders
//
// BLIND SPOTS, stated. It reads the repo, not production: an unapplied 113 is
// invisible here (the PM's `apply 113` and its VERIFY block cover that). It
// proves the CHECK and the purge agree; the writer's own path builder (VR2-20,
// CUL-2311 item 2) still owes a test that its output is a row's key.

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  STORAGE_BUCKETS,
  buildPrefixSweep,
  collectStoragePaths,
  type OwnedStoragePaths,
} from '../supabase/functions/delete-account/plan';

const MIGRATIONS = path.resolve(__dirname, '..', 'supabase', 'migrations');

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

interface LiveCheck {
  name: string;
  body: string;
  file: string;
}

// Replays every ADD / DROP of a vet_reports constraint that names storage_path.
function liveStoragePathChecks(): LiveCheck[] {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const live = new Map<string, LiveCheck>();
  for (const file of files) {
    const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
    for (const stmt of sql.split(';')) {
      if (!/ALTER\s+TABLE\s+(public\.)?vet_reports\b/i.test(stmt)) continue;
      for (const m of stmt.matchAll(/DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?(\w+)/gi)) live.delete(m[2]);
      for (const m of stmt.matchAll(/ADD\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(([\s\S]*)$/gi)) {
        // One ADD CONSTRAINT per statement is the convention 113 keeps for this
        // one; take the body to the statement's end and judge it below.
        if (/storage_path/.test(m[2])) live.set(m[1], { name: m[1], body: m[2], file });
      }
    }
  }
  return [...live.values()];
}

const ITEM = /^pet_id::text\s*\|\|\s*'\/'\s*\|\|\s*id::text\s*\|\|\s*'(\.[a-z0-9]+)'$/;

// The extensions the CHECK allows, parsed from its `storage_path IN (…)` list.
function allowedExtensions(check: LiveCheck): string[] {
  const m = /^\s*storage_path\s+IN\s*\(([\s\S]*)\)\s*\)\s*$/i.exec(check.body);
  if (!m) throw new Error(`${check.file}: ${check.name} is not a plain storage_path IN (…) list`);
  const items = m[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim());
  return items.map((item) => {
    const im = ITEM.exec(item);
    if (!im) throw new Error(`${check.file}: ${check.name} item is not {pet_id}/{id}.<ext>: ${item}`);
    return im[1];
  });
}

function purgeInput(paths: string[], ownedPetIds: string[]): OwnedStoragePaths {
  return {
    petPhotoPaths: [],
    eventAttachmentPaths: [],
    vetAttachmentPaths: [],
    vetDocumentPaths: [],
    vetReportPaths: paths,
    medicationPhotoPaths: [],
    foodPhotoPaths: [],
    ownedFoodItemIds: [],
    ownedPetIds,
    ownerUserId: randomUUID(),
  };
}

function vetReportPurge(paths: string[], ownedPetIds: string[]): string[] {
  return (
    collectStoragePaths(purgeInput(paths, ownedPetIds)).find((b) => b.bucket === STORAGE_BUCKETS.vetReports)
      ?.paths ?? []
  );
}

describe('vet_reports.storage_path: the CHECK the repo leaves live', () => {
  const live = liveStoragePathChecks();

  it('is exactly one constraint, 113 vet_reports_storage_path_is_row_key', () => {
    expect(live.map((c) => [c.file, c.name])).toEqual([
      ['113_vet_report_saved_copies.sql', 'vet_reports_storage_path_is_row_key'],
    ]);
  });

  it('lists only {pet_id}/{id}.<ext> keys, and at least one', () => {
    const exts = allowedExtensions(live[0]);
    expect(exts.length).toBeGreaterThan(0);
    expect(new Set(exts).size).toBe(exts.length);
  });
});

describe('every key the CHECK accepts is erased by account deletion', () => {
  const exts = allowedExtensions(liveStoragePathChecks()[0]);
  // Lower-case, as uuid::text prints and as the CHECK compares.
  const pets = Array.from({ length: 5 }, () => randomUUID());

  it.each(exts)('the row route keeps %s keys for the owner', (ext) => {
    for (const pet of pets) {
      const key = `${pet}/${randomUUID()}${ext}`;
      expect(vetReportPurge([key], [pet, randomUUID()])).toEqual([key]);
    }
  });

  it.each(exts)('the row route drops %s keys on a pet the account does not own', (ext) => {
    for (const pet of pets) {
      const key = `${pet}/${randomUUID()}${ext}`;
      expect(vetReportPurge([key], [randomUUID()])).toEqual([]);
    }
  });

  it('the folder route lists the first segment of every accepted key in nyx-vet-reports', () => {
    const userId = randomUUID();
    const sweep = buildPrefixSweep({ petIds: pets, foodItemIds: [], userId });
    const roots = sweep.filter((s) => s.bucket === STORAGE_BUCKETS.vetReports).map((s) => s.root);
    for (const ext of exts) {
      for (const pet of pets) {
        const key = `${pet}/${randomUUID()}${ext}`;
        expect(roots).toContain(key.split('/')[0]);
      }
    }
  });

  it('the parse refuses a shape the purge would skip (the reason the CHECK must stay two segments)', () => {
    const threeSeg = { name: 'x', file: 'x.sql', body: "storage_path IN (pet_id::text || '/' || id::text || '/report.pdf'))" };
    expect(() => allowedExtensions(threeSeg)).toThrow(/not \{pet_id\}\/\{id\}/);
    const pet = randomUUID();
    expect(vetReportPurge([`${pet}/${randomUUID()}/report.pdf`], [pet])).toEqual([]);
  });
});
