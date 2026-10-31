// Supabase Edge Function — delete-account / plan.ts
//
// The PURE, unit-tested core of B-039 PR 1 (in-app account deletion). It holds
// the two decisions that must be provably correct and that the
// rls-privacy-reviewer will attack: (1) WHICH Storage objects get purged — path
// collection and the cross-tenant scoping guards (the medication uid-prefix, and
// the shared two-segment owned-id guard on the food, vet-document and pet-photo
// lists) — and (2) the ORDER of
// destructive operations (FR-6: the auth user is deleted LAST, so a partial or
// failed run is idempotent and re-runnable). No I/O lives here — the index.ts
// shell fetches the user's OWNED rows and executes this plan. Keeping it pure is
// what makes the scoping and ordering invariants testable offline (AC-11).

import { isRangeNotSatisfiable, rowsOrThrow, type PullPage } from '../_shared/pull.ts'

// ── Storage buckets ───────────────────────────────────────────────────────────
// The buckets whose objects are THIS user's PII/data and must be erased (FR-3).
// The first four are pet-health objects scoped through the user's pets. The last
// two are scoped by the CATALOG ROW the user CREATED (`created_by_user_id`), NOT by
// pet, because the food/drug catalogs carry no `pet_id`:
//   • `medicationPhotos` (B-127): drug-LABEL photos. A prescription label carries
//     owner/pet/clinic names — per-user PII, the reason migration 021 gave the bucket
//     per-user-prefix RLS — so it is PURGED.
//   • `foodPhotos` (B-354 FR-7): food-LABEL photos. Once the catalog went PER-ACCOUNT
//     (migration 033), a food row is the owner's own data, not a shared commercial
//     asset — so the FR-4 "preserve the global catalog" carve-out is INVERTED and the
//     bucket joins the purge list. The catalog ROWS themselves are hard-deleted by the
//     FK CASCADE (migration 033 flipped `created_by_user_id → SET NULL` to `CASCADE`),
//     so — unlike medication, whose row survives with attribution nulled — both the food
//     row AND its label photo are erased.
//   • `vetReports` (CUL-2282): saved vet report PDFs. The `vet_reports` table has
//     existed since migration 001; no path writes rows to it yet, so the bucket is
//     simply never reached today. A READ error on that table is a hard failure in
//     index.ts (an erasure that cannot list what it must erase has not erased it),
//     and its paths are re-scoped to the owned-pet-id set like vet documents. The
//     Storage REMOVE stays best-effort like every bucket, which also tolerates the
//     bucket's absence. The same remove-side tolerance covers `nyx-medication-photos`
//     before its first upload — until then there are no `photo_paths`, so the bucket
//     is never even reached.
//   • `vetDocuments` (B-478 VF-1): the Vet Files library — lab PDFs, vaccination
//     certificates, discharge summaries, screenshots of clinic email. Pet-scoped like
//     the first four. It joins this list in the SAME PR that creates the table, before
//     any capture surface exists to produce a single object, which is the T&S
//     launch-gate posture §5.2 asks for and the B-039 precedent: deletion coverage is
//     not something a corpus grows into later.
export const STORAGE_BUCKETS = {
  petPhotos: 'nyx-pet-photos',
  eventAttachments: 'nyx-event-attachments',
  vetAttachments: 'nyx-vet-attachments',
  vetDocuments: 'nyx-vet-documents',
  vetReports: 'nyx-vet-reports',
  medicationPhotos: 'nyx-medication-photos',
  foodPhotos: 'nyx-food-photos',
} as const

// No buckets are preserved on account deletion any more (B-354 FR-7). Before the
// per-account re-scope, `nyx-food-photos` was the lone exception — food-label photos
// belonged to the GLOBAL catalog and survived with attribution nulled. Migration 033
// made the catalog per-account, so those photos are now the deleting user's own data
// and are PURGED (they moved into STORAGE_BUCKETS above). The constant is retained
// (empty) so the "never emits a preserved bucket" invariant + its test still exist and
// keep protecting any future preserve-on-delete carve-out from silently regressing.
export const PRESERVED_BUCKETS = [] as const

// Storage.remove() takes an array of object keys. We batch it for two reasons:
// (1) a single call has a practical payload ceiling; (2) batching isolates
// failure — one rejected batch (e.g. an object deleted out from under us) does
// not drop the rest of the bucket, which tightens FR-5's best-effort guarantee.
export const STORAGE_REMOVE_CHUNK = 100

// ── Path collection / scoping ─────────────────────────────────────────────────

