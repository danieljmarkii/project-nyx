// Pure reconciliation logic for B-054 down-sync (hydration).
//
// The I/O shell in lib/sync.ts pulls remote rows via supabase-js and feeds them
// here; these functions decide which rows land in local SQLite and never touch
// the DB or the network, so they are unit-testable without native modules
// (mirrors the phrasing.ts / index.ts split in generate-signal and the
// deriveOccurredAt helper in lib/utils).
//
// ── Conflict model (Phase 2, FR-4/FR-5 — the ACCEPTED v1 design, not a stopgap)
// Reconciliation is last-write-wins on `updated_at`: a remote row overwrites the
// local row only when it is STRICTLY newer, so a locally-newer edit (e.g. an
// offline change not yet pushed) is never clobbered by an older remote copy.
// As of migration 016 (B-055) meals carry `updated_at` too, so events, meals,
// and vet_visits all reconcile the same way; the Phase-1 `refresh-if-synced`
// synced-flag proxy for meals is retired.
//
// ⚠️ Named failure mode (PM decision, requirements §5.2 FR-5 = server-time LWW).
// The schema's `set_updated_at` trigger stamps `updated_at = NOW()` on every
// server write, including the DO UPDATE branch of a client upsert. So "last
// write" means "last push to REACH THE SERVER", not true authorship time. The
// bounded surprise: if two devices each edit the SAME row while offline and then
// reconnect, push-before-pull sends both edits up and the one whose push lands
// last at the server wins — regardless of which edit was actually made later by
// wall clock. For two trusted caregivers who rarely edit the same row in the
// same window this is acceptable for v1; the row's content is never merged or
// corrupted, one whole edit simply supersedes the other. The true-authorship fix
// (a client-authored timestamp the trigger ignores) is deferred to if/when
// linked accounts land. This comment IS the §5.2 requirement that the failure
// mode be named rather than left implicit (the useSync.ts:25 debt, paid down).
//
// Note: push-before-pull (FR-2) is the real protector of an UNPUSHED local edit
// — it ships up first, so by the time the pull runs the server row already is
// that edit. LWW handles everything already converged. The two are complementary.

export type ReconcileStrategy = 'lww' | 'insert-if-absent';

export interface LocalRowMeta {
  // null/undefined for tables without an updated_at column (attachments).
  updated_at?: string | null;
}

export interface RemoteRow {
  id: string;
  updated_at?: string | null;
}

// Parse a timestamp to epoch millis for LWW comparison, returning null if
// unusable. Handles a format trap: SQLite's `datetime('now')` default (used by
// the events/vet_visits/meals `updated_at` DEFAULT, and by any insert that
// doesn't set updated_at explicitly) writes "YYYY-MM-DD HH:MM:SS" — UTC,
// space-separated, with NO timezone marker. `Date.parse` treats that bare form
// as LOCAL time, while ISO-8601 values (new Date().toISOString() on the client,
// TIMESTAMPTZ from Postgres) carry a Z/offset and parse as UTC. A row created on
// this device and never re-hydrated keeps the space form, so on a device whose
// timezone isn't UTC its own updated_at parses hours off — and another device's
// edit/delete to that row is wrongly judged "older" and skipped (the cross-device
// delete-not-propagating bug). Normalize the space form to explicit UTC before
// parsing so both sides compare on the same clock. (The app's writers now all use
// toISOString(); this guard defends legacy/default rows. Two narrower offset-less
// forms are out of scope — see B-056.)
export function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)
    ? ts.replace(' ', 'T') + 'Z'
    : ts;
  const n = Date.parse(normalized);
  return Number.isNaN(n) ? null : n;
}

