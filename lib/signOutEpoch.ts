// Sign-out epoch (FR-9 Trust & Safety gate). Bumped on sign-out. A writer already
// running captures the epoch when it starts and re-checks it before each write: a
// network fetch or a chain of awaits can take long enough for a sign-out and its
// `clearLocalData` to land mid-pass. If the epoch moved, the writer bails instead of
// re-populating the local store the wipe just cleared with the previous account's
// data.
//
// Its own module, with no imports, so a writer outside lib/sync.ts can read it
// without pulling the sync graph and the Supabase client in with it (CUL-1968:
// the capture-inbox ingest). lib/sync.ts re-exports both functions; there is one
// counter.
let signOutEpoch = 0;

/** Called by `wipeLocalSession` before its first await. */
export function notifySignedOut(): void {
  signOutEpoch++;
}

/** The epoch a writer captures at pass start and re-checks before each write. */
export function currentSignOutEpoch(): number {
  return signOutEpoch;
}
