// Supabase Edge Function — delete-account / plan.ts
//
// The PURE, unit-tested core of B-039 PR 1 (in-app account deletion). It holds
// the two decisions that must be provably correct and that the
// rls-privacy-reviewer will attack: (1) WHICH Storage objects get purged — path
// collection, the three cross-tenant scoping guards (medication uid-prefix, food
// owned-id set, vet-document owned-pet set) and the B-578 sweep's prefix scopes — and
// (2) the ORDER of
// destructive operations (FR-6: the auth user is deleted LAST, so a partial or
// failed run is idempotent and re-runnable). No I/O lives here — the index.ts
// shell fetches the user's OWNED rows, enumerates the owned prefixes, and executes
// this plan. Keeping it pure is
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
  // food paths are `{foodItemId}/{slot}.jpg`, so the security key is "the first segment
  // is a food row THIS user created," mirroring migration 033's food-photo SELECT policy.
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
  // Storage SELECT policy's `(storage.foldername(name))[1] IN (owned pet ids)` by hand.
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
// deleting user's OWN uid — exactly what `buildMedicationPhotoPath` (lib/storage.ts)
// produces for every legitimate client write, and what RLS 021 enforces for every
// legitimate upload. A blank `ownerUserId` fails CLOSED (drops everything) rather than
// letting the prefix collapse and match every path — index.ts always supplies the
// verified-JWT uid, so this is defense-in-depth.
//
// ⚠ B-582 round 2 — this was the THIRD twin, and the first cut of B-582 ported the
// whole-shape guard to two of the three. It was a bare `startsWith(uid + '/')`, which
// the reviewer executed: `{ownUid}/../{victimUid}/{med}/0-label.jpg` and four sibling
// variants were all KEPT and reached the service-role `remove()`. That is the worst of
// the three buckets to leave behind — `medication_items` is the globally-writable
// catalog B-128 was written about, and a prescription label carries owner, pet and
// clinic names. A fix whose stated point is "the next correction lands on every twin by
// construction rather than by someone remembering there is a twin" does not get to
// leave one of them un-ported; that was the original defect wearing a different hat.
//
// So it delegates too, at THREE segments: `buildMedicationPhotoPath` emits exactly
// `{uid}/{medicationItemId}/{slot}.jpg` and already rejects `/`, `\` and `..` per
// segment at the mint site. Verified against production before tightening, the same
// gate the food port passed: the single stored `photo_paths` value has exactly two
// separators and its first segment is its own `created_by_user_id`, and both objects
// in the bucket have the same shape. Exact set membership also subsumes what the
// trailing '/' used to do by hand — `user-1` cannot match `user-12/…`.
//
// Scoped to medication paths ONLY: the pet/event/vet buckets come from pet-scoped
// rows and use no per-user-prefix convention, so do NOT extend this filter to them —
// it would drop their legitimate, un-prefixed keys. (Returns the nullable shape so it
// composes directly into cleanPaths, which does the dedupe/blank drop.)
export function scopeMedicationPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownerUserId: string,
): Array<string | null | undefined> {
  return scopeToOwnedKeyShape(paths, [ownerUserId], 3)
}

