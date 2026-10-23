// The event editor's photo state, kept pure so the two cases that disagreed are
// pinned by a test (CUL-2176).
//
// The editor used to treat a hydrated attachment row (an empty `local_uri`, the
// FR-10 sentinel `hydrateEventAttachments` writes in lib/sync.ts) as no photo at
// all: it drew "Attach a photo" while the record screen showed the photo, and Save
// with a new one then swept the hidden row off the server through
// `detachOtherEventAttachments`. A health photo the owner cannot retake, deleted
// without being shown. Two rules close it:
//
//   · any attachment row is a photo, whatever its `local_uri` says. The on-device
//     file is the thumbnail when it exists; otherwise a signed Storage URL is,
//     and while that resolves (or offline) the row still reads as attached.
//   · Save removes only rows present when the editor opened, and the Replace sheet
//     names how many go. A row that reached this device after the editor opened is
//     kept: two rows on one record is untidy, a lost photo is not recoverable. The
//     editor draws the newest row only, so an older duplicate (B-105) is counted in
//     the sheet rather than drawn.

export interface EditorAttachmentRow {
  id: string;
  local_uri: string;
  storage_path: string;
}

export type EditorPhotoState =
  // The attachment read has not answered yet. The row is inert, so a fast tap can
  // never replace a photo the editor has not drawn.
  | { kind: 'loading' }
  // The read failed, so the editor cannot know what is attached. No control: an
  // Attach here could stack on, or a Replace sweep, a photo it never saw.
  | { kind: 'unknown' }
  | { kind: 'none' }
  // `thumbUri` is null while a signed URL resolves or when it cannot (offline).
  // `replacing` is true when Save would supersede a photo already on the record.
  | { kind: 'attached'; thumbUri: string | null; replacing: boolean };

export interface EditorPhotoInput {
  loaded: boolean;
  // The attachment read threw.
  failed?: boolean;
  // The row the editor shows (newest first), or null when the record has none.
  existing: EditorAttachmentRow | null;
  // Does the existing row's on-device file exist? Asked by the caller
  // (`localFileExists`) so this stays pure.
  localFileUsable: boolean;
  // The signed URL for the existing row's Storage object, once resolved.
  remoteUrl: string | null;
  // A photo the owner picked in this edit, not yet saved.
  newUri: string | null;
}

export function resolveEditorPhoto(input: EditorPhotoInput): EditorPhotoState {
  const { loaded, failed, existing, localFileUsable, remoteUrl, newUri } = input;
  if (failed) return { kind: 'unknown' };
  if (!loaded) return { kind: 'loading' };
  if (newUri) return { kind: 'attached', thumbUri: newUri, replacing: existing != null };
  if (!existing) return { kind: 'none' };
  return { kind: 'attached', thumbUri: existingLocalUri(existing, localFileUsable) ?? remoteUrl, replacing: false };
}

// The on-device file for a row, or null when there is none to draw: the hydrated
// sentinel ('') and a path whose file the OS reclaimed both route to the signed URL.
export function existingLocalUri(row: EditorAttachmentRow, localFileUsable: boolean): string | null {
  return row.local_uri.length > 0 && localFileUsable ? row.local_uri : null;
}

// Does this row need a signed URL to be drawn?
export function needsSignedUrl(row: EditorAttachmentRow, localFileUsable: boolean): boolean {
  return existingLocalUri(row, localFileUsable) == null && row.storage_path.length > 0;
}

// The rows Save may remove: those present when the editor opened (the count the
// Replace sheet names), never the new row itself. The B-105 duplicate sweep still
// runs over every one of them.
export function priorsToDetach<T extends { id: string }>(
  priors: T[],
  shownIds: ReadonlySet<string>,
  keepId: string,
): T[] {
  return priors.filter((p) => p.id !== keepId && shownIds.has(p.id));
}

// The source picker's copy. Replacing names what goes, and how many, before the
// owner picks: `replacedCount` is every row Save would remove.
export function photoPickerCopy(replacedCount: number): { title: string; message: string } {
  if (replacedCount <= 0) return { title: 'Attach photo', message: 'Choose a source' };
  return {
    title: 'Replace photo',
    message: replacedCount === 1
      ? 'This replaces the photo on this record.'
      : `This replaces the ${replacedCount} photos on this record.`,
  };
}

// The photo row when the attachment read failed: the cause and the way back.
export const EDITOR_PHOTO_UNKNOWN_LABEL = "Couldn't check for a photo. Close and reopen to try again.";

// The viewer's slot when the photo cannot be drawn here: the cause, not "unavailable".
export const EDITOR_PHOTO_OFFLINE_LABEL = 'This photo needs a connection to show here.';
