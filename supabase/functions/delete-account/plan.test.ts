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
  scopeVetDocumentPaths,
  scopePetPhotoPaths,
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
// closed on an empty owned-id set, so a food path with no matching id is dropped),
// and pet-photo / vet-document fixtures pass `ownedPetIds` for the same reason
// (scopePetPhotoPaths / scopeVetDocumentPaths fail closed too — B-463 / VF-1).
const emptyOwned: OwnedStoragePaths = {
  petPhotoPaths: [],
  eventAttachmentPaths: [],
  vetAttachmentPaths: [],
  vetDocumentPaths: [],
  vetReportPaths: [],
  medicationPhotoPaths: [],
  foodPhotoPaths: [],
  ownedFoodItemIds: [],
  ownedPetIds: [],
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

Deno.test('scopeFoodPaths — B-582: drops every `..` traversal variant the first-segment test kept', () => {
  // THE case B-582 exists for, executed by the B-577 rls-privacy-reviewer against
  // the old filter: in each of these the first segment genuinely IS the attacker's
  // own food id (the `..` is the SECOND segment), so the original first-segment
  // test KEPT all three and they reached the service-role remove() verbatim —
  // cleanPaths never normalises a path. Every legitimate food key is exactly two
  // segments ({foodItemId}/{n}-{slot}.jpg), so the whole-shape test drops them by
  // construction, exactly as scopeVetDocumentPaths already did for its bucket.
  assertEquals(scopeFoodPaths([
    'food-mine/../food-victim/0-front.jpg',
    'food-mine/../../food-victim/0-front.jpg',
    'food-mine//../food-victim/0-front.jpg',
    'food-mine/sub/dir/0-front.jpg',
  ], ['food-mine']), [])

  // And the variants that do not even start with an owned segment.
  assertEquals(
    scopeFoodPaths(['../food-victim/0-front.jpg', 'food-victim/../food-mine/0-front.jpg'], ['food-mine']),
    [],
  )

  // The legitimate two-segment key still survives — a guard that drops everything
  // is not a guard.
  assertEquals(scopeFoodPaths(['food-mine/0-front.jpg'], ['food-mine']), ['food-mine/0-front.jpg'])
})

// ── scopeVetDocumentPaths (B-478 VF-1) ───────────────────────────────────────
// The vet-document twin of scopeFoodPaths, keyed on the owned PET id set. Exists
// to close the `..` prefix residual migration 043 recorded on the sibling bucket,
// so the cases below are written as the attacks rather than as coverage.

Deno.test('scopeVetDocumentPaths — keeps a legitimate {petId}/{docId}.ext key', () => {
  assertEquals(
    scopeVetDocumentPaths(['pet-1/doc-9.pdf', 'pet-2/doc-3.jpg'], ['pet-1', 'pet-2']),
    ['pet-1/doc-9.pdf', 'pet-2/doc-3.jpg'],
  )
})

Deno.test('scopeVetDocumentPaths — drops a path naming a pet the user does not own', () => {
  // The crafted-row attack: an owned vet_documents row whose storage_path names
  // another owner's pet prefix. The table CHECK makes this unwritable through the
  // API today; this is the belt to that braces, because the purge runs as the
  // service role and would remove the literal string.
  assertEquals(
    scopeVetDocumentPaths(['pet-mine/d1.pdf', 'pet-victim/d2.pdf'], ['pet-mine']),
    ['pet-mine/d1.pdf'],
  )
})

Deno.test('scopeVetDocumentPaths — drops EVERY `..` traversal variant the CHECK admits', () => {
  // THE case this function exists for, and the case an earlier revision got wrong.
  // `{ownPetId}/../{victimPetId}/x.pdf` satisfies the table's starts_with CHECK and
  // the Storage INSERT policy (its first FOLDER segment is a pet the caller owns),
  // and cleanPaths never normalises a path — so without this guard it reaches the
  // service-role remove() verbatim.
  //
  // A first-segment-only filter (the scopeFoodPaths shape) KEEPS all of these: the
  // first segment genuinely is `pet-mine`, and the `..` is the SECOND segment. The
  // rls-privacy-reviewer executed that and it is why this checks the whole shape —
  // exactly two segments, per buildVetDocumentPath's `{pet_id}/{document_id}.{ext}`.
  assertEquals(scopeVetDocumentPaths([
    'pet-mine/../pet-victim/x.pdf',
    'pet-mine/../../pet-victim/x.pdf',
    'pet-mine//pet-victim/x.pdf',
    'pet-mine/sub/dir/x.pdf',
  ], ['pet-mine']), [])

  // And the variants that do not even start with an owned segment.
  assertEquals(
    scopeVetDocumentPaths(['../pet-victim/x.pdf', 'pet-victim/../pet-mine/x.pdf'], ['pet-mine']),
    [],
  )

  // The legitimate key still survives — a guard that drops everything is not a guard.
  assertEquals(scopeVetDocumentPaths(['pet-mine/doc-1.pdf'], ['pet-mine']), ['pet-mine/doc-1.pdf'])
})

Deno.test('scopeVetDocumentPaths — a pet id that is a string PREFIX of another is not a match', () => {
  // Exact set membership, never startsWith: `pet-1` must not permit `pet-12/…`.
  assertEquals(scopeVetDocumentPaths(['pet-12/d.pdf'], ['pet-1']), [])
})

Deno.test('scopeVetDocumentPaths — a slashless key is dropped (no folder segment)', () => {
  // storage.foldername on a key with no '/' returns an empty array, so [1] is NULL and
  // the policy drops it. A bare key named for a pet id is not a real document.
  assertEquals(scopeVetDocumentPaths(['pet-1', 'pet-1.pdf'], ['pet-1']), [])
})

Deno.test('scopeVetDocumentPaths — the two-segment rule is NOT lifted to the 3-segment buckets', () => {
  // Guards the generalisation hazard the fix introduces. nyx-vet-attachments keys are
  // `{pet_id}/{visit_id}/{attachment_id}.jpg`, so applying THIS predicate there would
  // drop every legitimate key and silently turn account deletion into a no-op for
  // that bucket. Pin that vet-ATTACHMENT paths still flow through untouched.
  const purges = collectStoragePaths(owned({
    vetAttachmentPaths: ['pet-1/visit-2/att-3.jpg'],
    vetDocumentPaths: ['pet-1/doc-4.pdf'],
    ownedPetIds: ['pet-1'],
  }))
  const byBucket = Object.fromEntries(purges.map((p) => [p.bucket, p.paths]))
  assertEquals(byBucket[STORAGE_BUCKETS.vetAttachments], ['pet-1/visit-2/att-3.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetDocuments], ['pet-1/doc-4.pdf'])
})

Deno.test('scopeVetDocumentPaths — an empty owned-pet set fails CLOSED', () => {
  // A user with no pets has no documents; dropping everything is the safe direction.
  assertEquals(scopeVetDocumentPaths(['pet-1/d.pdf'], []), [])
  assertEquals(scopeVetDocumentPaths(['pet-1/d.pdf'], ['', '   ']), [])
})

Deno.test('scopeVetDocumentPaths — passes nulls through for cleanPaths to drop', () => {
  assertEquals(scopeVetDocumentPaths([null, undefined, 'pet-1/d.pdf'], ['pet-1']), ['pet-1/d.pdf'])
})

// ── scopePetPhotoPaths (B-463) ───────────────────────────────────────────────
// Defense-in-depth BEHIND migration 042's `pets_photo_path_pet_prefix` CHECK.
// The CHECK closed the plain cross-tenant write; these cases pin the two things
// the CHECK does NOT give us — the `..` traversal keys a prefix test admits, and
// safety if the CHECK is ever dropped — so they are written as the attacks.

Deno.test('scopePetPhotoPaths — keeps the legitimate {petId}/profile.jpg key', () => {
  assertEquals(
    scopePetPhotoPaths(['pet-1/profile.jpg', 'pet-2/profile.jpg'], ['pet-1', 'pet-2']),
    ['pet-1/profile.jpg', 'pet-2/profile.jpg'],
  )
})

Deno.test('scopePetPhotoPaths — B-431 finding 4: a path naming an unowned pet is dropped', () => {
  // The original attack: an attacker sets their OWN pet's photo_path to
  // `{victimPetId}/profile.jpg` and deletes their account, turning the service-role
  // purge into a cross-tenant DELETE of the victim's photo. Migration 042's CHECK
  // makes that unwritable through the API today; this is the belt to that braces,
  // because the purge runs as the service role and would remove the literal string.
  assertEquals(
    scopePetPhotoPaths(['pet-mine/profile.jpg', 'pet-victim/profile.jpg'], ['pet-mine']),
    ['pet-mine/profile.jpg'],
  )
})

Deno.test('scopePetPhotoPaths — drops every `..` traversal variant the 042 CHECK admits', () => {
  // The 042 CHECK is `starts_with(photo_path, id::text || '/')` — a PREFIX test —
  // so every one of these is WRITABLE even with the CHECK in place: each starts
  // with the attacker's own `{petId}/`. A first-segment filter keeps them all
  // (the first segment genuinely is owned); the whole-shape test is what drops
  // them. Same residual class the VF-1 review executed on vet documents.
  assertEquals(scopePetPhotoPaths([
    'pet-mine/../pet-victim/profile.jpg',
    'pet-mine/../../pet-victim/profile.jpg',
    'pet-mine//../pet-victim/profile.jpg',
    'pet-mine/sub/dir/profile.jpg',
  ], ['pet-mine']), [])

  // The legitimate key still survives.
  assertEquals(scopePetPhotoPaths(['pet-mine/profile.jpg'], ['pet-mine']), ['pet-mine/profile.jpg'])
})

Deno.test('scopePetPhotoPaths — a pet id that is a string PREFIX of another is not a match', () => {
  // Exact set membership, never startsWith: `pet-1` must not permit `pet-12/…`.
  assertEquals(scopePetPhotoPaths(['pet-12/profile.jpg'], ['pet-1']), [])
})

Deno.test('scopePetPhotoPaths — a slashless key is dropped', () => {
  assertEquals(scopePetPhotoPaths(['pet-1', 'pet-1.jpg'], ['pet-1']), [])
})

Deno.test('scopePetPhotoPaths — an empty owned-pet set fails CLOSED', () => {
  // A user with no pets has no pet photos; dropping everything is the safe
  // direction, and it is also the real zero-pets state — index.ts derives both
  // the paths and the ids from the same `pets` read, so they are empty together.
  assertEquals(scopePetPhotoPaths(['pet-1/profile.jpg'], []), [])
  assertEquals(scopePetPhotoPaths(['pet-1/profile.jpg'], ['', '   ']), [])
})

Deno.test('scopePetPhotoPaths — passes nulls through for cleanPaths to drop', () => {
  // The dominant real-world shape: a pet row with no photo has photo_path NULL.
  assertEquals(scopePetPhotoPaths([null, undefined, 'pet-1/profile.jpg'], ['pet-1']), ['pet-1/profile.jpg'])
})

// ── collectStoragePaths ───────────────────────────────────────────────────────

Deno.test('collectStoragePaths — maps each owned list to its correct bucket', () => {
  const purges = collectStoragePaths(owned({
    // {pet_id}/profile.jpg — the B-431 convention (app/(tabs)/profile.tsx); the
    // pet id must be in ownedPetIds or the B-463 guard drops it.
    petPhotoPaths: ['pet-1/profile.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg', 'ev/a2.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    // {pet_id}/{document_id}.{ext} — the B-478 convention (buildVetDocumentPath).
    vetDocumentPaths: ['pet-1/doc-7.pdf'],
    ownedPetIds: ['pet-1'],
    vetReportPaths: ['rep/r1.pdf'],
    // {user_id}/{medication_item_id}/{slot}.jpg — the per-user-prefix convention
    // from migration 021 (buildMedicationPhotoPath).
    medicationPhotoPaths: ['user-1/med-9/label.jpg'],
    // {food_item_id}/{slot}.jpg — the per-food-id convention (app/food-capture.tsx).
    foodPhotoPaths: ['food-1/0-front.jpg'],
    ownedFoodItemIds: ['food-1'],
  }))
  const byBucket = Object.fromEntries(purges.map((p) => [p.bucket, p.paths]))
  assertEquals(byBucket[STORAGE_BUCKETS.petPhotos], ['pet-1/profile.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.eventAttachments], ['ev/a1.jpg', 'ev/a2.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetAttachments], ['vet/v1.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetDocuments], ['pet-1/doc-7.pdf'])
  assertEquals(byBucket[STORAGE_BUCKETS.vetReports], ['rep/r1.pdf'])
  assertEquals(byBucket[STORAGE_BUCKETS.medicationPhotos], ['user-1/med-9/label.jpg'])
  assertEquals(byBucket[STORAGE_BUCKETS.foodPhotos], ['food-1/0-front.jpg'])
})

Deno.test('collectStoragePaths — B-478 VF-1: an owned vet document lands in the nyx-vet-documents purge', () => {
  // AC 8's precondition: the bucket is in the purge plan from the migration's own PR,
  // before any capture surface exists to put an object in it.
  const purges = collectStoragePaths(owned({
    vetDocumentPaths: ['pet-1/doc-7.pdf'],
    ownedPetIds: ['pet-1'],
  }))
  assertEquals(purges.length, 1)
  assertEquals(purges[0].bucket, STORAGE_BUCKETS.vetDocuments)
  assertEquals(purges[0].bucket, 'nyx-vet-documents')
  assertEquals(purges[0].paths, ['pet-1/doc-7.pdf'])
})

Deno.test('collectStoragePaths — B-478 VF-1: a vet-document path for an unowned pet never reaches a purge', () => {
  const purges = collectStoragePaths(owned({
    vetDocumentPaths: ['pet-mine/d1.pdf', 'pet-victim/d2.pdf'],
    ownedPetIds: ['pet-mine'],
  }))
  const docs = purges.find((p) => p.bucket === STORAGE_BUCKETS.vetDocuments)
  assert(docs, "expected a vet-documents purge for the owner's own path")
  assertEquals(docs.paths, ['pet-mine/d1.pdf'])
})

Deno.test('collectStoragePaths — B-478 VF-1: vet-document paths with no owned pet ids yield NO purge', () => {
  // Fails closed. Also the shape of the zero-pets early return in index.ts, which
  // supplies both an empty path list and an empty owned-pet set.
  assertEquals(
    collectStoragePaths(owned({ vetDocumentPaths: ['pet-1/d.pdf'], ownedPetIds: [] }))
      .some((p) => p.bucket === STORAGE_BUCKETS.vetDocuments),
    false,
  )
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
  // Pet exists but never had a photo uploaded → photo_path is NULL → nothing to
  // remove. ownedPetIds carries the pet, so it is the NULL (not the B-463 guard)
  // doing the dropping here.
  const purges = collectStoragePaths(owned({ petPhotoPaths: [null], ownedPetIds: ['pet-1'] }))
  assertEquals(purges, [])
})

Deno.test('collectStoragePaths — B-463: an owned pet photo lands in the nyx-pet-photos purge', () => {
  // The guard must not cost the purge its legitimate objects: the one real key
  // shape ({petId}/profile.jpg, the only writer's output) flows through to the
  // bucket exactly as before the guard existed.
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pet-1/profile.jpg'],
    ownedPetIds: ['pet-1'],
  }))
  assertEquals(purges.length, 1)
  assertEquals(purges[0].bucket, STORAGE_BUCKETS.petPhotos)
  assertEquals(purges[0].bucket, 'nyx-pet-photos')
  assertEquals(purges[0].paths, ['pet-1/profile.jpg'])
})

Deno.test('collectStoragePaths — B-463: a cross-tenant pet-photo path never reaches a purge', () => {
  // End-to-end through the collector: a crafted photo_path naming ANOTHER owner's
  // pet — or hiding the victim behind the owner's own prefix with `..` — is
  // filtered out BEFORE the service-role purge is built.
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pet-mine/profile.jpg', 'pet-victim/profile.jpg', 'pet-mine/../pet-victim/profile.jpg'],
    ownedPetIds: ['pet-mine'],
  }))
  const pets = purges.find((p) => p.bucket === STORAGE_BUCKETS.petPhotos)
  assert(pets, "expected a pet-photos purge for the owner's own path")
  assertEquals(pets.paths, ['pet-mine/profile.jpg'])
})

