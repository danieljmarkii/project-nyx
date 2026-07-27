import { File, Directory, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

// Compress a captured image before upload. Resolved May 2026 (PM):
// client-only compression to bound storage cost and keep the upload
// path single-source. Longest edge ≤1600px, JPEG q75 — sufficient for
// Claude vision extraction while cutting storage ~5–10×.
export const MAX_EDGE_PX = 1600;

export async function compressForUpload(
  localUri: string,
  sourceWidth?: number,
  sourceHeight?: number,
): Promise<string> {
  const saveOptions = { compress: 0.75, format: SaveFormat.JPEG };

  // Resize so the longest edge is ≤MAX_EDGE_PX. expo-image-manipulator's
  // `resize` preserves aspect when one dimension is omitted, so the constrained
  // edge has to be the LONGER one — pinning width on a portrait photo leaves its
  // height (the true longest edge) uncapped at ~2133px for a 3:4.
  if (sourceWidth && sourceHeight) {
    const resize = sourceHeight > sourceWidth ? { height: MAX_EDGE_PX } : { width: MAX_EDGE_PX };
    const result = await manipulateAsync(localUri, [{ resize }], saveOptions);
    return result.uri;
  }

  // B-206 — the re-upload paths (lib/sync.ts, lib/vetDocuments.ts, the pet
  // photo) have no width/height column to source dimensions from, so orientation
  // is unknown up front. Constrain width first, then read the result's OWN
  // dimensions — manipulateAsync reports them post-EXIF-orientation-normalisation,
  // which is the number the contract is about. If the source was portrait the
  // height is still over the cap, so redo the resize on the height edge from the
  // ORIGINAL: re-resizing the already-downscaled copy would stack a second lossy
  // JPEG encode on top of the first. Landscape and square sources (the common
  // case) never reach the second pass, so this costs nothing on that path.
  const widthPass = await manipulateAsync(localUri, [{ resize: { width: MAX_EDGE_PX } }], saveOptions);
  if (widthPass.height <= MAX_EDGE_PX) return widthPass.uri;
  const heightPass = await manipulateAsync(localUri, [{ resize: { height: MAX_EDGE_PX } }], saveOptions);
  return heightPass.uri;
}


// ── nyx-medication-photos (B-117 PR 4 / B-124) ──────────────────────────────
// Drug-label photos live in their OWN private bucket with PER-USER-PREFIX RLS
// (migration 021), NOT the food/event/vet "any authenticated user reads the whole
// bucket" model — a prescription label carries owner/pet/clinic PII, so the
// storage layer itself scopes every read/write to the uploader.
//
// The leading `${userId}/` segment is the SECURITY boundary: the RLS predicate is
// `(storage.foldername(name))[1] = auth.uid()::text`, so a path without that exact
// prefix is silently rejected (upload 42501 / read 400). Centralising it in this
// one helper is the point — PR 5's capture screen calls this and cannot construct
// a non-compliant path. `userId` is `supabase.auth` user.id; `medicationItemId`
// is the medication_items uuid the photo belongs to.
export const MEDICATION_PHOTOS_BUCKET = 'nyx-medication-photos';

export function buildMedicationPhotoPath(
  userId: string,
  medicationItemId: string,
  // Slot label within the item, e.g. '0-label' / '1-back'. Mirrors the food
  // bucket's `${slotIndex}-${slot}` convention. `.jpg` is appended because every
  // upload goes through compressForUpload, which always emits JPEG.
  slot: string = '0-label',
): string {
  // Fail fast on a missing prefix segment: an empty userId would yield a leading
  // '/' and an empty first foldername, which RLS rejects — and a silent
  // RLS-rejected upload is exactly the class of bug this helper exists to prevent.
  if (!userId?.trim()) throw new Error('buildMedicationPhotoPath: userId is required (RLS prefix)');
  if (!medicationItemId?.trim()) throw new Error('buildMedicationPhotoPath: medicationItemId is required');
  // This helper is the single chokepoint for the bucket's path convention, so it
  // rejects any segment that could break out of its slot: a '/' injects an extra
  // path segment (which could shift what foldername[1] returns), and '..' is
  // traversal. The ids are server-generated UUIDs today — RLS still pins a hostile
  // key to its first segment — but guarding here keeps a future user-typed `slot`
  // from ever producing a surprising key. (rls-privacy-reviewer, PR 4.)
  for (const seg of [userId, medicationItemId, slot]) {
    if (seg.includes('/') || seg.includes('\\') || seg.includes('..')) {
      throw new Error(`buildMedicationPhotoPath: illegal path segment ${JSON.stringify(seg)}`);
    }
  }
  return `${userId}/${medicationItemId}/${slot}.jpg`;
}


// Captured photos arrive (from expo-image-picker / expo-image-manipulator) as
// files in the OS *cache* directory, which the system reclaims under storage
// pressure — and on app offload / OS update. A `local_uri` stored from there
// goes stale: the SQLite row survives but the file is gone, blanking the
// on-device hero and forcing a signed-URL network round-trip (with a valid
// session) just to show the device's own photo — or showing nothing at all when
// offline. Copy the capture into the app's *document* directory (a stable,
// app-owned location the system never reclaims) at attach time and persist THAT
// path instead. (B-104.) These files are cleaned up by local_uri in the
// sign-out wipe (lib/db.ts clearLocalData) and on per-photo remove
// (deleteEventAttachmentLocal).
const ATTACHMENT_DIR = 'attachments';

// Copy a freshly-captured photo off the OS cache directory into persistent,
// app-owned storage. Returns the new document-directory URI on success, or the
// original `sourceUri` unchanged if the copy fails — persistence is best-effort
// and must never block attaching a photo (on failure the photo still uploads and
// renders this session; it just isn't durable against a cache eviction).
// `fileName` must be globally unique (callers pass the attachment uuid) so files
// never collide across events/pets.
export function persistCapture(sourceUri: string, fileName: string): string {
  // expo-image-picker / expo-image-manipulator return a file:// path on both
  // platforms, but guard explicitly: copying a non-file source (e.g. an Android
  // content:// URI) can silently produce a 0-byte file — which would store a
  // document-dir path to an empty image and blank the hero. For anything but
  // file://, skip persistence and return the source unchanged (the safe
  // status-quo path; the file still uploads + renders this session).
  if (!sourceUri.startsWith('file://')) return sourceUri;
  try {
    const dir = new Directory(Paths.document, ATTACHMENT_DIR);
    // idempotent so the second-and-later captures don't throw on the existing
    // directory; intermediates is belt-and-suspenders (document/ always exists).
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, fileName);
    // copy() throws if the destination already exists — clear a stale file from
    // a prior failed attempt at the same uuid (vanishingly rare, but cheap).
    if (dest.exists) dest.delete();
    new File(sourceUri).copy(dest);
    return dest.uri;
  } catch (e) {
    console.warn('[storage] persistCapture failed, using source uri:', e);
    return sourceUri;
  }
}