// Raw storage paths read from the user's OWNED rows (scoped in index.ts by
// `pets.user_id = userId` for the pet-health buckets, and by
// `medication_items.created_by_user_id = userId` for the drug-label photos — never
// from client input, FR-3). Each list arrives straight from the DB and may contain
// nulls (a pet with no photo), blanks, or duplicates; cleaning happens here.
export interface OwnedStoragePaths {
  // Pet profile photos, read from `pets.photo_path` for the user's own pets.
  // Re-scoped before the purge (scopePetPhotoPaths, B-463) — migration 042's
  // CHECK closed the plain cross-tenant form at the write path, but it is a
  // prefix test, and this purge does not rely on it alone.
  petPhotoPaths: ReadonlyArray<string | null | undefined>
  eventAttachmentPaths: ReadonlyArray<string | null | undefined>
  vetAttachmentPaths: ReadonlyArray<string | null | undefined>
  // Vet Files documents (B-478 VF-1). Pet-scoped like the three above, and read from
  // `vet_documents.storage_path` for the user's own pets. Unlike them it is ALSO
  // re-scoped before the purge — see scopeVetDocumentPaths for the residual that
  // motivates it.
  vetDocumentPaths: ReadonlyArray<string | null | undefined>
  // Saved vet report PDFs (CUL-2282), read from `vet_reports.storage_path` for the
  // user's own pets and re-scoped to the owned-pet-id set before the purge — see
  // scopeVetReportPaths.
  vetReportPaths: ReadonlyArray<string | null | undefined>
  // Drug-label photos. `medication_items.photo_paths` is a `TEXT[]` (one array per
  // drug row), so index.ts FLATTENS every owned row's array into this one flat list
  // before handing it over — keeping the pure module's per-bucket shape uniform.
  medicationPhotoPaths: ReadonlyArray<string | null | undefined>
  // Food-label photos (B-354 FR-7). `food_items.photo_paths` is a `TEXT[]` too, so
  // index.ts likewise flattens every owned row's array into this flat list. These are
  // scoped NOT by a uid prefix but by the owned-food-id SET (see scopeFoodPaths):
  // food paths are exactly `{foodItemId}/{slot}.jpg`, so the security key is the WHOLE
  // two-segment shape with a first segment naming a food row THIS user created (B-582
  // upgraded this from a first-segment-only test; see scopeFoodPaths).
  foodPhotoPaths: ReadonlyArray<string | null | undefined>
  // The ids of the `food_items` this user created (index.ts read them alongside the
  // photo_paths). They are the owned-id set scopeFoodPaths keeps `foodPhotoPaths` to —
  // `food_items` is an authenticated-writable catalog whose `photo_paths` TEXT[] is
  // unconstrained (migration 033 scopes which ROW you write, not the column CONTENTS,
  // and adds no `{id}/`-prefix CHECK — unlike event_attachments' migration 025), so a
  // crafted owned row could reference another account's `{victimFoodId}/…` path, and the
  // service-role purge bypasses the food-photo SELECT RLS (033) that would reject a read.
  ownedFoodItemIds: ReadonlyArray<string>
  // The ids of the `pets` this user owns (index.ts already read them — they are the
  // `.in('pet_id', petIds)` scope for every pet-child read). They are the owned-id set
  // scopeVetDocumentPaths keeps `vetDocumentPaths` to, mirroring the nyx-vet-documents
  // Storage SELECT policy's `(storage.foldername(name))[1] IN (owned pet ids)` by hand —
  // and, since B-463, the set scopePetPhotoPaths keeps `petPhotoPaths` to as well.
  ownedPetIds: ReadonlyArray<string>
  // The deleting user's OWN auth uid (the verified-JWT userId index.ts scoped every
  // read by). It is the prefix-scope key for `medicationPhotoPaths` (see
  // scopeMedicationPaths / B-128): unlike the pet-scoped buckets, `medication_items`
  // is a GLOBAL, any-user-writable catalog whose `photo_paths` TEXT[] is unconstrained
  // (its RLS gates which ROW you write, not the column CONTENTS — migration 020), so a
  // crafted row could reference another user's `{victimUid}/…` path — and THIS purge
  // runs as the service role, bypassing the per-user-prefix Storage RLS (021) that
  // would otherwise reject it.
  ownerUserId: string
}

export interface BucketPurge {
  bucket: string
  paths: string[]
}

// Filter a raw column to genuine, de-duplicated object keys, preserving order. A
// null `photo_path` (pet with no photo) or a blank string is not an object —
// dropping it keeps the remove() call honest and avoids asking Storage to delete
// "". Real paths are never mutated (we test emptiness on a trimmed copy but emit
// the original string), so a legitimate key is matched exactly.
export function cleanPaths(raw: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of raw) {
    if (typeof p !== 'string') continue
    if (p.trim().length === 0) continue
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

// B-128 — cross-tenant delete guard for medication-label photos.
//
// `medication_items` is a GLOBAL, any-user-writable catalog: every authenticated
// user inserts their OWN rows (creator-locked), and its `photo_paths` TEXT[] has NO
// DB constraint tying a value to the creator's `{uid}/…` prefix — the
// `medication_items_update` RLS gates WHICH row you write, not the CONTENTS of that
// column (migration 020). The per-user-prefix Storage RLS (migration 021) stops a
// user UPLOADING into another user's prefix, but NOT a crafted ROW from REFERENCING
// another user's path string. This deletion purge runs as the SERVICE ROLE — it
// bypasses RLS and removes the literal stored strings — so without this guard a
// malicious row holding `{victimUid}/…/label.jpg` would turn the attacker's OWN
// account deletion into a cross-tenant DELETE of the victim's label photo.
//
// Defuse the primitive at the consumer: keep only the medication paths under the
// deleting user's OWN `{uid}/` prefix — exactly what `buildMedicationPhotoPath`
// (lib/storage.ts) produces for every legitimate client write, and what RLS 021
// enforces for every legitimate upload. The trailing '/' is load-bearing: it stops a
// uid that is a string-prefix of another (`user-1` must not match `user-12/…`) from
// passing. A blank `ownerUserId` fails CLOSED (drops everything) rather than letting
// the prefix collapse to '/' and match every path — index.ts always supplies the
// verified-JWT uid, so this is defense-in-depth.
//
// Scoped to medication paths ONLY: no other bucket uses the per-user-prefix
// convention, so extending this filter would drop every one of their legitimate,
// un-prefixed keys. Note the reason is the KEY SHAPE, not trust — an earlier
// revision said the pet/event/vet lists "need no such guard: they come from
// pet-scoped rows," and B-431 finding 4 showed that claim wrong on its own terms:
// row ownership is pet-scoped, the column VALUE is not. The pet list now carries
// its own guard (scopePetPhotoPaths, B-463); the event/vet-attachment lists are
// tracked by B-660. (Returns the nullable shape so it composes directly into
// cleanPaths, which does the dedupe/blank drop.)
export function scopeMedicationPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownerUserId: string,
): Array<string | null | undefined> {
  if (!ownerUserId || ownerUserId.trim().length === 0) return []
  const prefix = `${ownerUserId}/`
  return paths.filter((p): p is string => typeof p === 'string' && p.startsWith(prefix))
}

