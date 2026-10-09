/**
 * Capture changes (FAB PR-29, CUL-1656; migration 091): the day each pet's capture
 * surface first offered a change, so the vet report can disclose it beside the counts
 * the change affects (CUL-1655, PM ruling D6).
 *
 * The keys mirror 091's CHECK on `capture_changes.change_key`, pinned by
 * captureChanges.test.ts, so a writer can never queue a row the server refuses with a
 * terminal 23514. A new change adds its key here AND in a migration, in that PR.
 */
export const CAPTURE_CHANGE_KEYS = [
  // The fan's stool pill split into Normal and Loose (PR-29b).
  'fab_stool_split',
] as const;

export type CaptureChangeKey = (typeof CAPTURE_CHANGE_KEYS)[number];