// The shape+ownership predicate ALL THREE scoping guards are built from — medication
// (above), food and vet documents (below).
//
// It exists because the guards drifting apart is exactly what B-582 was: VF-1
// discovered that a first-segment test admits `{ownId}/../{victimId}/x` (the `..` is
// the SECOND segment), fixed it for vet documents, and left the food twin as the
// first-segment test its own comment warned against. One shared predicate means the
// next correction lands on every guard by construction rather than by someone
// remembering there is a twin — which the first cut of B-582 promptly proved by
// porting to two of the three and leaving `scopeMedicationPaths` on the old test.
// Three call sites, one predicate, one place to fix.
//
// The rule: a key is kept only if it has EXACTLY `segmentCount` non-empty segments and
// its first segment is an id the caller provably owns.
//
//   • Exact segment count — not a prefix test — drops every traversal variant
//     (`a/../b/x`, `a/../../b/x`, `a//../b/x`) by construction, rather than by trusting
//     storage-api and S3 to keep treating `storage.objects.name` as an opaque literal
//     that never resolves `..`. That is true today, and it is a third-party
//     implementation detail we neither own nor test.
//   • Non-empty, non-relative segments — `{ownId}/` and `{ownId}/..` both pass a bare
//     count test, and neither is something any builder in this app can mint. `..` in
//     the trailing position is the same bet on opacity as `..` in the middle, just one
//     slot over, so it is refused for the same reason rather than a different one.
//   • No `..` or `\` ANYWHERE in the key, as substrings. The segment rules above are
//     structural and a segment-count test cannot see a separator the key has ENCODED:
//     `{ownId}/..%2F{victimId}%2F0-front.jpg` and `{ownId}/..\{victimId}\0-front.jpg`
//     are two genuine, non-empty segments whose first is genuinely owned, so the
//     structural rules keep them (executed by the B-582 rls-privacy-reviewer). They
//     delete nothing today — `remove()` sends the keys in the request BODY, so nothing
//     percent-decodes them, and storage-api matches `name` exactly — but "nothing
//     decodes it" is the same opacity dependency this predicate exists to stop relying
//     on. This repo's own sibling validator already draws the line here
//     (`extract-food-from-photo` validateFoodPhotoPaths rejects `..` and `\` as
//     substrings); matching it costs nothing, since no legitimate key contains either.
//   • Exact SET membership on the first segment, never `startsWith`, so one id can
//     never be a string prefix of another. UUIDs make that collision impossible in
//     practice; exact-match is the honest encoding of the Storage policies' own
//     `(storage.foldername(name))[1] IN (owned ids)`.
//   • An empty owned-id set fails CLOSED (drops everything) — a caller who owns no
//     rows of the owning table has no objects to purge, and a path can never
//     legitimately name an id that is not theirs.
//
// `segmentCount` is deliberately a PARAMETER and not a shared constant: the shape is
// per-bucket (see each caller), and lifting one bucket's shape onto another silently
// turns its purge into a no-op. Returns the nullable shape so it composes directly
// into cleanPaths, which does the dedupe/blank drop.
function scopeToOwnedKeyShape(
  paths: ReadonlyArray<string | null | undefined>,
  ownedIds: ReadonlyArray<string>,
  segmentCount: number,
): Array<string | null | undefined> {
  const owned = new Set(
    ownedIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  )
  if (owned.size === 0) return []
  return paths.filter((p): p is string => {
    if (typeof p !== 'string') return false
    if (p.includes('..') || p.includes('\\')) return false
    const segments = p.split('/')
    if (segments.length !== segmentCount) return false
    if (segments.some((s) => s.length === 0 || s === '.')) return false
    return owned.has(segments[0])
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
// ⚠ B-582 — this used to be a FIRST-SEGMENT test, and that is not enough. The VF-1
// reviewer proved it on the vet twin below and the B-577 reviewer then executed the
// same three strings against THIS filter: `{ownFoodId}/../{victimFoodId}/0-front.jpg`,
// `{own}/../../{victim}/…` and `{own}//../{victim}/…` were all KEPT, because the first
// segment genuinely is an owned food id — and `cleanPaths` never normalises, so they
// reached the service-role `remove()` verbatim. The vet-document guard had already been
// rebuilt as a whole-shape test for precisely this, with a comment warning that copying
// the food guard verbatim was the mistake; the correction is now shared (see
// scopeToOwnedKeyShape) instead of living on one of the two twins.
//
// The shape is EXACTLY two segments. Both mint sites emit `{foodItemId}/{n}-{slot}.jpg`
// and nothing else (`app/food-capture.tsx` pickPhoto, `app/food/[id].tsx` replace/append),
// and the tightening was verified against production before it shipped: all 135 stored
// `photo_paths` values and all 160 objects in the bucket have exactly one separator, and
// every one names its own row's id. So this drops traversal keys and nothing real.
//
// Scoped to food paths ONLY: the pet/event/vet-attachment buckets come from pet-scoped
// rows with no per-id path convention, so do NOT extend this filter to them.
export function scopeFoodPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedFoodItemIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  return scopeToOwnedKeyShape(paths, ownedFoodItemIds, 2)
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
// is the SECOND segment — so a first-segment filter keeps the path and changes
// nothing about the residual. Copying the food-photo guard verbatim was the mistake;
// food paths and vet-document paths merely LOOK alike. (B-582 has since rebuilt the
// food guard the same way and moved the shared half into scopeToOwnedKeyShape, so
// the two can no longer drift.)
//
// So this checks the WHOLE SHAPE, which is also a truer port of the convention:
// `buildVetDocumentPath` emits exactly `{pet_id}/{document_id}.{ext}` — one
// separator, two segments, no more.
//
// Scoped to vet-document paths ONLY: the two-segment shape is NOT liftable to the
// pet/event/vet-attachment lists. `nyx-vet-attachments` keys are
// `{pet_id}/{visit_id}/{attachment_id}.jpg` — THREE segments — so this exact predicate
// would silently drop every legitimate key there and turn account deletion into a
// no-op for that bucket. The shape is per-bucket; only the ownership half generalises,
// which is why `segmentCount` is an argument.
export function scopeVetDocumentPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedPetIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  return scopeToOwnedKeyShape(paths, ownedPetIds, 2)
}

// Map each owned path-list to its bucket, dropping any bucket with nothing to
// remove. The output can ONLY ever contain the seven STORAGE_BUCKETS above, and
// PRESERVED_BUCKETS is now empty — every bucket a user's objects can live in is
// purgeable. Three lists are re-scoped BEFORE cleaning, each against the key its own
// Storage policy uses — medication to the owner's `{uid}/` prefix, food to the
// owned-food-id SET, vet documents to the owned-pet-id SET — so a crafted
// cross-tenant path never reaches the service-role purge.
export function collectStoragePaths(input: OwnedStoragePaths): BucketPurge[] {
  const candidates: BucketPurge[] = [
    { bucket: STORAGE_BUCKETS.petPhotos, paths: cleanPaths(input.petPhotoPaths) },
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

// ── B-578 — the prefix sweep (what no surviving row names) ────────────────────
//
// Everything above sources the purge from a COLUMN: `pets.photo_path`,
// `*.storage_path`, `*_items.photo_paths`. That erases exactly the objects some
// surviving row still NAMES — and nothing else. Two classes escape it:
//
//   1. Residue. A replaced photo whose row update failed, an upload whose row write
//      never landed, an object left behind by the pre-B-005 hard-delete cascade.
//      Measured live 2026-07-29: 44 objects across the three populated buckets are
//      named by no row at all (27 food, 16 event-attachment, 1 medication).
//   2. Relocation, which is the case B-578 names. Permissive Storage policies OR
//      together and Postgres evaluates USING and WITH CHECK independently, so an owner
//      can `move()` an object whose SOURCE satisfies one bucket's owner-UPDATE into a
//      DESTINATION satisfying another's — food photo → `nyx-pet-photos` under their own
//      `{petId}/` prefix. The object lands in a bucket whose purge reads a different
//      column, so NO row names it and a food-prefix-scoped sweep would not find it
//      either. A within-prefix rename is the same trick and is the residual migration
//      043 recorded for vet attachments.
//
// ⚠ Be precise about (2): the sweep closes RELOCATION, not DELIBERATE EVASION, and an
// earlier draft of this comment overstated it. Every bucket's INSERT policy checks only
// `foldername[1]`, so an owner may legitimately write `{ownPetId}/a/b/c/d/e.jpg` — and
// the walk stops at SWEEP_MAX_DEPTH, which the rls-privacy-reviewer executed and
// confirmed misses it. Raising the cap does not fix that; any fixed depth is evadable
// by nesting one level deeper, and an uncapped walk is the timeout risk that must not
// sit ahead of the terminal auth delete. So the honest boundary: this reaches objects
// that MOVED, including across buckets, and does not claim to beat an owner who is
// actively hiding one. Adversarial hiding is the object-side reaper's problem (B-121),
// because that one starts from the objects and needs no prefix to guess.
//
// The answer to both is to stop asking the rows and ask STORAGE: enumerate the
// objects living under the prefixes this account owns. Note what that also buys —
// swept keys are constructed from a real listing under a prefix we vouch for, so the
// crafted-`photo_paths` primitive the guards above defuse cannot exist on this path
// at all.
//
// The ownership keys are exactly the ones already proven above — no new claim is
// introduced, which is the whole reason this is safe to run as the service role:
//   • owned PET ids     → the four pet-scoped buckets
//   • owned FOOD ids    → nyx-food-photos (migrations 033/036/046 scope every write
//                          there to the owner of the food named by the first segment)
//   • the caller's UID  → nyx-medication-photos (migration 021's per-user prefix)
//
// `nyx-vet-reports` is deliberately NOT swept: Step 9 has not shipped, the table holds
// zero rows, and no path convention exists yet to derive a prefix from. Sweeping a
// bucket requires knowing what its prefixes MEAN; guessing is how a sweep deletes
// something it shouldn't. It stays column-sourced until Step 9 defines the shape —
// an omission by decision, not by oversight.
//
// What this still cannot reach: an object whose owning id is ALREADY gone. 39 of the
// 44 measured above are that — 25 food objects under a food id no row holds, and 14
// event attachments under a pet hard-deleted long ago (the exact set B-121 recorded).
// The ACCOUNT is live; what is missing is any surviving row tying the object to it, so
// there is no prefix a deletion run could derive and no run can ever find them. Those
// need the separate global reaper (B-121 / B-578's one-off service-role sweep), which
// can start from the objects instead of from the account. This closes the
// forward-looking hole; it does not retroactively clean the bucket, and B-578 should
// not be closed as though it did.
export interface SweepScope {
  bucket: string
  // Top-level prefixes to enumerate, WITHOUT a trailing '/'. Each is an id the caller
  // provably owns.
  prefixes: string[]
}

// An id becomes a listing prefix, so it is sanitised on the way in even though every
// source is a uuid column and cannot contain a separator. Cheap, and it is the same
// lesson B-582 just paid for: do not let a string that looks like an id decide the
// shape of a privileged operation.
function ownedPrefixes(ids: ReadonlyArray<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string') continue
    const trimmed = id.trim()
    if (trimmed.length === 0) continue
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

// Buckets with no prefixes to enumerate are dropped rather than emitted empty — an
// empty prefix would list the bucket ROOT, i.e. every account's objects, which is the
// one thing this must never do. Failing closed here means a user with no pets simply
// has no pet-bucket sweep.
export function buildSweepScopes(input: OwnedStoragePaths): SweepScope[] {
  const petPrefixes = ownedPrefixes(input.ownedPetIds)
  const foodPrefixes = ownedPrefixes(input.ownedFoodItemIds)
  const uidPrefixes = ownedPrefixes([input.ownerUserId])
  const scopes: SweepScope[] = [
    { bucket: STORAGE_BUCKETS.petPhotos, prefixes: petPrefixes },
    { bucket: STORAGE_BUCKETS.eventAttachments, prefixes: petPrefixes },
    { bucket: STORAGE_BUCKETS.vetAttachments, prefixes: petPrefixes },
    { bucket: STORAGE_BUCKETS.vetDocuments, prefixes: petPrefixes },
    { bucket: STORAGE_BUCKETS.medicationPhotos, prefixes: uidPrefixes },
    { bucket: STORAGE_BUCKETS.foodPhotos, prefixes: foodPrefixes },
  ]
  return scopes.filter((s) => s.prefixes.length > 0)
}

// Fold the swept keys into the column-sourced purge list.
//
// ADDITIVE by construction: this can only ever ADD keys to a bucket or add a bucket.
// It never drops one, so the sweep cannot regress the erasure guarantee the
// column-sourced path already provides — if listing fails, times out, or returns
// nothing, deletion behaves exactly as it did before this existed. Column paths keep
// their position and order; swept extras follow.
//
// Swept keys are re-validated against the scopes rather than trusted, for the same
// reason scopeFoodPaths exists: a key is kept only if it sits under a prefix declared
// for THAT bucket (`{prefix}/…`, prefix-with-separator so one id cannot string-prefix
// another) and every one of its segments is non-empty and is not `.` or `..`. A
// listing response is third-party input; the sweep is a service-role delete.
// APPEND, never `set`. Overwriting silently discards the first entry's paths if a
// caller ever hands over the same bucket twice — unreachable today (the seven
// STORAGE_BUCKETS values are distinct and collectStoragePaths emits each once), but that
// is a property of the CALLER, and mergeSweptPaths is exported, independently tested,
// and documents itself as additive. A docstring promising "it never drops one" has to be
// true of the function, not of today's only call site (B-582 round 2,
// rls-privacy-reviewer). Order-preserving and duplicate-free on the way in.
function appendUnique(
  byBucket: Map<string, string[]>,
  order: string[],
  bucket: string,
  keys: ReadonlyArray<string>,
): void {
  if (keys.length === 0) return
  let existing = byBucket.get(bucket)
  if (!existing) {
    existing = []
    byBucket.set(bucket, existing)
    order.push(bucket)
  }
  const seen = new Set(existing)
  for (const key of keys) {
    if (seen.has(key)) continue
    seen.add(key)
    existing.push(key)
  }
}

export function mergeSweptPaths(
  purges: ReadonlyArray<BucketPurge>,
  swept: ReadonlyArray<BucketPurge>,
  scopes: ReadonlyArray<SweepScope>,
): BucketPurge[] {
  const byBucket = new Map<string, string[]>()
  const order: string[] = []
  for (const p of purges) {
    appendUnique(byBucket, order, p.bucket, p.paths)
  }
  for (const s of swept) {
    const allowed = new Set(scopes.find((sc) => sc.bucket === s.bucket)?.prefixes ?? [])
    if (allowed.size === 0) continue
    const kept = s.paths.filter((key) => {
      if (typeof key !== 'string' || key.length === 0) return false
      if (key.includes('..') || key.includes('\\')) return false
      const segments = key.split('/')
      if (segments.length < 2) return false
      if (segments.some((seg) => seg.length === 0 || seg === '.')) return false
      return allowed.has(segments[0])
    })
    appendUnique(byBucket, order, s.bucket, kept)
  }
  return order
    .map((bucket) => ({ bucket, paths: byBucket.get(bucket) ?? [] }))
    .filter((p) => p.paths.length > 0)
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

// `swept` is the optional B-578 prefix-scan result (index.ts enumerates it from
// Storage; it is empty when the sweep is skipped, fails, or is exhausted). It is
// merged, never substituted — see mergeSweptPaths — so the ordering invariant and the
// column-sourced purge below are identical with or without it. Defaulting it to `[]`
// keeps every existing caller and test honest against the un-swept behaviour.
export function buildDeletionPlan(
  input: OwnedStoragePaths,
  swept: ReadonlyArray<BucketPurge> = [],
): DeletionStep[] {
  const merged = mergeSweptPaths(collectStoragePaths(input), swept, buildSweepScopes(input))
  const purges: DeletionStep[] = merged.map((p) => ({
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
