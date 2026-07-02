// Pure derivation for the event-detail hero + full-screen viewer: which photo URI
// to render, and whether to show the "add a photo" empty state. Extracted from
// app/event/[id].tsx so the transform→raw fallback logic (B-200) is unit-testable
// without mounting the screen — this is exactly the class of bug a screen test
// wouldn't cheaply catch: a stale fallback URL surviving a photo removal, or a
// live "Add photo" target flashing over an existing photo mid-fallback.

export interface EventPhotoInput {
  // On-device file (preferred — no network). null when absent or cache-evicted.
  localUri: string | null;
  // Screen-sized transform URL (imgproxy). null while resolving or if signing failed.
  remoteUrl: string | null;
  // Raw original URL — the fallback when the transform can't load. null while resolving.
  remoteUrlFull: string | null;
  // The transform URL errored at fetch time (add-on unavailable) → prefer the raw URL.
  transformFailed: boolean;
  // Meals' clinical artifact is the food name, not a photo — never beg for one.
  isMeal: boolean;
  // An attachment row exists (a photo is present, even if its URL is still resolving).
  hasAttachment: boolean;
}

export interface EventPhotoDisplay {
  photoUri: string | null;
  showEmptyHero: boolean;
}

export function resolveEventPhotoDisplay(input: EventPhotoInput): EventPhotoDisplay {
  const { localUri, remoteUrl, remoteUrlFull, transformFailed, isMeal, hasAttachment } = input;
  // Prefer the transform; fall back to the raw URL if it failed to load or hasn't
  // resolved yet. The local file always wins (fastest, offline-safe).
  const remoteBest = !transformFailed && remoteUrl ? remoteUrl : remoteUrlFull;
  const photoUri = localUri ?? remoteBest;
  // Only offer the add-photo empty state when there is genuinely NO photo — never
  // when an attachment exists but its URL is still resolving / mid-fallback, which
  // would briefly render a live "Add photo" target over an existing photo (B-200).
  const showEmptyHero = !photoUri && !isMeal && !hasAttachment;
  return { photoUri, showEmptyHero };
}
