// Unit tests for delete-account pure plan logic (AC-11).
// Run with: deno test supabase/functions/delete-account/plan.test.ts
//
// Covers the two things that must be provably correct and that the
// rls-privacy-reviewer attacks: the Storage path collection/scoping/exclusion
// (FR-3/FR-4), and the destructive ORDER (FR-6 — auth user deleted last, once,
// after every purge). The DB reads, the Storage remove() calls, and the auth
// delete are I/O and verified by curl against a throwaway account.

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  cleanPaths,
  scopeMedicationPaths,
  collectStoragePaths,
  buildDeletionPlan,
  chunk,
  STORAGE_BUCKETS,
  PRESERVED_BUCKETS,
  STORAGE_REMOVE_CHUNK,
  type OwnedStoragePaths,
  type DeletionStep,
} from './plan.ts'

// emptyOwned's ownerUserId is 'user-1', matching the `user-1/med-9/label.jpg`
// fixtures below, so the B-128 prefix guard (scopeMedicationPaths) passes those
// legitimate, owner-prefixed paths through untouched. The cross-tenant cases set a
// different ownerUserId explicitly via owned({ ... }).
const emptyOwned: OwnedStoragePaths = {
  petPhotoPaths: [],
  eventAttachmentPaths: [],
  vetAttachmentPaths: [],
  vetReportPaths: [],
  medicationPhotoPaths: [],
  ownerUserId: 'user-1',
}

const owned = (over: Partial<OwnedStoragePaths>): OwnedStoragePaths => ({ ...emptyOwned, ...over })

// ── cleanPaths ────────────────────────────────────────────────────────────────

Deno.test('cleanPaths — drops null/undefined/blank, keeps real keys in order', () => {
  assertEquals(
    cleanPaths(['a/1.jpg', null, undefined, '', '   ', 'b/2.jpg']),
    ['a/1.jpg', 'b/2.jpg'],
  )
})

Deno.test('cleanPaths — de-duplicates within a list', () => {
  assertEquals(cleanPaths(['p/x.jpg', 'p/x.jpg', 'p/y.jpg']), ['p/x.jpg', 'p/y.jpg'])
})

Deno.test('cleanPaths — never mutates a real key (no trimming of valid paths)', () => {
  // A key with internal structure must survive byte-for-byte so Storage matches it.
  assertEquals(cleanPaths(['pet-id/abc 123.jpg']), ['pet-id/abc 123.jpg'])
})

Deno.test('cleanPaths — all-empty input yields []', () => {
  assertEquals(cleanPaths([null, undefined, '', '  ']), [])
})

// ── scopeMedicationPaths (B-128 cross-tenant prefix guard) ────────────────────

Deno.test('scopeMedicationPaths — keeps only paths under the owner\'s own {uid}/ prefix', () => {
  assertEquals(
    scopeMedicationPaths(
      ['owner/med-1/0-label.jpg', 'victim/med-2/0-label.jpg', 'owner/med-3/0-label.jpg'],
      'owner',
    ),
    ['owner/med-1/0-label.jpg', 'owner/med-3/0-label.jpg'],
  )
})

Deno.test('scopeMedicationPaths — B-128: a crafted cross-uid path is dropped', () => {
  // The attack: an attacker-owned medication_items row whose photo_paths references
  // the VICTIM's prefix. The service-role purge must never touch it.
  assertEquals(scopeMedicationPaths(['victim-uid/med-9/0-label.jpg'], 'attacker-uid'), [])
})

Deno.test('scopeMedicationPaths — the trailing / stops a uid that is a string-prefix of another', () => {
  // ownerUserId 'user-1' must NOT match 'user-12/…' — without the '/' separator a
  // naive startsWith would let user-1 delete user-12's label photos.
  assertEquals(scopeMedicationPaths(['user-12/med/0-label.jpg'], 'user-1'), [])
  assertEquals(scopeMedicationPaths(['user-1/med/0-label.jpg'], 'user-1'), ['user-1/med/0-label.jpg'])
})