// The ONE two-segment ownership predicate, shared by every guard below whose
// bucket keys objects as `{ownedId}/{filename}` — food (B-582), vet documents
// (B-478 VF-1), pet photos (B-463). Not exported: each bucket keeps its own
// named, documented guard so call sites state WHICH convention they enforce,
// but the predicate itself exists exactly once. That is the B-582 lesson
// applied structurally: the food guard shipped as a first-segment test, the
// VF-1 review proved that shape insufficient and fixed it for vet documents
// ONLY, and the known-bad twin then sat in place on the older call site.
// Twins drift; a single predicate cannot.
//
// The test, in three clauses, all load-bearing:
//   (1) EXACTLY two segments (one '/'). This drops the multi-segment `..`
//       traversal variants (`{own}/../{victim}/x`, `{own}/../../{victim}/x`,
//       `{own}//../{victim}/x`) — their first segment genuinely is owned, so a
//       first-segment-only test keeps them, and cleanPaths never normalises a
//       path, so they would reach the service-role remove() verbatim.
//   (2) the first segment an EXACT member of the owned-id set (never startsWith,
//       so one id can never be a string prefix of another).
//   (3) a NON-DEGENERATE second segment: non-empty, and not `.` or `..`. This is
//       the B-582-review (F1) clause. Without it, the TWO-segment degenerate keys
//       `{own}/`, `{own}/.`, `{own}/..` pass (1)+(2) — each is one separator, first
//       segment owned — and reach a real purge step. None can name a victim, but
//       `{own}/..` is the one whose blast radius under a normalising or genuinely
//       prefix-semantic backend would be the bucket ROOT rather than one object.
//       Every legitimate key has a real filename here (`profile.jpg`,
//       `0-front.jpg`, `{docId}.pdf`), so this clause drops nothing real.
//
// Why all three rather than trusting Storage to no-op the degenerate keys: such a
// key deletes nothing TODAY (`storage.objects.name` is an opaque literal; neither
// storage-api nor S3 resolves `..`), but that is a boundary held by a third-party
// implementation detail we do not own and do not test — the 043 argument — so it
// is closed here rather than relied on. An empty owned-id set fails CLOSED
// (drops everything).
//
// Residual this does NOT close, by design (B-582 review F2): a two-segment key
// whose SECOND segment carries ENCODED or backslash traversal — `{own}/..%2f{victim}%2fx`,
// `{own}/..\{victim}\x` — passes all three clauses (segment 2 is one opaque token,
// not literally `.`/`..`). It cannot escape the owner's own `{own}/` namespace
// unless Storage percent-decodes or resolves it, which is the same untested
// backend behaviour clause (3) refuses to depend on for the literal case — but
// closing it would require normalising the key, which risks mismatching a
// legitimately odd-but-real filename. Left as the documented reliance rather than
// guessed at; tracked with F3/F4 on the B-582 follow-up row.
//
// ⚠ Do NOT reach for this for a bucket whose legitimate keys have MORE than
// two segments: `nyx-medication-photos` is `{uid}/{medId}/{slot}.jpg` (it has
// its own uid-prefix guard above) and `nyx-event-attachments` /
// `nyx-vet-attachments` are `{petId}/{eventOrVisitId}/{attId}.jpg` (un-scoped
// at this consumer today — B-660). Applying this predicate there would silently
// drop every legitimate key and turn account deletion into a no-op for the
// bucket. The shape is per-bucket; only the ownership half generalises.
function scopeTwoSegmentOwnedPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  const owned = new Set(
    ownedIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  )
  if (owned.size === 0) return []
  return paths.filter((p): p is string => {
    if (typeof p !== 'string') return false
    const segments = p.split('/')
    if (segments.length !== 2) return false
    if (!owned.has(segments[0])) return false
    // Clause (3): reject a degenerate second segment (`{own}/`, `{own}/.`,
    // `{own}/..`). Every real object key has a filename here.
    const name = segments[1]
    return name.length > 0 && name !== '.' && name !== '..'
  })
}

