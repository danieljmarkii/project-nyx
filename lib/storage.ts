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


// Upload a local file URI (file:// or content://) to Supabase Storage.
// Uses fetch→blob, which React Native supports natively for local URIs.
export async function uploadPhoto(
  bucket: string,
  storagePath: string,
  localUri: string,
  mimeType: string = 'image/jpeg',
): Promise<void> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, blob, { contentType: mimeType, upsert: true });

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