Deno.test('scopeMedicationPaths — a bare-uid path (no trailing slot) is dropped', () => {
  // A path that is exactly the uid with no `/` is not a real object key under the
  // user's folder; the prefix requires the separator, so it never matches.
  assertEquals(scopeMedicationPaths(['owner'], 'owner'), [])
})

Deno.test('scopeMedicationPaths — a blank owner uid fails CLOSED (drops everything)', () => {
  // Defense-in-depth: never let an empty owner collapse the prefix to '/' and match
  // every path. index.ts always supplies the verified-JWT uid, so this is a guard.
  assertEquals(scopeMedicationPaths(['anything/x.jpg'], ''), [])
  assertEquals(scopeMedicationPaths(['anything/x.jpg'], '   '), [])
})

Deno.test('scopeMedicationPaths — drops nulls/blanks alongside cross-uid paths', () => {
  assertEquals(
    scopeMedicationPaths(['owner/a.jpg', null, undefined, '', 'victim/b.jpg'], 'owner'),
    ['owner/a.jpg'],
  )
})

// ── collectStoragePaths ───────────────────────────────────────────────────────

Deno.test('collectStoragePaths — maps each owned list to its correct bucket', () => {
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg', 'ev/a2.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
    // {user_id}/{medication_item_id}/{slot}.jpg — the per-user-prefix convention
    // from migration 021 (buildMedicationPhotoPath).
    medicationPhotoPaths: ['user-1/med-9/label.jpg'],
  }))
  const byBucket = Object.fromEntries(purges.map((p) => [p.bucket, p.paths]))
  assertEquals(byBucket[STORAGE_BUCKETS.petPhotos], ['pets/p1.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.eventAttachments], ['ev/a1.jpg', 'ev/a2.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetAttachments], ['vet/v1.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetReports], ['rep/r1.pdf'])
  assertEquals(byBucket[STORAGE_BUCKETS.medicationPhotos], ['user-1/med-9/label.jpg'])
})

Deno.test('collectStoragePaths — omits buckets that have no objects', () => {
  const purges = collectStoragePaths(owned({ eventAttachmentPaths: ['ev/a1.jpg'] }))
  assertEquals(purges.length, 1)
  assertEquals(purges[0].bucket, STORAGE_BUCKETS.eventAttachments)
})

Deno.test('collectStoragePaths — empty account yields no purges', () => {
  assertEquals(collectStoragePaths(emptyOwned), [])
})

Deno.test('collectStoragePaths — a pet with a null photo_path produces no pet-photo purge', () => {
  // Pet exists but never had a photo uploaded → photo_path is NULL → nothing to remove.
  const purges = collectStoragePaths(owned({ petPhotoPaths: [null] }))
  assertEquals(purges, [])
})

Deno.test('collectStoragePaths — FR-4: never emits a preserved (food) bucket', () => {
  // Even with every list populated, nyx-food-photos is unreachable by construction.
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
    medicationPhotoPaths: ['user-1/med-9/label.jpg'],
  }))
  for (const preserved of PRESERVED_BUCKETS) {
    assertEquals(purges.some((p) => p.bucket === preserved), false)
  }
})

Deno.test('collectStoragePaths — B-127: a medication-label path lands in the nyx-medication-photos purge', () => {
  // The whole point of B-127: a drug-label photo is per-user PII and must be PURGED,
  // not preserved — it rides the same path-collection lane as pet photos.
  const purges = collectStoragePaths(owned({ medicationPhotoPaths: ['user-1/med-9/label.jpg'] }))
  assertEquals(purges.length, 1)
  assertEquals(purges[0].bucket, STORAGE_BUCKETS.medicationPhotos)
  assertEquals(purges[0].bucket, 'nyx-medication-photos')
  assertEquals(purges[0].paths, ['user-1/med-9/label.jpg'])
})