// B-354 FR-7 — cross-tenant delete guard for food-label photos.
//
// The food-photo twin of scopeMedicationPaths, but keyed on a SET of ids rather than
// a single uid prefix. `food_items` is now PER-ACCOUNT (migration 033: owner-only RLS
// on `created_by_user_id`), yet its `photo_paths` TEXT[] is UNCONSTRAINED — 033 gates
// which ROW you may write, not the column CONTENTS, and (unlike event_attachments'
// migration 025) adds no CHECK pinning each value to its own `{id}/` prefix. Food paths
// are `{foodItemId}/{slot}.jpg` (lib food-capture / app/food/[id].tsx), so a user could
// insert an owned row whose `photo_paths` references ANOTHER account's `{victimFoodId}/…`
// object. This deletion purge runs as the SERVICE ROLE — it bypasses the food-photo
// SELECT RLS (033) that scopes reads to owned food ids — so without this guard a crafted
// owned row would turn the attacker's own account deletion into a cross-tenant DELETE of
// the victim's label photo (the exact B-128 primitive, one catalog over).
//
// B-582 (2026-08-02): this guard originally validated only the LEADING segment — a
// faithful port of 033's SELECT policy — and the repo had already proved that shape
// insufficient. The VF-1 review executed `{own}/../{victim}/x` against the identical
// first-segment test on vet documents and it PASSED (the first segment IS owned; the
// `..` is the second), and the B-577 review then executed the same attack against THIS
// filter with the same result — a known-insufficient guard left standing on the older
// of the two call sites. Every legitimate food key is exactly two segments —
// `{foodItemId}/{n}-{slot}.jpg` (app/food-capture.tsx:300, app/food/[id].tsx) — so the
// guard now checks the whole shape via the shared predicate above, which also encodes
// "(storage.foldername(name))[1] IN (owned ids)": a slashless key has no folder
// segment, so 033's policy drops it and so does the shape test.
export function scopeFoodPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedFoodItemIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  return scopeTwoSegmentOwnedPaths(paths, ownedFoodItemIds)
}

// B-478 VF-1 — first-segment scope guard for Vet Files documents.
//
// The pet-scoped buckets above deliberately carry NO such guard, and that is still
// correct for them: their paths come from pet-scoped rows. So why this one?
//
// Because migration 043 recorded a precise residual on its sibling bucket and asked
// that the next path built for this family close it properly. `vet_documents` binds
// `storage_path` to the owning pet with a `starts_with(storage_path, pet_id || '/')`
// CHECK — but `starts_with` is a PREFIX test, so
// `{ownPetId}/../{victimPetId}/x.pdf` satisfies it AND satisfies the Storage INSERT
// policy (its first FOLDER segment is a pet the caller legitimately owns). That
// string then reaches the service-role `remove()` verbatim, because `cleanPaths`
// only dedupes and drops blanks — it never normalises a path.
//
// 043 reasoned, correctly, that such a key deletes nothing: `storage.objects.name`
// is an OPAQUE literal and neither storage-api nor S3 resolves `..`, so it simply
// matches no object. But that is a boundary holding on a third-party implementation
// detail we do not own and do not test. This bucket is new and has zero objects, so
// the guard is built right here rather than filed.
//
// ⚠ THE FIRST-SEGMENT TEST IS NOT ENOUGH, and this comment used to claim it was.
// Caught by the VF-1 rls-privacy-reviewer, which executed it: in
// `{ownPetId}/../{victimPetId}/x.pdf` the first segment IS `{ownPetId}` — the `..`
// is the SECOND segment — so a `scopeFoodPaths`-shaped filter keeps the path and
// changes nothing about the residual. Copying the food-photo guard verbatim was the
// mistake; food paths and vet-document paths merely LOOK alike.
//
// So this checks the WHOLE SHAPE, which is also a truer port of the convention:
// `buildVetDocumentPath` emits exactly `{pet_id}/{document_id}.{ext}` — one
// separator, two segments, no more. Requiring exactly two segments drops every
// traversal variant the reviewer tried (`/../`, `/../../`, `//`) by construction
// rather than by trusting Storage to treat the key as opaque, and it still enforces
// the first-segment ownership the Storage policy expresses. An empty owned-pet set
// fails CLOSED (drops everything) — a user with no pets has no documents, and a path
// can never legitimately name a pet that is not theirs.
//
// The two-segment shape is now DELIBERATELY shared with scopeFoodPaths (B-582) and
// scopePetPhotoPaths (B-463) — their conventions are genuinely two-segment too, and
// one predicate cannot drift the way the food/vet-document twins did. The warning
// that used to live here survives on the shared predicate itself: never lift it into
// the three-segment event/vet-attachment lists (B-660).
export function scopeVetDocumentPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedPetIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  return scopeTwoSegmentOwnedPaths(paths, ownedPetIds)
}

// CUL-2282 (VR2-1) — cross-tenant delete guard for saved vet report PDFs.
//
// `vet_reports.storage_path` is plain TEXT with no prefix CHECK at all, and the
// owner RLS on the table gates which ROW is written, never the column CONTENTS. So
// once saved reports ship (VR2-20), an owner could point a row they own at
// `{victimPetId}/{reportId}.pdf` and let their own account deletion service-role-
// remove another owner's report — the B-431 pet-photo attack, on a bucket with no
// write-side guard behind it. The convention is `{petId}/{reportId}.pdf`: exactly two
// segments, the first a pet THIS user owns — the shared predicate's shape, so every
// traversal variant (`{own}/../{victim}/x.pdf`) drops by construction and an empty
// owned-pet set fails CLOSED.
//
// Deliberately NOT a `.pdf` suffix test on top: a future writer emitting a different
// extension would then have its files silently skipped by the erasure, which is the
// quiet direction for a deletion path. Ownership and shape are what stop a
// cross-tenant key; the extension adds nothing to that.
export function scopeVetReportPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedPetIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  return scopeTwoSegmentOwnedPaths(paths, ownedPetIds)
}