// Decide whether a single remote row should be written into local SQLite.
export function shouldWriteRemoteRow(
  remote: RemoteRow,
  local: LocalRowMeta | undefined,
  strategy: ReconcileStrategy,
): boolean {
  // Not present locally → always write (the cold-start case, FR-1).
  if (!local) return true;

  // Truly insert-only tables (attachments: no server updated_at, never edited
  // in place — only inserted or hard-deleted). Never overwrite an existing
  // local row: there is nothing to reconcile, and overwriting would stomp the
  // local-only local_uri column (the on-device file path).
  if (strategy === 'insert-if-absent') return false;

  // LWW (events, meals, vet_visits): replace only when the remote row is
  // strictly newer. See the header for the server-time-LWW failure mode. Note
  // the I/O shell ALSO applies a `WHERE <table>.synced = 1` SQL backstop on the
  // DO UPDATE so an unpushed local edit can't be overwritten even if this filter
  // is ever bypassed — defense-in-depth, not the primary guard.
  const remoteT = parseTs(remote.updated_at);
  const localT = parseTs(local.updated_at);
  // An undated remote row can't be shown to be newer → don't clobber.
  if (remoteT === null) return false;
  // Local row carries no usable timestamp → trust the dated remote copy.
  if (localT === null) return true;
  // Strictly greater: an equal timestamp is a no-op (and, crucially, an
  // offline local edit that's already been pushed-then-pulled converges
  // without a spurious rewrite).
  return remoteT > localT;
}

// ── FR-3: incremental hydration high-water mark ──────────────────────────────
//
// After the first (cold) pull, each target table tracks the max timestamp it has
// successfully pulled; the next pull asks Supabase only for rows changed since
// (`.gte(column, watermark)`), instead of re-downloading the whole history on
// every foreground. The watermark column is the row's server-stamped change time:
// `updated_at` for the LWW tables (events/meals/vet_visits), `created_at` for the
// insert-only attachment tables (no updated_at).
//
// ⚠️ The bound is INCLUSIVE (>=), and that is the whole boundary correctness
// argument. The watermark is set to max(updated_at) of the rows pulled. A strict
// (>) bound on the next pull would permanently skip any row whose updated_at
// exactly equals the stored watermark but that wasn't in the prior pull's
// snapshot — e.g. a second row server-stamped in the same microsecond, or a row
// that committed just after our SELECT read. With `.gte` those boundary rows are
// re-pulled (bounded to the rows sharing the max timestamp — usually one), which
// is harmless because the reconcile is idempotent: an equal-timestamp LWW
// comparison is a no-op and an insert-if-absent of an existing row is a no-op.
// Re-pulling a boundary row is cheap; losing one is silent data loss. Both the
// watermark and the row timestamps it's compared against are server values, so
// there is no client-clock skew in this comparison (unlike the LWW path, which
// parseTs guards).
//
// ⚠️ Commit-skew overlap (the OTHER half of the boundary argument). The
// set_updated_at trigger stamps updated_at = now(), and Postgres now() is
// TRANSACTION-START time, not commit time. So a write whose transaction began
// before another device's pull but COMMITS after that pull's snapshot lands with
// an updated_at *below* the pull's observed max. If the watermark advanced to that
// max and the next pull used a strict-or-equal bound AT the max, that row would
// sit permanently below the watermark and never be re-pulled — silent
// cross-device divergence, the exact "two phones never agree" bug B-054 exists to
// fix. Defense: the next pull's lower bound is the stored watermark pulled BACK by
// a safety overlap, re-pulling a short recent window every cycle. The overlap only
// has to exceed the longest write transaction; mobile single-row upserts are
// sub-second, so 2 min is enormous headroom, and the re-pulled window reconciles
// idempotently (equal-timestamp LWW and insert-if-absent are both no-ops). The
// STORED watermark still advances to the true max so it can never stall.
export const HYDRATE_WATERMARK_OVERLAP_MS = 2 * 60 * 1000;

// The lower bound for an incremental `.gte()` pull: the stored watermark pulled
// back by the safety overlap. null (cold start) → null (full pull); an
// unparseable stored value also falls back to a full pull rather than passing
// garbage to PostgREST.
export function watermarkQueryFloor(
  watermark: string | null,
  overlapMs: number = HYDRATE_WATERMARK_OVERLAP_MS,
): string | null {
  const t = parseTs(watermark);
  if (t === null) return null;
  return new Date(t - overlapMs).toISOString();
}

// Compute the new watermark from a batch of timestamp strings, never regressing
// below the prior value. Returns `prior` unchanged for an empty batch or one
// with no parseable timestamps (so a flaky/empty pull never rewinds the mark).
// Returns the raw max string (not the parsed number) so it can be fed straight
// back to PostgREST `.gte()` as a timestamptz literal.
export function advanceWatermark(
  timestamps: (string | null | undefined)[],
  prior: string | null,
): string | null {
  let bestRaw = prior;
  let bestNum = parseTs(prior);
  for (const ts of timestamps) {
    const n = parseTs(ts);
    if (n === null) continue;
    if (bestNum === null || n > bestNum) {
      bestNum = n;
      bestRaw = ts ?? bestRaw;
    }
  }
  return bestRaw;
}

