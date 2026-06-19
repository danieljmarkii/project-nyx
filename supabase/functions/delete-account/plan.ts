// Supabase Edge Function — delete-account / plan.ts
//
// The PURE, unit-tested core of B-039 PR 1 (in-app account deletion). It holds
// the two decisions that must be provably correct and that the
// rls-privacy-reviewer will attack: (1) WHICH Storage objects get purged — path
// collection, scoping, and the food-catalog exclusion — and (2) the ORDER of
// destructive operations (FR-6: the auth user is deleted LAST, so a partial or
// failed run is idempotent and re-runnable). No I/O lives here — the index.ts
// shell fetches the user's OWNED rows and executes this plan. Keeping it pure is
// what makes the scoping and ordering invariants testable offline (AC-11).

// ── Storage buckets ───────────────────────────────────────────────────────────
// The four buckets whose objects are pet-health PII tied to THIS user's pets and
// must be erased (FR-3). `nyx-vet-reports` is forward-looking — the bucket lands
// with Step 9; today there are no `vet_reports` rows so it is simply never
// touched, and once it exists the best-effort purge in index.ts tolerates its
// absence (FR-3's "tolerate its absence today").
export const STORAGE_BUCKETS = {
  petPhotos: 'nyx-pet-photos',
  eventAttachments: 'nyx-event-attachments',
  vetAttachments: 'nyx-vet-attachments',
  vetReports: 'nyx-vet-reports',
} as const

// Deliberately NOT purged (FR-4). Food-label photos belong to the GLOBAL
// `food_items` catalog (`created_by_user_id → SET NULL` on delete); they are
// commercial-package images, not pet-health PII, and another user's correlation
// query still resolves them. This constant exists so the exclusion is explicit
// and assertable: `collectStoragePaths` can never emit it (it has no food input),
// and a test pins that no preserved bucket ever appears in a plan.
export const PRESERVED_BUCKETS = ['nyx-food-photos'] as const

// Storage.remove() takes an array of object keys. We batch it for two reasons:
// (1) a single call has a practical payload ceiling; (2) batching isolates
// failure — one rejected batch (e.g. an object deleted out from under us) does
// not drop the rest of the bucket, which tightens FR-5's best-effort guarantee.
export const STORAGE_REMOVE_CHUNK = 100

// ── Path collection / scoping ─────────────────────────────────────────────────

// Raw storage paths read from the user's OWNED rows (scoped in index.ts strictly
// by `pets.user_id = userId`, never from client input — FR-3). Each list arrives
// straight from the DB and may contain nulls (a pet with no photo), blanks, or
// duplicates; cleaning happens here.
export interface OwnedStoragePaths {
  petPhotoPaths: ReadonlyArray<string | null | undefined>
  eventAttachmentPaths: ReadonlyArray<string | null | undefined>
  vetAttachmentPaths: ReadonlyArray<string | null | undefined>
  vetReportPaths: ReadonlyArray<string | null | undefined>
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

// Map each owned path-list to its bucket, dropping any bucket with nothing to
// remove. The output can ONLY ever contain the four STORAGE_BUCKETS above —
// `nyx-food-photos` is unreachable here by construction (there is no food input),
// which is the FR-4 guarantee expressed in code rather than as a hopeful comment.
export function collectStoragePaths(input: OwnedStoragePaths): BucketPurge[] {
  const candidates: BucketPurge[] = [
    { bucket: STORAGE_BUCKETS.petPhotos, paths: cleanPaths(input.petPhotoPaths) },
    { bucket: STORAGE_BUCKETS.eventAttachments, paths: cleanPaths(input.eventAttachmentPaths) },
    { bucket: STORAGE_BUCKETS.vetAttachments, paths: cleanPaths(input.vetAttachmentPaths) },
    { bucket: STORAGE_BUCKETS.vetReports, paths: cleanPaths(input.vetReportPaths) },
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
