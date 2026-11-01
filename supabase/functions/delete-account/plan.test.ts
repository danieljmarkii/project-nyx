// Unit tests for delete-account pure plan logic (AC-11).
// Run with: deno test supabase/functions/delete-account/plan.test.ts
//
// Covers the two things that must be provably correct and that the
// rls-privacy-reviewer attacks: the Storage path collection/scoping/exclusion
// (FR-3/FR-4), and the destructive ORDER (FR-6 — auth user deleted last, once,
// after every purge). The DB reads, the Storage remove() calls, and the auth
// delete are I/O and verified by curl against a throwaway account.

import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  cleanPaths,
  scopeMedicationPaths,
  scopeFoodPaths,
  scopeVetDocumentPaths,
  scopeVetReportPaths,
  scopePetPhotoPaths,
  collectStoragePaths,
  buildDeletionPlan,
  chunk,
  extractPassword,
  listPrefixForSweep,
  listPrefixRecursive,
  readAllOwnedPaths,
  buildPrefixSweep,
  mergeSweepIds,
  SWEEP_BUDGET_MS,
  SWEEP_CONCURRENCY,
  sweepOwnedPrefixes,
  SWEEP_SCOPE,
  STORAGE_BUCKETS,
  STORAGE_LIST_MAX_DEPTH,
  STORAGE_LIST_PAGE,
  PRESERVED_BUCKETS,
  STORAGE_REMOVE_CHUNK,
  type OwnedStoragePaths,
  type DeletionStep,
  type StorageListEntry,
  type StorageLister,
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