// ── FR-8: hard-deleted-meal absence reconciliation (PM decision: absence) ─────
//
// Meals are HARD-`DELETE`d server-side by the food-deletion cascade
// (app/food/[id].tsx), so a pull can't observe a row that no longer exists — a
// meal deleted on device A would linger forever as a ghost on device B. v1 fix
// (requirements §5.3 FR-8, PM ruling = absence-reconcile, not a tombstone
// schema): periodically pull the server's full set of meal ids (id-only, cheap)
// and delete any local meal the server no longer has.
//
// ⚠️ Load-bearing guard: NEVER delete an unsynced local meal (synced = 0). Such a
// row legitimately isn't on the server yet — it just hasn't been pushed — so
// reconciling it by absence would destroy a fresh local write. Only synced = 1
// rows (which, by definition, came from or were confirmed by the server) are
// eligible for absence-deletion. Pure so the boundary is unit-tested; the I/O
// shell in lib/sync.ts supplies the server id set and executes the deletes.
export function mealsToDeleteByAbsence(
  serverIds: Iterable<string>,
  localMeals: { id: string; synced: number }[],
): string[] {
  const serverSet = serverIds instanceof Set ? serverIds : new Set(serverIds);
  const out: string[] = [];
  for (const m of localMeals) {
    if (m.synced === 1 && !serverSet.has(m.id)) out.push(m.id);
  }
  return out;
}

// Partition a batch of remote rows into those to write vs those to skip, given
// the current local state keyed by id. Pure: lib/sync.ts feeds SELECT results
// in and executes the returned writes.
export function reconcileBatch<T extends RemoteRow>(
  remoteRows: T[],
  localById: Map<string, LocalRowMeta>,
  strategy: ReconcileStrategy,
): { toWrite: T[]; skipped: T[] } {
  const toWrite: T[] = [];
  const skipped: T[] = [];
  for (const row of remoteRows) {
    if (shouldWriteRemoteRow(row, localById.get(row.id), strategy)) {
      toWrite.push(row);
    } else {
      skipped.push(row);
    }
  }
  return { toWrite, skipped };
}

// FR-9 — local tables holding account-scoped pet data mirrored from Supabase,
// in FK-safe delete order (children before parents, so an explicit DELETE never
// trips a foreign-key constraint regardless of cascade settings). Cleared on
// sign-out so a shared/borrowed device cannot leak the prior account's health
// record. This is safe to wipe now precisely because Phase 1 hydration re-pulls
// everything on the next login. food_items_cache is the global (non-private)
// food catalog; we clear it too so a different account starts clean and
// re-hydrates its own view via refreshFoodCache.
//
// sync_watermarks (FR-3) MUST be wiped here too: it is not pet data, but a stale
// per-table high-water mark surviving a sign-out would make the NEXT account's
// first login an *incremental* pull from the prior account's watermark — silently
// skipping all of the new account's history older than that mark. Clearing it
// forces a correct full cold-start pull (watermark = null) after every wipe.
//
// medication_items_cache (B-117) is the drug-catalog analog of food_items_cache:
// the global (non-private) read-through cache, cleared for the same reason and
// re-hydrated by refreshMedicationCache on the next login.
export const LOCAL_WIPE_TABLES = [
  'meals',
  'event_attachments',
  'vet_visit_attachments',
  // B-117 medication mirror (children-first). medication_administrations
  // FK→events ON DELETE CASCADE locally, so it MUST precede events. medications
  // and medication_items_cache carry no local FK, but are grouped here so the
  // medication set stays contiguous and still lands before its parent tables.
  'medication_administrations',
  'medications',
  'medication_items_cache',
  'events',
  'vet_visits',
  // feeding_arrangements (B-040 R1) — a pet-child standing-fact table mirrored
  // from Supabase, so it's account-scoped data that must not leak to the next
  // account on a shared device. No local FK constraint, so order is free.
  'feeding_arrangements',
  'food_items_cache',
  'sync_watermarks',
] as const;
