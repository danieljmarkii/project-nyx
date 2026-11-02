import { Directory, File } from 'expo-file-system';
import { transientDirectory } from './transientFiles';

// The exam room's offline copy (CUL-2299, spec §10.6: "The offline copy is registered in the
// sign-out wipe set").
//
// WHY A FILE, AND WHY HERE. The room must open with no network, in a clinic basement, so the
// report it shows is on the device: the phone layout and the printed one, exactly as the
// preview held them. Neither fits in a route param, so they are staged as two files.
//
// A TRUST & SAFETY REQUIREMENT, not bookkeeping: each file is the whole clinical record of a
// named household's animal. They live in the TRANSIENT directory (lib/transientFiles.ts),
// which `clearTransientFiles` deletes wholesale on every sign-out and account deletion
// (`clearLocalData`), so the copy joins the wipe set by where it is written, with no list to
// remember. No row names these files; that is exactly the class the transient directory exists
// for. The room also deletes its copy when it closes, and every open overwrites the last one,
// so at most one copy is ever on the phone. `examRoomCopy.test.ts` pins all three.

export const EXAM_COPY_DIR = 'exam-room';
const PHONE_FILE = 'phone.html';
const PRINT_FILE = 'print.html';

export interface ExamCopy {
  phoneHtml: string;
  printHtml: string | null;
}

/** Inside the transient directory, always: the sign-out wipe deletes that directory whole. */
export function examCopyDirectory(): Directory {
  return new Directory(transientDirectory(), EXAM_COPY_DIR);
}

/** Delete the copy. Never throws: it runs on close and before every stage. */
export function clearExamCopy(): void {
  try {
    const dir = examCopyDirectory();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('[exam-room] the copy could not be removed:', e);
  }
}

/**
 * Stage the report for the room. False when it could not be written (a full disk), and then
 * nothing is left behind: a half-written pair would open the room on the wrong printed page.
 */
export function stageExamCopy(copy: ExamCopy): boolean {
  clearExamCopy();
  try {
    const dir = examCopyDirectory();
    dir.create({ intermediates: true, idempotent: true });
    new File(dir, PHONE_FILE).writeSync(copy.phoneHtml);
    if (copy.printHtml !== null) new File(dir, PRINT_FILE).writeSync(copy.printHtml);
    return true;
  } catch (e) {
    console.warn('[exam-room] the copy could not be staged:', e);
    clearExamCopy();
    return false;
  }
}

/** The staged copy, or null when there is none (signed out since, or never staged). */
export function readExamCopy(): ExamCopy | null {
  try {
    const dir = examCopyDirectory();
    const phone = new File(dir, PHONE_FILE);
    if (!phone.exists) return null;
    const print = new File(dir, PRINT_FILE);
    return { phoneHtml: phone.textSync(), printHtml: print.exists ? print.textSync() : null };
  } catch (e) {
    console.warn('[exam-room] the copy could not be read:', e);
    return null;
  }
}

export const EXAM_ROOM_ROUTE = '/exam-room' as const;

/**
 * Open the room over the current screen: stage the copy, then push. The entry point (the send
 * sheet's "Show on this phone", CUL-2411) dismisses its sheet first (C-14). False when the copy
 * could not be staged; the caller then says so rather than opening an empty room.
 */
export function openExamRoom(copy: ExamCopy, push: (route: typeof EXAM_ROOM_ROUTE) => void): boolean {
  if (!stageExamCopy(copy)) return false;
  push(EXAM_ROOM_ROUTE);
  return true;
}
