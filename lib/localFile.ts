import { File } from 'expo-file-system';

// A captured photo's `local_uri` points into the OS cache directory (where
// expo-image-picker drops its output) and is never copied to persistent
// storage. iOS reclaims that directory under storage pressure, leaving a stale
// path whose file no longer exists — which renders an <Image> blank. Every
// surface that prefers the on-device file asks this first and treats a missing
// file as a hydrated row (no local file), so rendering falls back to the signed
// Storage URL, which is always uploaded. Shared by the record screen's hero and
// the Signal screen's episode tiles (CUL-1269), which answer the same question.
export function localFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    // Not a managed path (e.g. content:// URI) — assume unavailable and let the
    // signed-URL fallback take over.
    return false;
  }
}
