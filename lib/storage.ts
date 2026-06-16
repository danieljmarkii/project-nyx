import { File, Directory, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

// Compress a captured image before upload. Resolved May 2026 (PM):
// client-only compression to bound storage cost and keep the upload
// path single-source. Longest edge ≤1600px, JPEG q75 — sufficient for
// Claude vision extraction while cutting storage ~5–10×.
const MAX_EDGE_PX = 1600;

export async function compressForUpload(
  localUri: string,
  sourceWidth?: number,
  sourceHeight?: number,
): Promise<string> {
  // Resize so the longest edge is ≤MAX_EDGE_PX. expo-image-manipulator's
  // `resize` preserves aspect when one dimension is omitted; we pick the
  // larger edge so portrait photos don't end up taller than 1600px.
  const isPortrait = sourceWidth && sourceHeight && sourceHeight > sourceWidth;
  const resize = isPortrait ? { height: MAX_EDGE_PX } : { width: MAX_EDGE_PX };
  const result = await manipulateAsync(
    localUri,
    [{ resize }],
    { compress: 0.75, format: SaveFormat.JPEG },
  );
  return result.uri;
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
export async function getSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSec: number = 60 * 60,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSec);
  if (error || !data) {
    console.warn('[storage] signed URL failed:', bucket, storagePath, error?.message);
    return null;
  }
  return data.signedUrl;
}
