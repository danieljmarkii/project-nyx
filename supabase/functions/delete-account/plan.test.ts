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
  scopeFoodPaths,
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
// different ownerUserId explicitly via owned({ ... }). Food fixtures similarly pass
// `ownedFoodItemIds` explicitly when they exercise a food path (scopeFoodPaths fails
// closed on an empty owned-id set, so a food path with no matching id is dropped).
const emptyOwned: OwnedStoragePaths = {
  petPhotoPaths: [],
  eventAttachmentPaths: [],
  vetAttachmentPaths: [],
  vetReportPaths: [],
  medicationPhotoPaths: [],
  foodPhotoPaths: [],
  ownedFoodItemIds: [],
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

// ── scopeFoodPaths (B-354 FR-7 cross-tenant owned-id guard) ───────────────────

Deno.test('scopeFoodPaths — keeps only paths whose first segment is an owned food id', () => {
  assertEquals(
    scopeFoodPaths(
      ['food-1/0-front.jpg', 'food-9/0-front.jpg', 'food-2/1-ingredients.jpg'],
      ['food-1', 'food-2'],
    ),
    ['food-1/0-front.jpg', 'food-2/1-ingredients.jpg'],
  )
})

Deno.test('scopeFoodPaths — B-354: a crafted path under ANOTHER account\'s food id is dropped', () => {
  // The attack: an attacker-owned food_items row whose photo_paths references a VICTIM's
  // food id. victim-food is not in the attacker's owned-id set, so it never reaches the
  // service-role purge. (The food twin of the B-128 medication guard.)
  assertEquals(scopeFoodPaths(['victim-food/0-front.jpg'], ['attacker-food']), [])
})

Deno.test('scopeFoodPaths — exact-segment match: a food id that is a string prefix of another does not leak', () => {
  // owned id 'food-1' must NOT authorize 'food-12/…' — first-segment SET membership is
  // exact (split('/')[0] === 'food-12'), so a naive startsWith can't over-match here.
  assertEquals(scopeFoodPaths(['food-12/0-front.jpg'], ['food-1']), [])
  assertEquals(scopeFoodPaths(['food-1/0-front.jpg'], ['food-1']), ['food-1/0-front.jpg'])
})

Deno.test('scopeFoodPaths — an empty owned-id set fails CLOSED (drops everything)', () => {
  // Defense-in-depth: a user with no food rows has no food photos to purge, and no path
  // can legitimately name a food id that isn't theirs. index.ts throws on a food_items
  // read error rather than passing an empty set that would silently drop real paths.
  assertEquals(scopeFoodPaths(['food-1/0-front.jpg'], []), [])
  assertEquals(scopeFoodPaths(['food-1/0-front.jpg'], ['', '   ']), [])
})

Deno.test('scopeFoodPaths — a bare/malformed key with no slash is dropped', () => {
  // A key that is not `{foodId}/…` has a first segment equal to the whole string, which
  // is not an owned food id, so it never matches.
  assertEquals(scopeFoodPaths(['food-1'], ['food-1']), [])
  assertEquals(scopeFoodPaths(['just-a-file.jpg'], ['food-1']), [])
})

Deno.test('scopeFoodPaths — drops nulls/blanks alongside cross-tenant paths', () => {
  assertEquals(
    scopeFoodPaths(['food-1/a.jpg', null, undefined, '', 'victim-food/b.jpg'], ['food-1']),
    ['food-1/a.jpg'],
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
    // {food_item_id}/{slot}.jpg — the per-food-id convention (app/food-capture.tsx).
    foodPhotoPaths: ['food-1/0-front.jpg'],
    ownedFoodItemIds: ['food-1'],
  }))
  const byBucket = Object.fromEntries(purges.map((p) => [p.bucket, p.paths]))
  assertEquals(byBucket[STORAGE_BUCKETS.petPhotos], ['pets/p1.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.eventAttachments], ['ev/a1.jpg', 'ev/a2.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetAttachments], ['vet/v1.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetReports], ['rep/r1.pdf'])
  assertEquals(byBucket[STORAGE_BUCKETS.medicationPhotos], ['user-1/med-9/label.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.foodPhotos], ['food-1/0-front.jpg'])
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

Deno.test('collectStoragePaths — never emits a PRESERVED bucket (invariant survives an empty list)', () => {
  // PRESERVED_BUCKETS is now empty (B-354 FR-7 moved nyx-food-photos into the purge
  // list), so this loop asserts nothing today — but the invariant + its test are kept
  // so that re-introducing any preserve-on-delete carve-out is guarded from day one.
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
    medicationPhotoPaths: ['user-1/med-9/label.jpg'],
    foodPhotoPaths: ['food-1/0-front.jpg'],
    ownedFoodItemIds: ['food-1'],
  }))
  for (const preserved of PRESERVED_BUCKETS) {
    assertEquals(purges.some((p) => p.bucket === preserved), false)
  }
})

Deno.test('collectStoragePaths — B-354 FR-7: an owned food-label photo lands in the nyx-food-photos purge', () => {
  // The inversion of the old FR-4 carve-out: once the catalog went per-account, a food
  // label photo is the user's own data and is PURGED, riding the same path-collection
  // lane as pet/medication photos.
  const purges = collectStoragePaths(owned({
    foodPhotoPaths: ['food-1/0-front.jpg'],
    ownedFoodItemIds: ['food-1'],
  }))
  assertEquals(purges.length, 1)
  assertEquals(purges[0].bucket, STORAGE_BUCKETS.foodPhotos)
  assertEquals(purges[0].bucket, 'nyx-food-photos')
  assertEquals(purges[0].paths, ['food-1/0-front.jpg'])
})

Deno.test('collectStoragePaths — B-354 FR-7: a cross-tenant food path never reaches a purge', () => {
  // End-to-end through the collector: a crafted path naming ANOTHER account's food id is
  // filtered out BEFORE the service-role purge is built, so account deletion can only ever
  // remove the deleting user's OWN food photos.
  const purges = collectStoragePaths(owned({
    foodPhotoPaths: ['food-mine/0-front.jpg', 'food-victim/0-front.jpg'],
    ownedFoodItemIds: ['food-mine'],
  }))
  const food = purges.find((p) => p.bucket === STORAGE_BUCKETS.foodPhotos)
  assert(food, "expected a food-photos purge for the owner's own path")
  assertEquals(food.paths, ['food-mine/0-front.jpg'])
})

Deno.test('collectStoragePaths — B-354 FR-7: an all-cross-tenant food list yields NO food purge', () => {
  const purges = collectStoragePaths(owned({
    foodPhotoPaths: ['food-victim/0-front.jpg'],
    ownedFoodItemIds: ['food-mine'],
  }))
  assertEquals(purges.some((p) => p.bucket === STORAGE_BUCKETS.foodPhotos), false)
})

Deno.test('PRESERVED_BUCKETS — B-354 FR-7: nyx-food-photos is now PURGED, never preserved', () => {
  // Pins the inversion: post per-account re-scope, food-label photos are the user's own
  // data (migration 033 CASCADE-deletes the rows), so the bucket sits in STORAGE_BUCKETS,
  // NOT PRESERVED_BUCKETS. A regression that restored the old "preserve the global catalog"
  // carve-out would leave a deleted user's food photos behind; this fails loudly if so.
  assertEquals((PRESERVED_BUCKETS as readonly string[]).includes('nyx-food-photos'), false)
  assert((Object.values(STORAGE_BUCKETS) as string[]).includes('nyx-food-photos'))
  // And nothing is preserved any more.
  assertEquals(PRESERVED_BUCKETS.length, 0)
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

Deno.test('collectStoragePaths — output buckets are always a subset of the six purgeable buckets', () => {
  const allowed = new Set<string>(Object.values(STORAGE_BUCKETS))
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pets/p1.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
    medicationPhotoPaths: ['user-1/med-9/label.jpg'],
    foodPhotoPaths: ['food-1/0-front.jpg'],
    ownedFoodItemIds: ['food-1'],
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

Deno.test('buildDeletionPlan — B-354 FR-7: a food photo is purged BEFORE the terminal auth delete', () => {
  // End-to-end ordering for the food bucket: migration 033 CASCADE-deletes the food row
  // with the auth-user delete, so the label-photo purge must precede it (FR-6) or the
  // photo is orphaned with no row to find it by. A food-only account still purges then
  // deletes, exactly like a pet-only or med-only one.
  const plan = buildDeletionPlan(owned({
    foodPhotoPaths: ['food-1/0-front.jpg'],
    ownedFoodItemIds: ['food-1'],
  }))
  assertEquals(plan.length, 2)
  assertEquals(plan[0], {
    kind: 'purge-bucket',
    bucket: STORAGE_BUCKETS.foodPhotos,
    paths: ['food-1/0-front.jpg'],
  })
  assert(isAuthDelete(plan[1]))
})

Deno.test('buildDeletionPlan — B-354 FR-7: a crafted cross-tenant food path is never purged', () => {
  // The food twin of the B-128 case: an attacker-owned food row whose only photo_paths
  // value names a VICTIM's food id produces NO purge step — just the terminal auth delete.
  const plan = buildDeletionPlan(owned({
    foodPhotoPaths: ['food-victim/0-front.jpg'],
    ownedFoodItemIds: ['food-attacker'],
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