// Bring a REMOTE object onto this device durably — §8 AC 12's other half.
//
// persistCapture above copies a file the device just produced; this one fetches a
// file the device has only ever seen through a signed URL, and then hands it to
// persistCapture so exactly one function writes into the attachments directory.
// That matters beyond tidiness: sign-out's file wipe (clearLocalData) walks the
// local_uri columns of the tables that live in that directory, so anything cached
// here is already covered by it rather than needing a second wipe path.
//
// Two rules, both learned upstream:
//   • the download lands in the OS CACHE first, and only a completed, non-empty
//     file is promoted. A torn download promoted straight into the document
//     directory would be a permanently broken "cached" record that nothing
//     re-fetches, which is worse than not caching at all.
//   • it NEVER throws and never rethrows. Caching is a side effect of viewing a
//     document; a failure here must cost the owner nothing, so it returns null and
//     the caller keeps rendering from the signed URL it already has.
export async function persistRemoteObject(url: string, fileName: string): Promise<string | null> {
  let tmp: File | null = null;
  try {
    tmp = new File(Paths.cache, `remote-${fileName}`);
    if (tmp.exists) tmp.delete();
    // idempotent: the API rejects with DestinationAlreadyExists otherwise, and the
    // delete above can lose a race with a concurrent open of the same page.
    const downloaded = await File.downloadFileAsync(url, tmp, { idempotent: true });
    // A 0-byte result is the RN-fetch failure mode this codebase has already been
    // bitten by (see uploadPhoto). Treat it as no download at all.
    if (!downloaded.exists || !downloaded.size) return null;
    const durable = persistCapture(downloaded.uri, fileName);
    // persistCapture returns its SOURCE unchanged when the copy fails. A cache
    // path is by definition not durable, so that outcome is "not cached".
    if (durable === downloaded.uri) return null;
    return durable;
  } catch (e) {
    console.warn('[storage] persistRemoteObject failed:', e);
    return null;
  } finally {
    // The cache copy has served its purpose either way; the OS would reclaim it
    // eventually, but leaving a second copy of a clinical record on disk for no
    // reason is not a thing to shrug at.
    try {
      if (tmp?.exists) tmp.delete();
    } catch {
      // Already gone / not deletable — nothing to clean up.
    }
  }
}

