import { supabase } from './supabase';

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
