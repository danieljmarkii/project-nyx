import { Directory, Paths } from 'expo-file-system';

// The one cache directory for files this app writes that NO database row names.
//
// Its own module, deliberately, and it is the smallest one in `lib/`: the sign-out
// wipe (lib/db.ts) needs to clear it, and lib/storage.ts needs to write into it —
// but storage.ts imports lib/supabase.ts, which fails fast on missing env by design.
// Importing storage from db to reach this function drags the Supabase client into
// every consumer of the database layer, including the unit tests that have no env.
// One dependency-free module keeps the wipe honest without that.
//
// **Why a directory exists at all.** The sign-out file wipe is ROW-DRIVEN — it walks
// the `local_uri` columns of the tables that own captured files. Two writers produce
// files no row can name:
//
//   • `stageForShare` — a named copy ("Pixel-lab-result-2026-07-14.pdf") made so the
//     vet receives a filable artifact instead of a UUID. Being named after the pet
//     and the document is the entire point, and is also what makes it the worst
//     thing to leave behind.
//   • `persistRemoteObject` — the download temp, deleted in its own `finally` on
//     every normal path, but not if the process dies between fetch and promote.
//
// Before this, both survived sign-out AND account deletion, indefinitely (B-478
// VF-6, found by rls-privacy-reviewer — the same shape as B-519 one level up).
export const TRANSIENT_DIR = 'transient';

export function transientDirectory(): Directory {
  return new Directory(Paths.cache, TRANSIENT_DIR);
}

// Delete the directory and everything in it.
//
// Whole-directory rather than per-file on purpose: the defining property of these
// files is that they are unenumerable from the database, so the only cleanup that
// can promise anything is "everything here goes."
export function clearTransientFiles(): void {
  try {
    const dir = transientDirectory();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('[storage] transient file cleanup skipped:', e);
  }
}