// B-463 — cross-tenant delete guard for pet profile photos, defense-in-depth
// BEHIND migration 042's DB CHECK (where the food/medication guards above stand
// alone — their catalogs have no CHECK at all).
//
// B-431 (PR #460) closed the CAUSE: `pets.photo_path` was plain TEXT, and
// `pets_owner` RLS gates which ROW you write, never the column CONTENTS — so an
// attacker could point their own pet's `photo_path` at `{victimPetId}/profile.jpg`
// and let their own account deletion service-role-delete the victim's photo
// (042 finding 4; one victim per owned pet, and multi-pet is free). The
// `pets_photo_path_pet_prefix` CHECK now makes that plain form unwritable. This
// consumer-side guard exists anyway, for two reasons:
//   1. The CHECK is `starts_with(photo_path, id::text || '/')` — a PREFIX test,
//      the exact shape whose residual the VF-1 review executed on vet documents:
//      `{ownPetId}/../{victimPetId}/profile.jpg` SATISFIES it. So even with the
//      CHECK in place a traversal key is writable and reaches the purge verbatim;
//      the two-segment shape test is what actually drops it.
//   2. The purge must stay safe if the CHECK is ever dropped or relaxed by a
//      future migration, or a future writer lands before its own constraint does —
//      the guard-at-the-consumer posture every scoped list here takes.
// Keyed on the owned-PET-id set — the same ids that scoped the `pets` read
// (`user_id = userId`), so a path and the ids that permit it always travel
// together. The convention is exactly `{petId}/profile.jpg` — two segments, one
// writer (app/(tabs)/profile.tsx) — the shared predicate's shape.
export function scopePetPhotoPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedPetIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  return scopeTwoSegmentOwnedPaths(paths, ownedPetIds)
}

// Map each owned path-list to its bucket, dropping any bucket with nothing to
// remove. The output can ONLY ever contain the seven STORAGE_BUCKETS above, and
// PRESERVED_BUCKETS is now empty — every bucket a user's objects can live in is
// purgeable. Five lists are re-scoped BEFORE cleaning, each against the key its own
// Storage policy uses — medication to the owner's `{uid}/` prefix, food to the
// owned-food-id SET, vet documents, vet reports and pet photos to the owned-pet-id SET — so a
// crafted cross-tenant path never reaches the service-role purge. The
// event/vet-attachment lists are NOT re-scoped here: their `{petId}/…` prefix CHECKs
// (migrations 025/043) carry the same traversal residual, and their three-segment
// shape guards are B-660, not a blind lift of the two-segment predicate.
export function collectStoragePaths(input: OwnedStoragePaths): BucketPurge[] {
  const candidates: BucketPurge[] = [
    // petPhotos is re-scoped to the owned-pet-id SET (B-463) — defense-in-depth
    // behind migration 042's prefix CHECK, which a `..` traversal key satisfies.
    {
      bucket: STORAGE_BUCKETS.petPhotos,
      paths: cleanPaths(scopePetPhotoPaths(input.petPhotoPaths, input.ownedPetIds)),
    },
    { bucket: STORAGE_BUCKETS.eventAttachments, paths: cleanPaths(input.eventAttachmentPaths) },
    { bucket: STORAGE_BUCKETS.vetAttachments, paths: cleanPaths(input.vetAttachmentPaths) },
    // vetDocuments is pet-scoped like the three above, but its paths are ALSO
    // re-scoped to the owned-pet-id SET first — closing the `..` prefix residual 043
    // recorded rather than depending on opaque-key behaviour we do not test (B-478).
    {
      bucket: STORAGE_BUCKETS.vetDocuments,
      paths: cleanPaths(scopeVetDocumentPaths(input.vetDocumentPaths, input.ownedPetIds)),
    },
    // vetReports is re-scoped to the owned-pet-id SET too (CUL-2282): its
    // `storage_path` column has no CHECK, so this guard is the only boundary.
    {
      bucket: STORAGE_BUCKETS.vetReports,
      paths: cleanPaths(scopeVetReportPaths(input.vetReportPaths, input.ownedPetIds)),
    },
    // medicationPhotos is sourced from a globally-writable catalog, so its paths are
    // prefix-scoped to the deleting user's own `{uid}/` before cleaning (B-128).
    {
      bucket: STORAGE_BUCKETS.medicationPhotos,
      paths: cleanPaths(scopeMedicationPaths(input.medicationPhotoPaths, input.ownerUserId)),
    },
    // foodPhotos is sourced from the (now per-account) food catalog whose photo_paths
    // are still unconstrained, so its paths are scoped to the owned-food-id set before
    // cleaning — a crafted cross-tenant `{victimFoodId}/…` path never reaches the purge
    // (B-354 FR-7, the food twin of the B-128 medication guard).
    {
      bucket: STORAGE_BUCKETS.foodPhotos,
      paths: cleanPaths(scopeFoodPaths(input.foodPhotoPaths, input.ownedFoodItemIds)),
    },
  ]
  return candidates.filter((c) => c.paths.length > 0)
}