// Give a file a human name for the share sheet.
//
// `Sharing.shareAsync` shares the file AT ITS PATH, so the recipient sees whatever
// the basename is — and this app's storage keys are UUIDs, so a vet who is handed a
// lab result receives "a3f9c1e2-….jpg" and files it under nothing. Copying to a
// cache file with a real name is the same trick shareReportPdf already plays for
// the vet report, extracted here on its second caller.
//
// Best-effort by the same rule as persistCapture: on any failure it returns the
// original URI, so a copy problem can slow the vet down but can never block the
// share itself.
export function stageForShare(localUri: string, fileName: string): string {
  try {
    const dest = new File(Paths.cache, fileName);
    if (dest.exists) dest.delete();
    new File(localUri).copy(dest);
    return dest.uri;
  } catch (e) {
    console.warn('[storage] stageForShare failed, sharing the raw file:', e);
    return localUri;
  }
}

// Upload a local file URI (file:// or content://) to Supabase Storage.
//
// In React Native, `fetch(localUri).blob()` returns a 0-byte blob —
// supabase-js then "successfully" uploads an empty object, which the
// extract-food-from-photo Edge Function later rejects as
// `image cannot be empty`. We read the file as a Uint8Array via
// expo-file-system instead, which streams the bytes correctly.
export async function uploadPhoto(
  bucket: string,
  storagePath: string,
  localUri: string,
  mimeType: string = 'image/jpeg',
): Promise<void> {
  const bytes = await new File(localUri).bytes();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });

  if (error) throw error;
}

export function getPublicUrl(bucket: string, storagePath: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

// For private buckets (RLS-gated reads), getPublicUrl returns a URL that
// 400s for unauthenticated GETs. Use signed URLs instead — the token is
// embedded in the URL so Image components don't need auth headers.
// Optional imgproxy transform (Pro Image Transformation add-on). When passed,
// Storage serves a resized image at the signed URL — used to fetch a screen-sized
// photo instead of a multi-MB original. If the add-on is unavailable the signed
// URL may fail to load, so callers should keep a non-transformed URL as a fallback.
export interface SignedUrlTransform {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain' | 'fill';
  quality?: number;
}

export async function getSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSec: number = 60 * 60,
  transform?: SignedUrlTransform,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSec, transform ? { transform } : undefined);
  if (error || !data) {
    console.warn('[storage] signed URL failed:', bucket, storagePath, error?.message);
    return null;
  }
  return data.signedUrl;
}

// Batch-sign many storage paths in ONE request — the right primitive for a LIST
// surface (the Foods-tab thumbnails, B-004 PR 6). Signing each path with its own
// getSignedUrl would fire N network round-trips per focus — the many-request
// churn the May-2026 picker-grid-thumbnail note retired thumbnails over. Returns
// a path→signedUrl Map containing only the paths that signed cleanly; a path that
// errors (deleted object, RLS) is simply omitted, so the caller renders its
// placeholder rather than a torn image. Never throws and never returns null —
// thumbnails are a progressive enhancement over the always-present text rows, so
// a signing failure (offline, expired session) degrades to placeholders, never
// blanks the list. Empty input resolves to an empty Map with no network call.
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresInSec: number = 60 * 60,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, expiresInSec);
    if (error || !data) {
      console.warn('[storage] batch signed URLs failed:', bucket, error?.message);
      return out;
    }
    for (const row of data) {
      // createSignedUrls returns a per-path { path, signedUrl, error } row; keep
      // only the ones that signed (path present, no per-row error, url non-empty).
      if (row.path && !row.error && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch (e) {
    console.warn('[storage] batch signed URLs threw:', bucket, e);
  }
  return out;
}
