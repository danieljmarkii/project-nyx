import { Directory, File, Paths } from 'expo-file-system';

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

// expo-print's own output folder: `Print.printToFileAsync` writes <Caches>/Print/<uuid>.pdf
// (ExpoPrintToFile.swift), and nothing else writes there. The vet report's print temp
// lives in it between print and share. shareReportPdf deletes it once the share sheet
// closes, but a process that dies with the sheet open never reaches that `finally`, and
// the file is the whole clinical record (CUL-1045, rls-privacy-reviewer).
export const PRINT_DIR = 'Print';

// The picker libraries' own cache folders, each written by exactly one library:
// expo-image-picker (`ImagePicker/`: every photo picked or taken, vomit and stool photos
// included), expo-image-manipulator (`ImageManipulator/`: the compressed copy of each),
// and expo-document-picker (`DocumentPicker/`: each vet PDF picked, `copyToCacheDirectory`).
// `persistCapture` COPIES out of them and never removes the source, so the originals of
// every health photo and document outlived sign-out and account deletion (the CUL-1045
// class, one folder over; rls-privacy-reviewer). The wipe runs only at sign-out, so the
// whole folder goes. The one reader left at that moment is a row whose `local_uri` fell
// back to the picker's own path when `persistCapture` could not copy it, and the same
// wipe deletes that row.
export const PICKER_CACHE_DIRS = ['ImagePicker', 'ImageManipulator', 'DocumentPicker'] as const;

// Builds before CUL-1045 wrote the clinic-named report copy into the cache ROOT, which
// no wipe reached, so those files outlive the fix on every device that shared a report
// before it. The wipe sweeps the root for exactly that name shape
// (lib/pdf.ts reportPdfFilename) and nothing else.
const LEGACY_ROOT_REPORT = /-vet-report(-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2})?\.pdf$/;

// Delete the transient directory and everything in it, expo-print's folder, the picker
// caches, and the report copies earlier builds left in the cache root.
//
// Whole-directory rather than per-file on purpose: the defining property of these
// files is that they are unenumerable from the database, so the only cleanup that
// can promise anything is "everything here goes." Each step stands alone, so one
// failure never skips the rest, and NOTHING here throws: the caller runs this before
// the row deletes, so a throw would skip every one of them (rls-privacy-reviewer).
// That is why each handle is built inside its own `try`, never in a loop's head.
export function clearTransientFiles(): void {
  for (const name of [TRANSIENT_DIR, PRINT_DIR, ...PICKER_CACHE_DIRS]) {
    try {
      const dir = new Directory(Paths.cache, name);
      if (dir.exists) dir.delete();
    } catch (e) {
      console.warn(`[storage] ${name} cleanup skipped:`, e);
    }
  }
  let rootEntries: (File | Directory)[] = [];
  try {
    rootEntries = new Directory(Paths.cache).list();
  } catch (e) {
    console.warn('[storage] legacy report cleanup skipped:', e);
  }
  for (const entry of rootEntries) {
    try {
      if (entry instanceof File && LEGACY_ROOT_REPORT.test(entry.name)) entry.delete();
    } catch (e) {
      console.warn('[storage] a legacy report copy could not be removed:', e);
    }
  }
}
