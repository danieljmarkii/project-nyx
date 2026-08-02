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
// `nyx-vet-reports` is forward-looking — the bucket lands with Step 9; today there
// are no `vet_reports` rows so it is simply never touched, and once it exists the
// best-effort purge in index.ts tolerates its absence (FR-3's "tolerate its absence
// today"). The same tolerance covers `nyx-medication-photos` before its dashboard
// creation / first PR-5 upload — until then there are no `photo_paths`, so the
// bucket is never even reached.
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
// purgeable. Four lists are re-scoped BEFORE cleaning, each against the key its own
// Storage policy uses — medication to the owner's `{uid}/` prefix, food to the
// owned-food-id SET, vet documents and pet photos to the owned-pet-id SET — so a
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
    { bucket: STORAGE_BUCKETS.vetReports, paths: cleanPaths(input.vetReportPaths) },
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