Deno.test('collectStoragePaths — B-128: a cross-tenant medication path never reaches a purge', () => {
  // End-to-end through the path collector: a crafted path under ANOTHER user's prefix
  // is filtered out BEFORE the service-role purge step is built, so account deletion
  // can only ever remove the deleting user's OWN label photos.
  const purges = collectStoragePaths(owned({
    ownerUserId: 'owner-uid',
    medicationPhotoPaths: ['owner-uid/med-1/0-label.jpg', 'victim-uid/med-9/0-label.jpg'],
  }))
  const med = purges.find((p) => p.bucket === STORAGE_BUCKETS.medicationPhotos)
  assert(med, "expected a medication-photos purge for the owner's own path")
  assertEquals(med.paths, ['owner-uid/med-1/0-label.jpg'])
})

Deno.test('collectStoragePaths — B-128: an all-cross-tenant medication list yields NO medication purge', () => {
  const purges = collectStoragePaths(owned({
    ownerUserId: 'owner-uid',
    medicationPhotoPaths: ['victim-uid/med-9/0-label.jpg'],
  }))
  assertEquals(purges.some((p) => p.bucket === STORAGE_BUCKETS.medicationPhotos), false)
})

Deno.test('PRESERVED_BUCKETS — B-127: nyx-medication-photos is PURGED, never preserved', () => {
  // Pins the B-124/B-127 decision: med-label photos are PII (per-user-prefix RLS,
  // migration 021), so the bucket sits in STORAGE_BUCKETS, NOT PRESERVED_BUCKETS —
  // the opposite of nyx-food-photos. A regression that "harmonized" it back to the
  // food precedent (preserve-on-delete) would leak prescription labels past a
  // hard-delete; this fails loudly if anyone does.
  // Not in the preserved list (refactor-safe via the constant)…
  assertEquals((PRESERVED_BUCKETS as readonly string[]).includes(STORAGE_BUCKETS.medicationPhotos), false)
  // …and IS a purgeable bucket, pinned to the exact literal name the decision is about.
  assert((Object.values(STORAGE_BUCKETS) as string[]).includes('nyx-medication-photos'))
})

Deno.test('collectStoragePaths — output buckets are always a subset of the five purgeable buckets', () => {
  const allowed = new Set<string>(Object.values(STORAGE_BUCKETS))
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
    medicationPhotoPaths: ['user-1/med-9/label.jpg'],
  }))
  for (const p of purges) assert(allowed.has(p.bucket), `unexpected bucket ${p.bucket}`)
})

// ── buildDeletionPlan (FR-6 ordering invariant) ───────────────────────────────

const isAuthDelete = (s: DeletionStep) => s.kind === 'delete-auth-user'

Deno.test('buildDeletionPlan — auth-user delete is ALWAYS the final step', () => {
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
  }))
  assert(isAuthDelete(plan[plan.length - 1]), 'last step must be delete-auth-user')
})

Deno.test('buildDeletionPlan — auth-user delete appears EXACTLY once', () => {
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
  }))
  assertEquals(plan.filter(isAuthDelete).length, 1)
})

Deno.test('buildDeletionPlan — every Storage purge precedes the auth delete', () => {
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
  }))
  const authIdx = plan.findIndex(isAuthDelete)
  const lastPurgeIdx = plan.map((s) => s.kind).lastIndexOf('purge-bucket')
  assert(lastPurgeIdx < authIdx, 'all purges must come before the auth-user delete')
})

Deno.test('buildDeletionPlan — single non-empty bucket: purge then auth delete', () => {
  const plan = buildDeletionPlan(owned({ petPhotoPaths: ['pets/p1.jpg'] }))
  assertEquals(plan.length, 2)
  assertEquals(plan[0], { kind: 'purge-bucket', bucket: STORAGE_BUCKETS.petPhotos, paths: ['pets/p1.jpg'] })
  assert(isAuthDelete(plan[1]))
})