// ── Prefix listing (CUL-1764) ─────────────────────────────────────────────────
//
// Rows alone cannot find every label photo. `app/medication-capture.tsx` uploads
// `{uid}/{itemId}/0-label.jpg` BEFORE any `medication_items` row exists, so an
// owner who backs out leaves a prescription label (owner, pet, clinic, Rx number)
// that no row points at. The PM ruled fix (b) 2026-10-12: deletion also lists the
// account's whole `{uid}/` folder in `nyx-medication-photos` and purges what it
// finds. Migration 021's RLS pins the first folder to the uploader's uid, so that
// folder is exactly this account's objects.
//
// Storage `list()` returns one level (folders come back with `id === null`), so
// this walks the tree. It is pure over an injected lister so the walk, paging and
// failure modes are unit-tested offline; index.ts supplies the real Storage call.
export interface StorageListEntry {
  name: string
  // null marks a folder (storage-api's convention); a file carries its object id.
  id: string | null
}
// Returns one page of a folder's direct children. Throws on any error: a listing
// that silently came back short would read exactly like a complete one.
export type StorageLister = (prefix: string, offset: number, limit: number) => Promise<StorageListEntry[]>

export const STORAGE_LIST_PAGE = 100
// Legitimate keys are three segments deep ({uid}/{itemId}/{slot}.jpg). The cap only
// stops a pathological tree from walking forever, and it fails LOUD rather than
// truncating: an erasure path never reports success over objects it did not reach.
export const STORAGE_LIST_MAX_DEPTH = 8

// A name segment that could change which object a key addresses once joined. The
// app never writes one, but the raw Storage API accepts `{uid}//x.jpg` and RLS 021
// passes it (the first folder is still the uid). Such an entry is never joined,
// walked or emitted: the walk THROWS, because skipping it would leave the object
// behind under an `ok: true` (rls-privacy-reviewer, PR-05). Production held zero
// such keys on 2026-10-12, so the throw blocks only a hand-built tree, loudly.
function isUnsafeSegment(name: string): boolean {
  return name.length === 0 || name === '.' || name === '..' || name.includes('/')
}

export async function listPrefixRecursive(list: StorageLister, root: string): Promise<string[]> {
  // A blank root would list the bucket's top level, i.e. every account's folder.
  // index.ts always passes the verified-JWT uid; this fails CLOSED anyway.
  if (!root || root.trim().length === 0 || isUnsafeSegment(root)) {
    throw new Error('listPrefixRecursive: a single-segment root is required')
  }
  const keys: string[] = []
  const walk = async (prefix: string, depth: number): Promise<void> => {
    if (depth > STORAGE_LIST_MAX_DEPTH) {
      throw new Error(`listPrefixRecursive: ${prefix} is deeper than ${STORAGE_LIST_MAX_DEPTH} levels`)
    }
    const folders: string[] = []
    // Advance by the rows RECEIVED and stop only on an empty page (C-42): sound
    // even if the server caps a page below the size asked for.
    for (let offset = 0; ; ) {
      const page = await list(prefix, offset, STORAGE_LIST_PAGE)
      if (page.length === 0) break
      offset += page.length
      for (const entry of page) {
        if (typeof entry?.name !== 'string' || isUnsafeSegment(entry.name)) {
          throw new Error(`listPrefixRecursive: unsafe object name under ${prefix}`)
        }
        const key = `${prefix}/${entry.name}`
        if (entry.id === null) folders.push(key)
        else keys.push(key)
      }
    }
    for (const folder of folders) await walk(folder, depth + 1)
  }
  await walk(root, 1)
  return keys
}

// ── Owned-row path reads (CUL-2312) ───────────────────────────────────────────
// Every `storage_path` a pet-scoped table holds for the account's pets. An earlier loop
// ended on a SHORT page, so a PostgREST `max-rows` below its page size would erase page
// one's objects and report success (C-42). This walk follows the shared reader's rules
// (`_shared/pull.ts` fetchAll): advance by the rows RECEIVED, one row of overlap on every
// later page to detect a shifted offset, and completeness from `count: 'exact'`.
//
// WHY NOT fetchAll ITSELF. fetchAll STOPS once it holds page 0's count of rows. Its callers
// read newest-first, where a concurrent insert lands behind the cursor. These tables sort
// on a random v4 `id`, so an insert lands anywhere: ahead of the cursor it fills the count
// and ends the walk one pre-existing row short with `complete: true`, and a later delete
// of a row already read makes even a recount agree (rls-privacy-reviewer, two passes on
// this PR: 999 rows, `p/998` left in Storage under ok: true). So this walk never stops on
// a count. It stops only at the END OF THE TABLE: a page with nothing past its overlap row.
//
// THE PROOF OF COMPLETENESS, all four must hold or it THROWS (the run aborts before any
// purge or the auth delete, FR-6, so the account survives and the call retries):
//   1. the walk reached the end of the table, not the page ceiling;
//   2. no later page began on a row it had not seen (a delete behind the cursor shifts
//      the list up under it and would skip a row: that is caught here);
//   3. the distinct rows read are at least page 0's count;
//   4. a recount AFTER the walk equals the distinct rows read exactly, so a write
//      landing between the last page and the recount also fails loud.
// An insert ahead of the cursor is simply read (the walk runs to the end), and an insert
// behind it re-serves a row already seen. Neither can hide a live row. A max-rows of 1
// returns only the overlap row and looks like the end, which (3) catches.
//
// What this cannot see, stated: a row written AFTER the recount but before the auth
// delete (the purge loop's window) is not in the list. The post-delete prefix sweep
// below (CUL-2314) removes such a row's file by its folder.
//
// DEPLOY SCOPE. Importing `_shared/pull.ts` puts it in this function's shipping closure,
// so an edit there now redeploys delete-account too; pull.ts's own header still names
// three importers. Left unedited here so this fix deploys delete-account alone.
//
// Cost: an account above the page ceiling in one table (40 pages less 39 overlap rows:
// 19,961 at a 500-row page) cannot delete until it moves. Loud, never partial.
export const OWNED_PATH_PAGE = 500
export const OWNED_PATH_MAX_PAGES = 40