Deno.test('collectStoragePaths — B-463: pet-photo paths with no owned pet ids yield NO purge', () => {
  // Fails closed, and matches the real zero-pets state: index.ts derives paths and
  // ids from the same `pets` read, so they can only be non-empty together.
  assertEquals(
    collectStoragePaths(owned({ petPhotoPaths: ['pet-1/profile.jpg'], ownedPetIds: [] }))
      .some((p) => p.bucket === STORAGE_BUCKETS.petPhotos),
    false,
  )
})

Deno.test('collectStoragePaths — never emits a PRESERVED bucket (invariant survives an empty list)', () => {
  // PRESERVED_BUCKETS is now empty (B-354 FR-7 moved nyx-food-photos into the purge
  // list), so this loop asserts nothing today — but the invariant + its test are kept
  // so that re-introducing any preserve-on-delete carve-out is guarded from day one.
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pet-1/profile.jpg'],
    ownedPetIds: ['pet-1'],
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

Deno.test('collectStoragePaths — output buckets are always a subset of the purgeable buckets', () => {
  const allowed = new Set<string>(Object.values(STORAGE_BUCKETS))
  const purges = collectStoragePaths(owned({
    petPhotoPaths: ['pet-1/profile.jpg'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetDocumentPaths: ['pet-1/doc-7.pdf'],
    ownedPetIds: ['pet-1'],
    vetReportPaths: ['rep/r1.pdf'],
    medicationPhotoPaths: ['user-1/med-9/label.jpg'],
    foodPhotoPaths: ['food-1/0-front.jpg'],
    ownedFoodItemIds: ['food-1'],
  }))
  for (const p of purges) assert(allowed.has(p.bucket), `unexpected bucket ${p.bucket}`)
})

Deno.test('STORAGE_BUCKETS — every bucket the app writes to is in the purge set (B-478 VF-1)', () => {
  // A whole-list pin rather than another per-bucket assertion. The failure this
  // catches is the one deletion coverage actually suffers from: a new bucket ships
  // with a feature, nobody adds it here, and account deletion silently leaves a
  // corpus behind — which looks exactly like success. Adding a bucket must break
  // this test and force the purge decision to be made explicitly.
  assertEquals(new Set<string>(Object.values(STORAGE_BUCKETS)), new Set([
    'nyx-pet-photos',
    'nyx-event-attachments',
    'nyx-vet-attachments',
    'nyx-vet-documents',
    'nyx-vet-reports',
    'nyx-medication-photos',
    'nyx-food-photos',
  ]))
})

// ── buildDeletionPlan (FR-6 ordering invariant) ───────────────────────────────

const isAuthDelete = (s: DeletionStep) => s.kind === 'delete-auth-user'

Deno.test('buildDeletionPlan — auth-user delete is ALWAYS the final step', () => {
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pet-1/profile.jpg'],
    ownedPetIds: ['pet-1'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
  }))
  assert(isAuthDelete(plan[plan.length - 1]), 'last step must be delete-auth-user')
})

Deno.test('buildDeletionPlan — auth-user delete appears EXACTLY once', () => {
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pet-1/profile.jpg'],
    ownedPetIds: ['pet-1'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['rep/r1.pdf'],
  }))
  assertEquals(plan.filter(isAuthDelete).length, 1)
})