Deno.test('buildDeletionPlan — B-127: a medication photo is purged BEFORE the terminal auth delete', () => {
  // End-to-end ordering for the new bucket: the SET NULL on created_by_user_id fires
  // with the auth-user delete, so the label-photo purge must precede it (FR-6) or the
  // photo is orphaned with no row to find it by. A med-only account still purges then
  // deletes, exactly like a pet-only one.
  const plan = buildDeletionPlan(owned({ medicationPhotoPaths: ['user-1/med-9/label.jpg'] }))
  assertEquals(plan.length, 2)
  assertEquals(plan[0], {
    kind: 'purge-bucket',
    bucket: STORAGE_BUCKETS.medicationPhotos,
    paths: ['user-1/med-9/label.jpg'],
  })
  assert(isAuthDelete(plan[1]))
})

Deno.test('buildDeletionPlan — B-128: a crafted cross-tenant medication path is never purged', () => {
  // The whole cross-tenant delete primitive, end-to-end: an attacker-owned row whose
  // only photo_paths value points at a VICTIM's prefix produces NO purge step — just
  // the terminal auth delete. The attacker can only ever delete their own account.
  const plan = buildDeletionPlan(owned({
    ownerUserId: 'attacker-uid',
    medicationPhotoPaths: ['victim-uid/med-9/0-label.jpg'],
  }))
  assertEquals(plan, [{ kind: 'delete-auth-user' }])
})

Deno.test('buildDeletionPlan — empty account still deletes the auth user (and nothing else)', () => {
  // AC: "No pets yet / empty account → deletion still works." The plan is exactly
  // the terminal auth delete, which the cascade resolves to auth.users + user_profiles.
  const plan = buildDeletionPlan(emptyOwned)
  assertEquals(plan, [{ kind: 'delete-auth-user' }])
})

Deno.test('buildDeletionPlan — purge steps carry the cleaned, scoped paths', () => {
  const plan = buildDeletionPlan(owned({
    eventAttachmentPaths: ['ev/a1.jpg', 'ev/a1.jpg', null, 'ev/a2.jpg'],
  }))
  const purge = plan.find((s) => s.kind === 'purge-bucket')
  assert(purge && purge.kind === 'purge-bucket')
  assertEquals(purge.bucket, STORAGE_BUCKETS.eventAttachments)
  assertEquals(purge.paths, ['ev/a1.jpg', 'ev/a2.jpg'])
})

// ── chunk ─────────────────────────────────────────────────────────────────────

Deno.test('chunk — splits into bounded batches, remainder last', () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})

Deno.test('chunk — size >= length yields a single batch', () => {
  assertEquals(chunk([1, 2, 3], 10), [[1, 2, 3]])
})

Deno.test('chunk — exactly size === length yields one full batch (boundary)', () => {
  const items = Array.from({ length: STORAGE_REMOVE_CHUNK }, (_, i) => i)
  const batches = chunk(items, STORAGE_REMOVE_CHUNK)
  assertEquals(batches.length, 1)
  assertEquals(batches[0].length, STORAGE_REMOVE_CHUNK)
})

Deno.test('chunk — empty input yields no batches', () => {
  assertEquals(chunk([], 5), [])
})

Deno.test('chunk — reassembling the batches reproduces the input (no loss/dupe)', () => {
  const paths = Array.from({ length: STORAGE_REMOVE_CHUNK * 2 + 7 }, (_, i) => `ev/${i}.jpg`)
  assertEquals(chunk(paths, STORAGE_REMOVE_CHUNK).flat(), paths)
})

Deno.test('chunk — a non-positive size throws (guards an infinite loop)', () => {
  assertThrows(() => chunk([1, 2], 0))
  assertThrows(() => chunk([1, 2], -1))
})