Deno.test('scopeFoodPaths — F1: a degenerate second segment is dropped', () => {
  // Same F1 clause on the food guard (shared predicate) — `{own}/`, `{own}/.`,
  // `{own}/..` are two-segment and owned, but carry no real filename.
  assertEquals(scopeFoodPaths(['food-1/', 'food-1/.', 'food-1/..'], ['food-1']), [])
  assertEquals(scopeFoodPaths(['food-1/..', 'food-1/0-front.jpg'], ['food-1']), ['food-1/0-front.jpg'])
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

Deno.test('scopeVetDocumentPaths — F1: a degenerate second segment is dropped (`{own}/`, `{own}/.`, `{own}/..`)', () => {
  // The B-582-review F1 clause: these are TWO segments with an owned first segment,
  // so they pass the shape+ownership test — but the second segment is empty / `.` /
  // `..`, which is not a real document. `{own}/..` in particular must not survive:
  // under a normalising backend its blast radius is the bucket root, not one object.
  assertEquals(scopeVetDocumentPaths(['pet-1/', 'pet-1/.', 'pet-1/..'], ['pet-1']), [])
  // The real key alongside them still survives — the clause drops nothing real.
  assertEquals(
    scopeVetDocumentPaths(['pet-1/', 'pet-1/doc-9.pdf', 'pet-1/..'], ['pet-1']),
    ['pet-1/doc-9.pdf'],
  )
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

// ── scopeVetReportPaths (CUL-2282, VR2-1) ────────────────────────────────────
// `vet_reports.storage_path` is unconstrained TEXT, so this guard is the ONLY thing
// between a crafted owned row and a service-role remove() of another owner's report.

Deno.test('scopeVetReportPaths — keeps a legitimate {petId}/{reportId}.pdf key', () => {
  assertEquals(
    scopeVetReportPaths(['pet-1/rep-1.pdf', 'pet-2/rep-9.pdf'], ['pet-1', 'pet-2']),
    ['pet-1/rep-1.pdf', 'pet-2/rep-9.pdf'],
  )
})

Deno.test('scopeVetReportPaths — drops a path naming a pet the user does not own', () => {
  // The attack: an owned vet_reports row whose storage_path names a victim's pet.
  assertEquals(
    scopeVetReportPaths(['pet-mine/r1.pdf', 'pet-victim/r2.pdf'], ['pet-mine']),
    ['pet-mine/r1.pdf'],
  )
})

Deno.test('scopeVetReportPaths — drops every `..` traversal variant', () => {
  // The first segment of `{own}/../{victim}/x.pdf` IS an owned pet; only the
  // two-segment shape test drops it.
  assertEquals(scopeVetReportPaths([
    'pet-mine/../pet-victim/r.pdf',
    'pet-mine/../../pet-victim/r.pdf',
    'pet-mine//pet-victim/r.pdf',
    '../pet-victim/r.pdf',
    'pet-victim/../pet-mine/r.pdf',
    './pet-mine/r.pdf',
  ], ['pet-mine']), [])
})

Deno.test('scopeVetReportPaths — a degenerate, slashless or extra-segment key is dropped', () => {
  assertEquals(scopeVetReportPaths(['pet-1/', 'pet-1/.', 'pet-1/..', 'pet-1', 'pet-1/a/r.pdf'], ['pet-1']), [])
})

Deno.test('scopeVetReportPaths — a pet id that is a string PREFIX of another is not a match', () => {
  assertEquals(scopeVetReportPaths(['pet-12/r.pdf'], ['pet-1']), [])
})

Deno.test('scopeVetReportPaths — an empty owned-pet set fails CLOSED', () => {
  assertEquals(scopeVetReportPaths(['pet-1/r.pdf'], []), [])
  assertEquals(scopeVetReportPaths(['pet-1/r.pdf'], ['', '   ']), [])
})

Deno.test('scopeVetReportPaths — passes nulls through for cleanPaths to drop', () => {
  assertEquals(scopeVetReportPaths([null, undefined, 'pet-1/r.pdf'], ['pet-1']), ['pet-1/r.pdf'])
})

Deno.test('collectStoragePaths — CUL-2282: a foreign or traversal report path never reaches the purge', () => {
  const purges = collectStoragePaths(owned({
    ownedPetIds: ['pet-mine'],
    vetReportPaths: ['pet-mine/r1.pdf', 'pet-victim/r2.pdf', 'pet-mine/../pet-victim/r3.pdf'],
  }))
  const byBucket = Object.fromEntries(purges.map((p) => [p.bucket, p.paths]))
  assertEquals(byBucket[STORAGE_BUCKETS.vetReports], ['pet-mine/r1.pdf'])
  for (const p of purges) {
    for (const key of p.paths) assert(!key.includes('pet-victim'), `victim key reached ${p.bucket}: ${key}`)
  }
})

Deno.test('collectStoragePaths — CUL-2282: a user with no pets purges no report, even a listed one', () => {
  const purges = collectStoragePaths(owned({ vetReportPaths: ['pet-victim/r.pdf'] }))
  assertEquals(purges.some((p) => p.bucket === STORAGE_BUCKETS.vetReports), false)
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

Deno.test('scopePetPhotoPaths — F1: a degenerate second segment is dropped', () => {
  // `{ownPet}/`, `{ownPet}/.`, `{ownPet}/..` pass the shape+ownership test but name
  // no real photo; `{ownPet}/..` is the bucket-root-blast key the F1 clause exists
  // to drop. Writable today: 042's CHECK is a starts_with prefix test.
  assertEquals(scopePetPhotoPaths(['pet-1/', 'pet-1/.', 'pet-1/..'], ['pet-1']), [])
  assertEquals(scopePetPhotoPaths(['pet-1/..', 'pet-1/profile.jpg'], ['pet-1']), ['pet-1/profile.jpg'])
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
    vetReportPaths: ['pet-1/rep-1.pdf'],
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
  assertEquals(byBucket[STORAGE_BUCKETS.vetReports], ['pet-1/rep-1.pdf'])
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
    vetReportPaths: ['pet-1/rep-1.pdf'],
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
    vetReportPaths: ['pet-1/rep-1.pdf'],
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
    vetReportPaths: ['pet-1/rep-1.pdf'],
  }))
  assert(isAuthDelete(plan[plan.length - 1]), 'last step must be delete-auth-user')
})

Deno.test('buildDeletionPlan — auth-user delete appears EXACTLY once', () => {
  const plan = buildDeletionPlan(owned({
    petPhotoPaths: ['pet-1/profile.jpg'],
    ownedPetIds: ['pet-1'],
    eventAttachmentPaths: ['ev/a1.jpg'],
    vetAttachmentPaths: ['vet/v1.jpg'],
    vetReportPaths: ['pet-1/rep-1.pdf'],
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

// ── extractPassword (B-119 re-auth gate) ─────────────────────────────────────────
// The security-relevant contract: return the password ONLY for a non-empty string
// value; fail closed (null → the shell 401s before any delete) on every other
// shape. These pin the `typeof === 'string'` check a refactor could otherwise
// silently drop.

Deno.test('extractPassword — returns a non-empty string password', () => {
  assertEquals(extractPassword({ password: 'hunter2' }), 'hunter2')
})

Deno.test('extractPassword — never trims (whitespace can be significant)', () => {
  assertEquals(extractPassword({ password: ' ' }), ' ')
  assertEquals(extractPassword({ password: '  pw  ' }), '  pw  ')
})

Deno.test('extractPassword — empty string fails closed', () => {
  assertEquals(extractPassword({ password: '' }), null)
})

Deno.test('extractPassword — non-string values fail closed (type confusion)', () => {
  assertEquals(extractPassword({ password: 5 }), null)
  assertEquals(extractPassword({ password: true }), null)
  assertEquals(extractPassword({ password: null }), null)
  assertEquals(extractPassword({ password: {} }), null)
  assertEquals(extractPassword({ password: [] }), null)
  assertEquals(extractPassword({ password: ['pw'] }), null)
})

Deno.test('extractPassword — missing key / non-object body fails closed', () => {
  assertEquals(extractPassword({}), null)
  assertEquals(extractPassword({ other: 'x' }), null)
  assertEquals(extractPassword(null), null)
  assertEquals(extractPassword(undefined), null)
  assertEquals(extractPassword('hunter2'), null) // whole body a bare string
  assertEquals(extractPassword(5), null)
  assertEquals(extractPassword(true), null)
})

// ── listPrefixRecursive (CUL-1764) ────────────────────────────────────────────
//
// A fake bucket: a flat set of object keys, listed one level at a time the way
// storage-api does (direct children only, folders with a null id, name-sorted,
// paged by offset/limit). Records every call so paging can be asserted.
function fakeBucket(objectKeys: string[], opts: { pageCap?: number; failOn?: string } = {}) {
  const calls: { prefix: string; offset: number; limit: number }[] = []
  const lister: StorageLister = (prefix, offset, limit) => {
    calls.push({ prefix, offset, limit })
    if (opts.failOn !== undefined && prefix === opts.failOn) {
      return Promise.reject(new Error(`list failed at ${prefix}`))
    }
    const children = new Map<string, StorageListEntry>()
    for (const key of objectKeys) {
      if (!key.startsWith(`${prefix}/`)) continue
      const rest = key.slice(prefix.length + 1).split('/')
      const name = rest[0]
      children.set(name, { name, id: rest.length === 1 ? `obj-${key}` : null })
    }
    const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name))
    const size = Math.min(limit, opts.pageCap ?? limit)
    return Promise.resolve(sorted.slice(offset, offset + size))
  }
  return { lister, calls }
}

Deno.test('listPrefixRecursive — an abandoned capture with no row is found under {uid}/', async () => {
  const { lister } = fakeBucket([
    'user-1/med-orphan/0-label.jpg',
    'user-1/med-9/0-label.jpg',
    'user-1/med-9/1-back.jpg',
    'user-2/med-x/0-label.jpg',
  ])
  const keys = await listPrefixRecursive(lister, 'user-1')
  assertEquals(keys.sort(), [
    'user-1/med-9/0-label.jpg',
    'user-1/med-9/1-back.jpg',
    'user-1/med-orphan/0-label.jpg',
  ])
})

Deno.test('listPrefixRecursive — the listed orphan reaches the medication purge (end to end over the plan)', async () => {
  const { lister } = fakeBucket(['user-1/med-orphan/0-label.jpg'])
  const listed = await listPrefixRecursive(lister, 'user-1')
  // No medication_items row names it: rows contribute nothing, the listing everything.
  const plan = buildDeletionPlan(owned({ medicationPhotoPaths: listed }))
  assertEquals(plan[0], {
    kind: 'purge-bucket',
    bucket: STORAGE_BUCKETS.medicationPhotos,
    paths: ['user-1/med-orphan/0-label.jpg'],
  })
  assertEquals(plan[plan.length - 1], { kind: 'delete-auth-user' })
})

Deno.test('listPrefixRecursive — a row path and the same listed path purge once', () => {
  const plan = buildDeletionPlan(owned({
    medicationPhotoPaths: ['user-1/med-9/0-label.jpg', 'user-1/med-9/0-label.jpg', 'user-1/med-orphan/0-label.jpg'],
  }))
  assertEquals(plan[0], {
    kind: 'purge-bucket',
    bucket: STORAGE_BUCKETS.medicationPhotos,
    paths: ['user-1/med-9/0-label.jpg', 'user-1/med-orphan/0-label.jpg'],
  })
})

Deno.test('listPrefixRecursive — pages past one page and advances by rows received', async () => {
  const keys = Array.from({ length: STORAGE_LIST_PAGE * 2 + 7 }, (_, i) => `user-1/med-${String(i).padStart(4, '0')}/0-label.jpg`)
  const { lister, calls } = fakeBucket(keys)
  const listed = await listPrefixRecursive(lister, 'user-1')
  assertEquals(listed.length, keys.length)
  const rootCalls = calls.filter((c) => c.prefix === 'user-1')
  assertEquals(rootCalls.map((c) => c.offset), [0, STORAGE_LIST_PAGE, STORAGE_LIST_PAGE * 2, STORAGE_LIST_PAGE * 2 + 7])
})

Deno.test('listPrefixRecursive — a server that caps pages below the request still completes', async () => {
  const keys = Array.from({ length: 25 }, (_, i) => `user-1/med-${String(i).padStart(2, '0')}/0-label.jpg`)
  // A page cap of 10 returns short pages; a "short page ends the walk" loop would stop at 10.
  const { lister } = fakeBucket(keys, { pageCap: 10 })
  assertEquals((await listPrefixRecursive(lister, 'user-1')).length, 25)
})

Deno.test('listPrefixRecursive — a list error rejects (the run aborts, the account survives)', async () => {
  const { lister } = fakeBucket(['user-1/med-9/0-label.jpg'], { failOn: 'user-1/med-9' })
  await assertRejects(() => listPrefixRecursive(lister, 'user-1'), Error, 'list failed')
})

Deno.test('listPrefixRecursive — a blank or multi-segment root fails closed (never the bucket top level)', async () => {
  const { lister, calls } = fakeBucket(['user-1/med-9/0-label.jpg'])
  for (const root of ['', '   ', '..', 'user-1/..', 'a/b']) {
    await assertRejects(() => listPrefixRecursive(lister, root), Error, 'single-segment root')
  }
  assertEquals(calls.length, 0)
})

Deno.test('listPrefixRecursive — an empty, dot, dot-dot or slashed name fails loud, never skipped or walked', async () => {
  for (const bad of [
    { name: '', id: null },
    { name: '..', id: null },
    { name: '.', id: 'f1' },
    { name: 'a/../b', id: 'f3' },
  ] as StorageListEntry[]) {
    const calls: string[] = []
    const lister: StorageLister = (prefix, offset) => {
      calls.push(prefix)
      if (prefix !== 'user-1' || offset > 0) return Promise.resolve([])
      return Promise.resolve([{ name: 'ok.jpg', id: 'f4' }, bad])
    }
    await assertRejects(() => listPrefixRecursive(lister, 'user-1'), Error, 'unsafe object name')
    // Never descended into: a skipped-but-walked `..` would list `user-1/..`.
    assertEquals(calls.filter((c) => c !== 'user-1'), [])
  }
})

Deno.test('listPrefixRecursive — a tree deeper than the cap fails loud rather than truncating', async () => {
  const deep = ['user-1', ...Array.from({ length: STORAGE_LIST_MAX_DEPTH + 1 }, (_, i) => `d${i}`), 'x.jpg'].join('/')
  const { lister } = fakeBucket([deep])
  await assertRejects(() => listPrefixRecursive(lister, 'user-1'), Error, 'deeper than')
})

Deno.test('listPrefixRecursive — a crafted cross-tenant key from a lister is still dropped by the {uid}/ guard', () => {
  // Defense in depth: even if a listing ever returned a key outside the root,
  // scopeMedicationPaths keeps only the deleting user's own prefix.
  const plan = buildDeletionPlan(owned({ medicationPhotoPaths: ['user-2/med-x/0-label.jpg', 'user-12/m/0-label.jpg'] }))
  assertEquals(plan, [{ kind: 'delete-auth-user' }])
})

// ── readAllOwnedPaths (CUL-2312) ──────────────────────────────────────────────
// A fake PostgREST over `n` owned rows that serves at most `cap` rows per request,
// whatever range is asked for: the server-side `max-rows` the function cannot see.
function cappedTable(
  n: number,
  cap: number,
  opts: { count?: boolean; error?: string; beforeRequest?: (call: number, rows: OwnedRow[]) => void } = {},
) {
  const rows: OwnedRow[] = Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(6, '0')}`,
    storage_path: `pet-1/obj-${i}.jpg`,
  }))
  const original = rows.map((r) => r.storage_path)
  const ranges: [number, number][] = []
  const page = (from: number, to: number) => {
    opts.beforeRequest?.(ranges.length, rows)
    ranges.push([from, to])
    if (opts.error) return Promise.resolve({ data: null, error: { message: opts.error }, count: null })
    const served = rows.slice(from, Math.min(to + 1, from + cap))
    return Promise.resolve({ data: served, error: null, count: opts.count === false ? null : rows.length })
  }
  return { rows, original, page, ranges }
}
type OwnedRow = { id: string; storage_path: string }

Deno.test('readAllOwnedPaths — a server cap BELOW the page size still returns every path', async () => {
  // The CUL-2312 defect: under max-rows 200 the old loop read page one (200 < 500),
  // took the short page for the end and erased 200 of 1,234 objects under ok: true.
  const t = cappedTable(1234, 200)
  const paths = await readAllOwnedPaths('vet_documents', t.page)
  assertEquals(paths.length, 1234)
  assertEquals(new Set(paths).size, 1234)
  assertEquals(paths, t.original)
  assert(t.ranges.length > 1, 'a short first page must not end the walk')
})

Deno.test('readAllOwnedPaths — a two-row cap still returns every path', async () => {
  const t = cappedTable(7, 2)
  assertEquals(await readAllOwnedPaths('event_attachments', t.page), t.original)
})

Deno.test('readAllOwnedPaths — a one-row cap cannot advance past the overlap row, so it THROWS', async () => {
  // fetchAll re-reads one row per page for its continuity check, so a max-rows of 1
  // never moves past row 0. It must fail loud (account intact), never erase one object.
  const t = cappedTable(7, 1)
  await assertRejects(() => readAllOwnedPaths('event_attachments', t.page), Error, 'completeness unproven')
})

Deno.test('readAllOwnedPaths — an uncapped multi-page table returns every path once', async () => {
  const t = cappedTable(1201, 10_000)
  const paths = await readAllOwnedPaths('event_attachments', t.page)
  assertEquals(paths, t.original)
})

Deno.test('readAllOwnedPaths — an empty table is complete, not an error', async () => {
  assertEquals(await readAllOwnedPaths('vet_reports', cappedTable(0, 500).page), [])
})

Deno.test('readAllOwnedPaths — an absent count is incomplete and THROWS (never a clean erase)', async () => {
  // Even when every row did come back: without the count nothing proves it.
  const t = cappedTable(3, 500, { count: false })
  await assertRejects(() => readAllOwnedPaths('vet_visit_attachments', t.page), Error, 'completeness unproven')
})

Deno.test('readAllOwnedPaths — a query error THROWS rather than reading as no files', async () => {
  const t = cappedTable(3, 500, { error: 'permission denied' })
  await assertRejects(() => readAllOwnedPaths('vet_documents', t.page), Error, 'permission denied')
})

Deno.test('readAllOwnedPaths — a table past the page ceiling THROWS rather than truncating', async () => {
  // 40 pages x a 10-row cap = 400 rows readable; 401 cannot be proven complete.
  const t = cappedTable(401, 10)
  await assertRejects(() => readAllOwnedPaths('event_attachments', t.page), Error, 'completeness unproven')
})

Deno.test('readAllOwnedPaths — a row inserted AHEAD of the cursor mid-read is read, and no pre-existing row is lost', async () => {
  // rls-privacy-reviewer pass 1 on CUL-2312: ids are random v4, so under `id ASC` an insert
  // can land in the unread tail. A walk that stopped at page 0's count ended one row short
  // (`obj-998` left in Storage under ok: true). This walk runs to the end of the table.
  const t = cappedTable(999, 1000, {
    beforeRequest: (call, rows) => {
      if (call === 1) rows.splice(900, 0, { id: 'id-000899x', storage_path: 'pet-1/late.jpg' })
    },
  })
  const paths = await readAllOwnedPaths('vet_documents', t.page)
  for (const p of t.original) assert(paths.includes(p), `${p} was not read`)
  assert(paths.includes('pet-1/late.jpg'))
})

Deno.test('readAllOwnedPaths — insert ahead mid-walk plus a delete of a read row before the recount THROWS or reads all', async () => {
  // rls-privacy-reviewer pass 2: with a count-stopping walk this returned ok: true with
  // `p/998` unread, because the delete made the recount agree with the short list.
  for (const [n, cap] of [[999, 1000], [5, 2], [797, 200]] as const) {
    let lastPageCall = -1
    const t = cappedTable(n, cap, {
      beforeRequest: (call, rows) => {
        if (call === 1) rows.splice(Math.floor(rows.length * 0.9), 0, { id: `id-${String(Math.floor(n * 0.9)).padStart(6, '0')}x`, storage_path: 'pet-1/late.jpg' })
        if (lastPageCall >= 0 && call === lastPageCall + 1) rows.splice(0, 1)
      },
    })
    const wrapped = (from: number, to: number) => {
      if (from === 0 && to === 0) lastPageCall = t.ranges.length - 1
      return t.page(from, to)
    }
    // The delete lands just before the recount, so it is a write after the walk: loud.
    await assertRejects(() => readAllOwnedPaths('event_attachments', wrapped), Error, 'completeness unproven')
  }
})

// A seeded fuzz over concurrent writes. The property an erasure path needs: the call
// either THROWS, or returns every row that existed when the read began AND still exists
// when it returned. (A row deleted mid-read is gone from the database; its object is the
// client delete path's to remove, not this function's.)
Deno.test('readAllOwnedPaths — fuzz: concurrent inserts and deletes never yield success with a live row unread', async () => {
  let seed = 2312
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  let successes = 0
  let throws = 0
  let nextId = 0
  for (let trial = 0; trial < 3000; trial++) {
    const n = 1 + Math.floor(rand() * 60)
    const cap = 2 + Math.floor(rand() * 12)
    const writeRate = rand() * 0.6
    const rows: OwnedRow[] = []
    const mkId = () => `${rand().toString(36).slice(2, 10)}-${nextId++}`
    for (let i = 0; i < n; i++) rows.push({ id: mkId(), storage_path: '' })
    for (const r of rows) r.storage_path = `pet-1/${r.id}.jpg`
    rows.sort((x, y) => (x.id < y.id ? -1 : 1))
    const startIds = new Set(rows.map((r) => r.id))
    const page = (from: number, to: number) => {
      // Before each request, a burst of up to three writes: inserts at random places and
      // deletes. One write per request cannot beat the recount alone, so the layers under
      // it (the overlap check, the walk to the end) would go untested; a burst reaches them.
      for (let k = 0; k < 3; k++) if (rand() < writeRate) {
        if (rand() < 0.5 || rows.length === 0) {
          const id = mkId()
          rows.push({ id, storage_path: `pet-1/${id}.jpg` })
          rows.sort((x, y) => (x.id < y.id ? -1 : 1))
        } else {
          rows.splice(Math.floor(rand() * rows.length), 1)
        }
      }
      if (from >= rows.length && from > 0) {
        return Promise.resolve({ data: null, error: { message: 'Requested range not satisfiable', code: 'PGRST103' }, count: null })
      }
      const served = rows.slice(from, Math.min(to + 1, from + cap))
      return Promise.resolve({ data: served, error: null, count: rows.length })
    }
    try {
      const paths = new Set(await readAllOwnedPaths('vet_documents', page))
      successes++
      for (const r of rows) {
        if (startIds.has(r.id)) assert(paths.has(r.storage_path), `trial ${trial}: live row ${r.id} unread under success`)
      }
    } catch (e) {
      assert((e as Error).message.includes('completeness unproven'), (e as Error).message)
      throws++
    }
  }
  // Non-vacuity: the fuzz must exercise both outcomes.
  assert(successes > 200, `only ${successes} successes`)
  assert(throws > 1000, `only ${throws} throws`)
})

Deno.test('readAllOwnedPaths — a row inserted after the walk but before the recount THROWS', async () => {
  // Calls: 0 = page 0, 1 = the end-of-table page, 2 = the recount.
  const t = cappedTable(3, 500, {
    beforeRequest: (call, rows) => {
      if (call === 2) rows.push({ id: 'id-999999', storage_path: 'pet-1/late.jpg' })
    },
  })
  await assertRejects(() => readAllOwnedPaths('event_attachments', t.page), Error, 'completeness unproven')
})

Deno.test('readAllOwnedPaths — a failed recount THROWS rather than trusting the walk', async () => {
  let calls = 0
  const page = (from: number, to: number) => {
    calls++
    if (calls > 1 && from === 0 && to === 0) return Promise.resolve({ data: null, error: { message: 'timeout' }, count: null })
    return Promise.resolve({ data: [{ id: 'a', storage_path: 'pet-1/a.jpg' }].slice(from, to + 1), error: null, count: 1 })
  }
  await assertRejects(() => readAllOwnedPaths('vet_reports', page), Error, 'recount failed')
})

Deno.test('readAllOwnedPaths — a stable table is recounted once and passes', async () => {
  const t = cappedTable(1234, 200)
  await readAllOwnedPaths('vet_documents', t.page)
  assertEquals(t.ranges[t.ranges.length - 1], [0, 0])
})

// ── Post-delete prefix sweep (CUL-2314) ───────────────────────────────────────

const SWEEP_IDS = { petIds: ['pet-a', 'pet-b'], foodItemIds: ['food-1'], userId: 'user-1' }

Deno.test('buildPrefixSweep — every bucket is swept, each under the id that keys it', () => {
  const sweep = buildPrefixSweep(SWEEP_IDS)
  const buckets = new Set(sweep.map((s) => s.bucket))
  assertEquals([...buckets].sort(), Object.values(STORAGE_BUCKETS).sort())
  for (const bucket of [
    STORAGE_BUCKETS.petPhotos,
    STORAGE_BUCKETS.eventAttachments,
    STORAGE_BUCKETS.vetAttachments,
    STORAGE_BUCKETS.vetDocuments,
    STORAGE_BUCKETS.vetReports,
  ]) {
    assertEquals(sweep.filter((s) => s.bucket === bucket).map((s) => s.root), ['pet-a', 'pet-b'])
  }
  assertEquals(sweep.filter((s) => s.bucket === STORAGE_BUCKETS.foodPhotos).map((s) => s.root), ['food-1'])
  assertEquals(sweep.filter((s) => s.bucket === STORAGE_BUCKETS.medicationPhotos).map((s) => s.root), ['user-1'])
})

Deno.test('buildPrefixSweep — SWEEP_SCOPE names every bucket and nothing else', () => {
  assertEquals(Object.keys(SWEEP_SCOPE).sort(), Object.keys(STORAGE_BUCKETS).sort())
})

Deno.test('buildPrefixSweep — a zero-pet, zero-food account still sweeps its own label folder', () => {
  assertEquals(buildPrefixSweep({ petIds: [], foodItemIds: [], userId: 'user-1' }), [
    { bucket: STORAGE_BUCKETS.medicationPhotos, root: 'user-1' },
  ])
})

Deno.test('buildPrefixSweep — a blank or unsafe root THROWS, so no bucket top level is ever listed', () => {
  for (const bad of ['', '   ', '.', '..', 'a/b', 'pet-a/../victim']) {
    assertThrows(() => buildPrefixSweep({ ...SWEEP_IDS, petIds: [bad] }))
    assertThrows(() => buildPrefixSweep({ ...SWEEP_IDS, foodItemIds: [bad] }))
    assertThrows(() => buildPrefixSweep({ ...SWEEP_IDS, userId: bad }))
  }
})

Deno.test('buildPrefixSweep — duplicate ids sweep once', () => {
  const sweep = buildPrefixSweep({ petIds: ['pet-a', 'pet-a'], foodItemIds: [], userId: 'user-1' })
  assertEquals(sweep.filter((s) => s.bucket === STORAGE_BUCKETS.petPhotos).length, 1)
})

Deno.test('mergeSweepIds — a re-read can only add folders, never drop one', () => {
  const merged = mergeSweepIds(SWEEP_IDS, { petIds: ['pet-b', 'pet-new'], foodItemIds: [], userId: 'user-1' })
  assertEquals(merged.petIds, ['pet-a', 'pet-b', 'pet-new'])
  assertEquals(merged.foodItemIds, ['food-1'])
})

Deno.test('mergeSweepIds — two reads naming different accounts THROW', () => {
  assertThrows(() => mergeSweepIds(SWEEP_IDS, { ...SWEEP_IDS, userId: 'user-2' }))
})

// An in-memory bucket set: `${bucket}::${key}` → present. The lister serves one
// folder level, folders with a null id, as storage-api does.
function fakeStorage(objects: Record<string, string[]>) {
  const store = new Map<string, Set<string>>()
  for (const [bucket, keys] of Object.entries(objects)) store.set(bucket, new Set(keys))
  const listerFor = (bucket: string): StorageLister => async (prefix, offset, limit) => {
    const keys = [...(store.get(bucket) ?? [])].filter((k) => k.startsWith(`${prefix}/`))
    const children = new Map<string, string | null>()
    for (const k of keys) {
      const rest = k.slice(prefix.length + 1).split('/')
      children.set(rest[0], rest.length > 1 ? null : `id:${k}`)
    }
    return [...children.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(offset, offset + limit)
      .map(([name, id]) => ({ name, id }))
  }
  const remove = async (bucket: string, keys: string[]) => {
    let n = 0
    for (const k of keys) if (store.get(bucket)?.delete(k)) n++
    return n
  }
  return { store, listerFor, remove }
}

Deno.test('sweepOwnedPrefixes — a file written after the row read (no row) is removed by its folder', async () => {
  const fs = fakeStorage({
    [STORAGE_BUCKETS.eventAttachments]: ['pet-a/evt-late/photo.jpg', 'victim-pet/evt/photo.jpg'],
    [STORAGE_BUCKETS.vetReports]: ['pet-b/report-late.pdf'],
    [STORAGE_BUCKETS.foodPhotos]: ['food-1/front.jpg', 'food-other/front.jpg'],
    [STORAGE_BUCKETS.medicationPhotos]: ['user-1/med-9/label.jpg', 'user-2/med-1/label.jpg'],
  })
  const res = await sweepOwnedPrefixes(buildPrefixSweep(SWEEP_IDS), fs.listerFor, fs.remove)
  assertEquals(res, { removed: 4, failures: [], unswept: [], partial: [] })
  // Only the other accounts' objects remain.
  assertEquals([...fs.store.get(STORAGE_BUCKETS.eventAttachments)!], ['victim-pet/evt/photo.jpg'])
  assertEquals([...fs.store.get(STORAGE_BUCKETS.vetReports)!], [])
  assertEquals([...fs.store.get(STORAGE_BUCKETS.foodPhotos)!], ['food-other/front.jpg'])
  assertEquals([...fs.store.get(STORAGE_BUCKETS.medicationPhotos)!], ['user-2/med-1/label.jpg'])
})

Deno.test('sweepOwnedPrefixes — a sibling id sharing a prefix string is not swept', async () => {
  const fs = fakeStorage({ [STORAGE_BUCKETS.petPhotos]: ['pet-a/profile.jpg', 'pet-ab/profile.jpg'] })
  await sweepOwnedPrefixes(buildPrefixSweep(SWEEP_IDS), fs.listerFor, fs.remove)
  assertEquals([...fs.store.get(STORAGE_BUCKETS.petPhotos)!], ['pet-ab/profile.jpg'])
})

Deno.test('sweepOwnedPrefixes — one folder failing to list is recorded and the rest still run', async () => {
  const fs = fakeStorage({ [STORAGE_BUCKETS.vetDocuments]: ['pet-b/doc.pdf'] })
  const listerFor = (bucket: string): StorageLister =>
    bucket === STORAGE_BUCKETS.petPhotos
      ? async () => {
          throw new Error('boom')
        }
      : fs.listerFor(bucket)
  const res = await sweepOwnedPrefixes(buildPrefixSweep(SWEEP_IDS), listerFor, fs.remove)
  assertEquals(res.removed, 1)
  assertEquals(res.failures.length, 2) // pet-a and pet-b in the pet-photo bucket
  assert(res.failures.every((f) => f.startsWith(`${STORAGE_BUCKETS.petPhotos}/pet-`)))
})

Deno.test('sweepOwnedPrefixes — a failed remove batch is recorded, later batches still run', async () => {
  const keys = Array.from({ length: STORAGE_REMOVE_CHUNK + 5 }, (_, i) => `pet-a/evt/${String(i).padStart(4, '0')}.jpg`)
  const fs = fakeStorage({ [STORAGE_BUCKETS.eventAttachments]: keys })
  let calls = 0
  const remove = async (bucket: string, batch: string[]) => {
    calls++
    if (calls === 1) throw new Error('rejected')
    return fs.remove(bucket, batch)
  }
  const res = await sweepOwnedPrefixes(buildPrefixSweep(SWEEP_IDS), fs.listerFor, remove)
  assertEquals(calls, 2)
  assertEquals(res.removed, 5)
  assertEquals(res.failures.length, 1)
  assert(res.failures[0].includes(`${STORAGE_REMOVE_CHUNK} objects`))
})

// ── CUL-2330: the sweep finishes what it can reach ───────────────────────────
//
// A lister over a literal tree (prefix → direct children), so a test can serve
// names a real key split could never produce: '', '.', '..', 'a/b'.
function treeLister(tree: Record<string, StorageListEntry[]>, failOn: string[] = []): StorageLister {
  return async (prefix, offset, limit) => {
    if (failOn.includes(prefix)) throw new Error(`list failed at ${prefix}`)
    return (tree[prefix] ?? []).slice(offset, offset + limit)
  }
}

Deno.test('listPrefixForSweep — one unsafe name is skipped and reported, its siblings and sub-folders are still listed', async () => {
  const lister = treeLister({
    'pet-a': [
      { name: '', id: 'blank' },
      { name: 'a.jpg', id: '1' },
      { name: 'evt', id: null },
      { name: 'x/y', id: 'slash' },
    ],
    'pet-a/evt': [
      { name: '..', id: 'dotdot' },
      { name: 'b.jpg', id: '2' },
    ],
  })
  const { keys, gaps } = await listPrefixForSweep(lister, 'pet-a')
  assertEquals(keys.sort(), ['pet-a/a.jpg', 'pet-a/evt/b.jpg'])
  assertEquals(gaps.length, 3)
  assertEquals(gaps.filter((g) => g.includes('unsafe object name under pet-a/evt')).length, 1)
  // The attacker-chosen name is never echoed into the log.
  assert(gaps.every((g) => !g.includes('x/y')))
})

Deno.test('listPrefixForSweep — a sub-folder whose listing fails is reported, its siblings are still listed', async () => {
  const lister = treeLister(
    {
      'pet-a': [
        { name: 'bad', id: null },
        { name: 'good', id: null },
        { name: 'top.jpg', id: '1' },
      ],
      'pet-a/good': [{ name: 'g.jpg', id: '2' }],
    },
    ['pet-a/bad'],
  )
  const { keys, gaps } = await listPrefixForSweep(lister, 'pet-a')
  assertEquals(keys.sort(), ['pet-a/good/g.jpg', 'pet-a/top.jpg'])
  assertEquals(gaps.length, 1)
  assert(gaps[0].includes('listing pet-a/bad failed'))
})

Deno.test('listPrefixForSweep — a listing that fails on a later page keeps the pages already read', async () => {
  const first = Array.from({ length: STORAGE_LIST_PAGE }, (_, i) => ({ name: `${String(i).padStart(3, '0')}.jpg`, id: `${i}` }))
  const lister: StorageLister = async (_prefix, offset) => {
    if (offset === 0) return first
    throw new Error('page two failed')
  }
  const { keys, gaps } = await listPrefixForSweep(lister, 'pet-a')
  assertEquals(keys.length, STORAGE_LIST_PAGE)
  assertEquals(gaps.length, 1)
  assert(gaps[0].includes(`offset ${STORAGE_LIST_PAGE}`))
})

Deno.test('listPrefixForSweep — a too-deep branch is reported, the shallow files are still listed', async () => {
  const tree: Record<string, StorageListEntry[]> = { 'pet-a': [{ name: 'top.jpg', id: 't' }, { name: 'd', id: null }] }
  let prefix = 'pet-a/d'
  for (let i = 0; i < STORAGE_LIST_MAX_DEPTH + 2; i++) {
    tree[prefix] = [{ name: 'd', id: null }]
    prefix = `${prefix}/d`
  }
  const { keys, gaps } = await listPrefixForSweep(treeLister(tree), 'pet-a')
  assertEquals(keys, ['pet-a/top.jpg'])
  assertEquals(gaps.length, 1)
  assert(gaps[0].includes('deeper than'))
})

Deno.test('listPrefixForSweep — a blank or unsafe root still THROWS (never a bucket top level)', async () => {
  for (const root of ['', '  ', '.', '..', 'a/b']) {
    await assertRejects(() => listPrefixForSweep(treeLister({}), root), Error, 'single-segment root')
  }
})

Deno.test('listPrefixRecursive — stays strict: an unsafe name among good ones still rejects (pre-delete, account intact)', async () => {
  const lister = treeLister({ 'user-1': [{ name: 'a.jpg', id: '1' }, { name: '..', id: 'x' }] })
  await assertRejects(() => listPrefixRecursive(lister, 'user-1'), Error, 'unsafe object name')
})

Deno.test('sweepOwnedPrefixes — one unsafe name no longer strands its folder: the other files are removed, the name is reported', async () => {
  const removedKeys: string[] = []
  const lister = treeLister({
    'pet-a': [
      { name: '', id: 'blank' },
      { name: 'late.jpg', id: '1' },
      { name: 'evt', id: null },
    ],
    'pet-a/evt': [{ name: 'photo.jpg', id: '2' }],
  })
  const res = await sweepOwnedPrefixes([{ bucket: STORAGE_BUCKETS.petPhotos, root: 'pet-a' }], () => lister, async (_b, keys) => {
    removedKeys.push(...keys)
    return keys.length
  })
  assertEquals(removedKeys.sort(), ['pet-a/evt/photo.jpg', 'pet-a/late.jpg'])
  assertEquals(res.removed, 2)
  assertEquals(res.failures.length, 1)
  assert(res.failures[0].startsWith(`${STORAGE_BUCKETS.petPhotos}/pet-a/ (sweep gap)`))
  assertEquals(res.unswept, [])
})

Deno.test('sweepOwnedPrefixes — every folder is swept exactly once with folders in flight together', async () => {
  const sweep = Array.from({ length: 37 }, (_, i) => ({ bucket: STORAGE_BUCKETS.petPhotos, root: `pet-${i}` }))
  const listed: string[] = []
  let inFlight = 0
  let peak = 0
  const lister: StorageLister = async (prefix, offset) => {
    if (offset > 0) return []
    listed.push(prefix)
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 1))
    inFlight--
    return [{ name: 'f.jpg', id: prefix }]
  }
  const res = await sweepOwnedPrefixes(sweep, () => lister, async (_b, keys) => keys.length)
  assertEquals(listed.sort(), sweep.map((s) => s.root).sort())
  assertEquals(res.removed, 37)
  assertEquals(res.unswept, [])
  assert(peak > 1 && peak <= SWEEP_CONCURRENCY, `peak ${peak}`)
})

Deno.test('sweepOwnedPrefixes — a sweep cut short by its budget names every unstarted folder, and sweeps none twice', async () => {
  const sweep = Array.from({ length: 30 }, (_, i) => ({ bucket: STORAGE_BUCKETS.vetDocuments, root: `pet-${i}` }))
  let clock = 0
  const started: string[] = []
  const lister: StorageLister = async (prefix, offset) => {
    if (offset > 0) return []
    started.push(prefix)
    clock += 10 // each folder's first listing costs 10 ms of budget
    await Promise.resolve()
    return [{ name: 'doc.pdf', id: prefix }]
  }
  const res = await sweepOwnedPrefixes(sweep, () => lister, async (_b, keys) => keys.length, {
    deadline: 100,
    now: () => clock,
    concurrency: 3,
  })
  // Started + unswept partition the plan: nothing lost, nothing done twice.
  assertEquals(new Set(started).size, started.length)
  assertEquals([...started, ...res.unswept.map((u) => u.root)].sort(), sweep.map((s) => s.root).sort())
  assert(res.unswept.length > 0 && started.length > 0)
  assertEquals(res.removed, started.length)
  // Each unswept folder is a named failure, so the client's `failed` count is never zero over them.
  for (const u of res.unswept) {
    assert(res.failures.includes(`${u.bucket}/${u.root}/ (sweep not started: time budget)`))
  }
  // And the retry list is the plan's own entries, in order: re-running it finishes the job.
  assertEquals(res.unswept, sweep.slice(sweep.length - res.unswept.length))
})

Deno.test('sweepOwnedPrefixes — a deadline already past sweeps nothing and names everything', async () => {
  const sweep = buildPrefixSweep(SWEEP_IDS)
  const res = await sweepOwnedPrefixes(sweep, () => treeLister({}), async () => 0, { deadline: 0, now: () => 1 })
  assertEquals(res.unswept, sweep)
  assertEquals(res.failures.length, sweep.length)
})

Deno.test('SWEEP_BUDGET_MS — leaves headroom under the 150 s Edge request limit', () => {
  assert(SWEEP_BUDGET_MS > 0 && SWEEP_BUDGET_MS <= 120_000)
})

Deno.test('listPrefixForSweep — a non-string or missing name is a gap, not a thrown folder', async () => {
  const lister = treeLister({
    'pet-a': [
      { name: undefined as unknown as string, id: 'x' },
      null as unknown as StorageListEntry,
      { name: 'ok.jpg', id: '1' },
    ],
  })
  const { keys, gaps } = await listPrefixForSweep(lister, 'pet-a')
  assertEquals(keys, ['pet-a/ok.jpg'])
  assertEquals(gaps.length, 2)
})

Deno.test('sweepOwnedPrefixes — partial names exactly the folders left with something, never a clean neighbour', async () => {
  const tree: Record<string, StorageListEntry[]> = {
    'pet-gap': [{ name: '..', id: 'x' }, { name: 'a.jpg', id: '1' }],
    'pet-rej': [{ name: 'b.jpg', id: '2' }],
  }
  for (let i = 0; i < 12; i++) tree[`pet-ok-${i}`] = [{ name: 'c.jpg', id: `c${i}` }]
  const sweep = Object.keys(tree).map((root) => ({ bucket: STORAGE_BUCKETS.petPhotos, root }))
  const res = await sweepOwnedPrefixes(sweep, () => treeLister(tree), async (_b, keys) => {
    await new Promise((r) => setTimeout(r, 1)) // interleave the workers
    if (keys[0].startsWith('pet-rej/')) throw new Error('rejected')
    return keys.length
  })
  assertEquals(res.partial.map((p) => p.root).sort(), ['pet-gap', 'pet-rej'])
  assertEquals(res.removed, 13)
  assertEquals(res.unswept, [])
})
