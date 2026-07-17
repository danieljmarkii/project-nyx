// Supabase Edge Function — delete-account / plan.ts
//
// The PURE, unit-tested core of B-039 PR 1 (in-app account deletion). It holds
// the two decisions that must be provably correct and that the
// rls-privacy-reviewer will attack: (1) WHICH Storage objects get purged — path
// collection and the two catalog cross-tenant scoping guards (medication uid-prefix,
// food owned-id set) — and (2) the ORDER of
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
export const STORAGE_BUCKETS = {
  petPhotos: 'nyx-pet-photos',
  eventAttachments: 'nyx-event-attachments',
  vetAttachments: 'nyx-vet-attachments',
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
// Scoped to medication paths ONLY: the pet/event/vet buckets come from pet-scoped
// rows and use no per-user-prefix convention, so do NOT extend this filter to them —
// it would drop their legitimate, un-prefixed keys. (Returns the nullable shape so it
// composes directly into cleanPaths, which does the dedupe/blank drop.)
export function scopeMedicationPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownerUserId: string,
): Array<string | null | undefined> {
  if (!ownerUserId || ownerUserId.trim().length === 0) return []
  const prefix = `${ownerUserId}/`
  return paths.filter((p): p is string => typeof p === 'string' && p.startsWith(prefix))
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
// Defuse it at the consumer, mirroring 033's SELECT policy by hand: keep only paths whose
// FIRST segment is the id of a food row THIS user created. We compare the whole first
// segment for exact SET membership (not startsWith) so a food id can never be a string
// prefix of another — UUIDs make collisions impossible, but exact-match is the honest
// encoding of "(storage.foldername(name))[1] IN (owned ids)". An empty owned-id set fails
// CLOSED (drops everything) — a user with no food rows has no food photos to purge, and a
// path can never legitimately name a food id that isn't theirs.
//
// Scoped to food paths ONLY: the pet/event/vet buckets come from pet-scoped rows with no
// per-id path convention, so do NOT extend this filter to them. (Returns the nullable
// shape so it composes directly into cleanPaths, which does the dedupe/blank drop.)
export function scopeFoodPaths(
  paths: ReadonlyArray<string | null | undefined>,
  ownedFoodItemIds: ReadonlyArray<string>,
): Array<string | null | undefined> {
  const owned = new Set(
    ownedFoodItemIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  )
  if (owned.size === 0) return []
  return paths.filter((p): p is string => {
    if (typeof p !== 'string') return false
    // Faithful port of 033's SELECT policy `(storage.foldername(name))[1] IN (owned ids)`:
    // `storage.foldername` returns the FOLDER segments (everything before the final '/'),
    // so a key with NO '/' has an empty folder list and `[1]` is NULL — the policy drops
    // it. Require the separator here too: the food id must be the FOLDER the object lives
    // in (`{ownedId}/{slot}.jpg`), not the whole opaque key. A bare, slashless key is not
    // a real food photo and is dropped rather than deleting an object literally named for
    // a food id.
    const slash = p.indexOf('/')
    if (slash < 0) return false
    return owned.has(p.slice(0, slash))
  })
}

// Map each owned path-list to its bucket, dropping any bucket with nothing to
// remove. The output can ONLY ever contain the six STORAGE_BUCKETS above, and
// PRESERVED_BUCKETS is now empty — every bucket a user's objects can live in is
// purgeable. The two catalog-sourced buckets (medication + food) are the ones whose
// path VALUES are attacker-influenceable, so each is re-scoped BEFORE cleaning —
// medication to the owner's `{uid}/` prefix, food to the owned-food-id SET — so a
// crafted cross-tenant path never reaches the service-role purge.
export function collectStoragePaths(input: OwnedStoragePaths): BucketPurge[] {
  const candidates: BucketPurge[] = [
    { bucket: STORAGE_BUCKETS.petPhotos, paths: cleanPaths(input.petPhotoPaths) },
    { bucket: STORAGE_BUCKETS.eventAttachments, paths: cleanPaths(input.eventAttachmentPaths) },
    { bucket: STORAGE_BUCKETS.vetAttachments, paths: cleanPaths(input.vetAttachmentPaths) },
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
