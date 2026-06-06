// Pure reconciliation logic for B-054 down-sync (hydration).
//
// The I/O shell in lib/sync.ts pulls remote rows via supabase-js and feeds them
// here; these functions decide which rows land in local SQLite and never touch
// the DB or the network, so they are unit-testable without native modules
// (mirrors the phrasing.ts / index.ts split in generate-signal and the
// deriveOccurredAt helper in lib/utils).
//
// Phase 1 is deliberately a NAIVE guard — insert-if-absent, else replace only
// when the remote row is strictly newer by updated_at. It is NOT the
// trigger-correct last-write-wins: the set_updated_at server trigger rewrites
// updated_at = NOW() on every server write, so server-arrival order is not true
// authorship order (docs/multi-device-sync-requirements.md §5.2, FR-5). That
// correctness work is Phase 2. This guard's only job is to never clobber an
// obviously-newer local row (e.g. an offline edit not yet pushed).

export type ReconcileStrategy = 'lww' | 'insert-if-absent' | 'refresh-if-synced';

export interface LocalRowMeta {
  // null/undefined for tables without an updated_at column (meals, attachments).
  updated_at?: string | null;
  // The local synced flag (0 = pending local write, 1 = converged with server).
  // Only consulted by 'refresh-if-synced'.
  synced?: number | null;
}

export interface RemoteRow {
  id: string;
  updated_at?: string | null;
}

// Parse a timestamp to epoch millis for LWW comparison, returning null if
// unusable. Handles a format trap: SQLite's `datetime('now')` default (used by
// the events/vet_visits `updated_at` DEFAULT, and by every insert that doesn't
// set updated_at explicitly — e.g. the FAB quick-log) writes
// "YYYY-MM-DD HH:MM:SS" — UTC, space-separated, with NO timezone marker.
// `Date.parse` treats that bare form as LOCAL time, while ISO-8601 values
// (new Date().toISOString() on the client, TIMESTAMPTZ from Postgres) carry a
// Z/offset and parse as UTC. A row created on this device and never re-hydrated
// keeps the space form, so on a device whose timezone isn't UTC its own
// updated_at parses hours off — and another device's edit/delete to that row is
// wrongly judged "older" and skipped (the cross-device delete-not-propagating
// bug). Normalize the space form to explicit UTC before parsing so both sides
// compare on the same clock.
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

  // Meals (FR-6): no updated_at column exists (server or local), so we can't do
  // updated_at LWW — but meals ARE mutated in place by updateMealFood /
  // updateMealIntake (the clinically load-bearing WSAVA intake_rating). Pure
  // insert-if-absent would silently drop a cross-device meal correction and
  // leave device B reassuring on a stale intake reading — a violation of the
  // intake-safety invariant. Without a timestamp the safe proxy is the synced
  // flag: refresh a converged (synced=1) local meal from the server so another
  // device's correction propagates, but never clobber a row with a pending
  // local edit (synced=0) — push-before-pull sends that up first. (Two offline
  // edits to the same meal still resolve by server arrival; that's the same
  // bounded Phase-2 limit as events. Principled fix = a meals.updated_at
  // migration, see backlog.)
  if (strategy === 'refresh-if-synced') {
    return (local.synced ?? 0) === 1;
  }

  // LWW (naive Phase 1): replace only when the remote row is strictly newer.
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