Deno.test('buildDeletionPlan — every Storage purge precedes the auth delete', () => {
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pet-1/profile.jpg'],
    ownedPetIds: ['pet-1'],
    eventAttachmentPaths: ['ev/a1.jpg'],
  }))
  const authIdx = plan.findIndex(isAuthDelete)
  const lastPurgeIdx = plan.map((s) => s.kind).lastIndexOf('purge-bucket')
  assert(lastPurgeIdx < authIdx, 'all purges must come before the auth-user delete')
})

Deno.test('buildDeletionPlan — single non-empty bucket: purge then auth delete', () => {
  const plan = buildDeletionPlan(owned({ petPhotoPaths: ['pet-1/profile.jpg'], ownedPetIds: ['pet-1'] }))
  assertEquals(plan.length, 2)
  assertEquals(plan[0], { kind: 'purge-bucket', bucket: STORAGE_BUCKETS.petPhotos, paths: ['pet-1/profile.jpg'] })
  assert(isAuthDelete(plan[1]))
})

Deno.test('buildDeletionPlan — B-463: a crafted cross-tenant pet-photo path is never purged', () => {
  // The pet twin of the B-128 / B-354 cases, end-to-end: an account whose only
  // photo_path values name a victim's pet (plain, or hidden behind the owner's
  // own prefix with `..`) produces NO purge step — just the terminal auth delete.
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pet-victim/profile.jpg', 'pet-mine/../pet-victim/profile.jpg'],
    ownedPetIds: ['pet-mine'],
  }))
  assertEquals(plan, [{ kind: 'delete-auth-user' }])
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