export interface OwnedPathRow {
  id: string
  storage_path: string
}

export async function readAllOwnedPaths(
  table: string,
  page: (from: number, to: number) => PromiseLike<PullPage>,
): Promise<string[]> {
  const rows: OwnedPathRow[] = []
  const seen = new Set<string>()
  let total: number | null = null
  let reachedEnd = false
  let shifted = false
  let from = 0
  for (let p = 0; p < OWNED_PATH_MAX_PAGES; p++) {
    const start = p === 0 ? 0 : from - 1
    const res = await page(start, start + OWNED_PATH_PAGE - 1)
    // Past the end of the set. On page 0 the count stays null, so (3) throws below.
    if (isRangeNotSatisfiable(res.error)) {
      reachedEnd = true
      break
    }
    const batch = rowsOrThrow<OwnedPathRow>(res, table)
    if (p === 0 && typeof res.count === 'number') total = res.count
    if (p > 0 && batch.length > 0 && !seen.has(batch[0].id)) shifted = true
    let fresh = 0
    for (const row of batch) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
      fresh++
    }
    // The end: nothing at all, or nothing past the overlap row.
    if (batch.length === 0 || (p > 0 && fresh === 0)) {
      reachedEnd = true
      break
    }
    from = start + batch.length
  }

  const fail = (why: string) =>
    new Error(`Failed to read every ${table} row (${why}, read ${rows.length}, completeness unproven)`)
  if (!reachedEnd) throw fail('page ceiling reached')
  if (shifted) throw fail('rows moved during the read')
  if (total === null) throw fail('no count')
  if (rows.length < total) throw fail(`count ${total}`)
  const recount = await page(0, 0)
  if (recount.error && !isRangeNotSatisfiable(recount.error)) {
    throw new Error(`${table} recount failed: ${recount.error.message}`)
  }
  const after = isRangeNotSatisfiable(recount.error) ? 0 : recount.count
  if (typeof after !== 'number' || after !== rows.length) throw fail(`recount ${after ?? 'absent'}`)
  return rows.map((r) => r.storage_path)
}

// ── Post-delete prefix sweep (CUL-2314) ───────────────────────────────────────
// The read above sees the rows that exist when it runs. A file written after it (a
// second phone's upload, a report the server saves) and before the auth delete has
// no row in that read, and the cascade then erases the row it does have, so nothing
// is left to find it by. Every bucket keys its objects under an id this account
// owned: `{petId}/…` for the five pet-health buckets, `{foodItemId}/…` for food
// labels, `{uid}/…` for drug labels. So once the auth user is gone, index.ts lists
// each owned folder and removes whatever sits in it, finding the file by its folder
// rather than by a row that no longer exists.
//
// Why AFTER the delete: once the cascade has run, an owner's client can no longer
// write under these folders (the Storage policies key on pet / creator / uid
// ownership), so the sweep sees the folders' final contents. Swept before the
// delete, the same race would reopen behind it.
//
// Safety: the roots are ids the account's own rows named (`pets.user_id`,
// `food_items.created_by_user_id`) or the verified-JWT uid, never a stored path, so
// a crafted row cannot steer the sweep into another account's folder. Each root must
// be one safe segment, so a blank root can never list a bucket's top level.
//
// What it cannot see, stated: a pet or food item CREATED after index.ts's last id
// read (one round trip before the delete) has a folder this sweep does not know, and
// a service-role writer that uploads after the sweep still lands. The orphan sweep
// (B-121, CUL-231) is the backstop for both.

// Which owned id keys each bucket's first folder. A mapped type over every
// STORAGE_BUCKETS key, so a new bucket fails the build until it says how it is swept.
export const SWEEP_SCOPE: { readonly [K in keyof typeof STORAGE_BUCKETS]: 'pet' | 'food' | 'user' } = {
  petPhotos: 'pet',
  eventAttachments: 'pet',
  vetAttachments: 'pet',
  vetDocuments: 'pet',
  vetReports: 'pet',
  medicationPhotos: 'user',
  foodPhotos: 'food',
}

export interface SweepIds {
  petIds: ReadonlyArray<string>
  foodItemIds: ReadonlyArray<string>
  userId: string
}

