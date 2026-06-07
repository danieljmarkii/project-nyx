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
export const LOCAL_WIPE_TABLES = [
  'meals',
  'event_attachments',
  'vet_visit_attachments',
  'events',
  'vet_visits',
  'food_items_cache',
] as const;