export interface PrefixSweep {
  bucket: string
  root: string
}

// Union two id reads, so a later read can only ADD folders to the sweep.
export function mergeSweepIds(a: SweepIds, b: SweepIds): SweepIds {
  if (a.userId !== b.userId) throw new Error('mergeSweepIds: the two reads name different accounts')
  return {
    petIds: [...new Set([...a.petIds, ...b.petIds])],
    foodItemIds: [...new Set([...a.foodItemIds, ...b.foodItemIds])],
    userId: a.userId,
  }
}

// THROWS on an unsafe root. index.ts builds the sweep BEFORE the auth delete, so a
// throw aborts the run with the account intact and retryable, never mid-erasure.
export function buildPrefixSweep(ids: SweepIds): PrefixSweep[] {
  const roots: Record<'pet' | 'food' | 'user', string[]> = {
    pet: [...new Set(ids.petIds)],
    food: [...new Set(ids.foodItemIds)],
    user: [ids.userId],
  }
  for (const root of [...roots.pet, ...roots.food, ...roots.user]) {
    if (typeof root !== 'string' || root.trim().length === 0 || isUnsafeSegment(root)) {
      throw new Error('buildPrefixSweep: every root must be one non-blank, safe segment')
    }
  }
  const out: PrefixSweep[] = []
  for (const key of Object.keys(SWEEP_SCOPE) as Array<keyof typeof STORAGE_BUCKETS>) {
    for (const root of roots[SWEEP_SCOPE[key]]) out.push({ bucket: STORAGE_BUCKETS[key], root })
  }
  return out
}

export interface SweepResult {
  removed: number
  failures: string[]
}

// Runs the sweep over injected Storage calls. Best-effort, like the first purge: the
// account is already gone, so one folder's list or remove failure is recorded (bucket
// and folder, for a reaper or a hand cleanup) and the rest still run. `remove`
// returns how many objects it removed and throws on an error.
export async function sweepOwnedPrefixes(
  sweep: ReadonlyArray<PrefixSweep>,
  listerFor: (bucket: string) => StorageLister,
  remove: (bucket: string, keys: string[]) => Promise<number>,
): Promise<SweepResult> {
  let removed = 0
  const failures: string[] = []
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
  for (const { bucket, root } of sweep) {
    let keys: string[]
    try {
      keys = await listPrefixRecursive(listerFor(bucket), root)
    } catch (e) {
      failures.push(`${bucket}/${root}/ (sweep list): ${message(e)}`)
      continue
    }
    for (const batch of chunk(keys, STORAGE_REMOVE_CHUNK)) {
      try {
        removed += await remove(bucket, batch)
      } catch (e) {
        failures.push(`${bucket}/${root}/ (sweep remove, ${batch.length} objects): ${message(e)}`)
      }
    }
  }
  return { removed, failures }
}

// ── Ordering ──────────────────────────────────────────────────────────────────

// The ordered destructive plan. FR-6's load-bearing invariant: every Storage
// purge precedes the single terminal auth-user delete. Deleting the auth user
// fires the FK cascade (§2a) that erases the DB rows holding these paths — so if
// we deleted it first, a failed Storage purge would orphan health photos with no
// row left to find them by. Last-and-once is what makes the whole run idempotent
// and retryable (AC-9). Expressed as data so the invariant is unit-testable.
export type DeletionStep =
  | { kind: 'purge-bucket'; bucket: string; paths: string[] }
  | { kind: 'delete-auth-user' }

export function buildDeletionPlan(input: OwnedStoragePaths): DeletionStep[] {
  const purges: DeletionStep[] = collectStoragePaths(input).map((p) => ({
    kind: 'purge-bucket',
    bucket: p.bucket,
    paths: p.paths,
  }))
  // The auth-user delete is unconditional and ALWAYS last — even for an empty
  // account with no pets or objects, where the cascade still removes the
  // `auth.users` row and `user_profiles`.
  return [...purges, { kind: 'delete-auth-user' }]
}

// ── Batching ──────────────────────────────────────────────────────────────────

// Split a list into bounded batches (see STORAGE_REMOVE_CHUNK for the why). Pure
// and tested so the shell's purge loop stays a thin call over a proven split.
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ── Re-auth gate (B-119) ────────────────────────────────────────────────────────
//
// The pure half of the server-side re-auth: pull the password out of a
// parsed-JSON request body, returning it ONLY when the body carries a non-empty
// string `password`. Every other shape — missing key, empty string, a
// number/object/array/boolean/null value, or a non-object body (string/number/
// null itself) — returns null, and the I/O shell then fails closed with a 401
// before any read or delete. Presence only, never trimmed: whitespace can be a
// real password character, and GoTrue is the sole authority on correctness.
//
// This is extracted and unit-tested (rather than inlined in index.ts) precisely
// because it is a security gate on an irreversible action — the rls-privacy and
// code reviews both flagged that a future refactor could otherwise regress the
// `typeof === 'string'` check with a green CI. The signInWithPassword call and
// the reauth-before-collect ordering remain I/O in the shell, QA-verified.
export function extractPassword(body: unknown): string | null {
  if (body && typeof body === 'object' && 'password' in body) {
    const pw = (body as { password: unknown }).password
    if (typeof pw === 'string' && pw.length > 0) return pw
  }
  return null
}
