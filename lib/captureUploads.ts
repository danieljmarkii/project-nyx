import { persistCapture } from './storage';

// CUL-2170: what a capture commit may record about its photos. A photo path is a
// claim that the object exists in Storage, so the commit lists only photos whose
// own upload resolved. Keyed by the photo's local URI, never its storage path:
// capture paths are fixed per slot (`{foodId}/0-front.jpg`, `…/0-label`), so a
// retake whose upload failed shares its path with the earlier photo that did
// upload, and a path key would record the retake against the old object.

export interface CaptureUploadPhoto {
  localUri: string;
  storagePath: string;
}

/** Storage paths of the photos whose upload finished, in the order given. */
export function uploadedPhotoPaths(
  photos: ReadonlyArray<CaptureUploadPhoto | null | undefined>,
  uploaded: ReadonlySet<string>,
): string[] {
  return photos
    .filter((p): p is CaptureUploadPhoto => !!p && uploaded.has(p.localUri))
    .map((p) => p.storagePath);
}

/** One photo's storage path if its upload finished, else null. */
export function uploadedPhotoPath(
  photo: CaptureUploadPhoto | null | undefined,
  uploaded: ReadonlySet<string>,
): string | null {
  return uploadedPhotoPaths([photo], uploaded)[0] ?? null;
}

// ── CUL-2704: the food capture's offline photo queue ─────────────────────────
//
// The food half of the class #1506 opened for the medicine label (lib/
// medicationLabelQueue.ts): a photo whose upload failed at capture is queued at SAVE,
// never from the failed upload itself, so a capture the owner abandons leaves no
// photo of a food nobody kept on the phone or in Storage. lib/sync.ts
// syncPendingFoodPhotos uploads each one on a later sync, then adds its path to
// food_items.photo_paths, through the same drain the label queue runs.

export type FoodPhotoSlot = 'front' | 'ingredients' | 'barcode';

export const FOOD_PHOTO_SLOT_INDEX: Record<FoodPhotoSlot, number> = {
  front: 0,
  ingredients: 1,
  barcode: 2,
};

/**
 * The storage key a QUEUED photo uploads to: its own key, never the slot's fixed
 * `{foodId}/0-front.jpg`. The food page's "replace" writes that fixed key, so a
 * queued upload landing on it mid-replace would put the older photo back over the
 * owner's choice (the rls-privacy-reviewer finding on CUL-1920). The key still ends
 * `-{slot}.jpg`, which is how the food page finds a slot's photo to replace.
 */
export function queuedFoodPhotoPath(foodId: string, slot: FoodPhotoSlot, token: string): string {
  return `${foodId}/${FOOD_PHOTO_SLOT_INDEX[slot]}-q${token}-${slot}.jpg`;
}

/** Whether a food's photo list already holds a photo for this slot. */
export function foodSlotFilled(held: readonly string[], slot: string): boolean {
  return held.some((p) => p.endsWith(`-${slot}.jpg`));
}

// The leading index of a food photo's file name (`{foodId}/0-front.jpg` → 0). A
// name with none sorts last, so an unexpected shape never jumps ahead of the front.
function slotIndexOf(path: string): number {
  const m = /\/(\d+)-[^/]*$/.exec(path);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * The photo list with `path` added, in slot order: the front stays first, because
 * every reader takes `photo_paths[0]` as the food's picture (refreshFoodCache, the
 * Foods tab). The sort is stable, so photos sharing an index keep their order.
 */
export function foodPathsWith(held: readonly string[], path: string): string[] {
  return [...held, path]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => slotIndexOf(a.p) - slotIndexOf(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

export interface QueuedFoodPhoto {
  id: string;
  foodItemId: string;
  slot: FoodPhotoSlot;
  ownerUserId: string;
  localUri: string;
  storagePath: string;
}

interface QueueDb {
  runAsync(sql: string, params: string[]): Promise<unknown>;
}

export const QUEUE_FOOD_PHOTO_SQL = `INSERT OR REPLACE INTO food_photo_uploads
   (id, food_item_id, slot, owner_user_id, local_uri, storage_path, created_at,
    synced, sync_attempts, sync_error)
 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)`;

/**
 * Queue one photo. The file is first copied out of the picker's cache directory,
 * which the OS may clear, into the app's attachments directory; that copy is also
 * what the sign-out wipe deletes. A failed copy hands back the cache path and the
 * photo still queues (the event photos' best-effort rule).
 */
export async function queueFoodPhotoUpload(
  db: QueueDb,
  photo: QueuedFoodPhoto,
  nowIso: string,
): Promise<void> {
  const durableUri = persistCapture(photo.localUri, `food-${photo.id}.jpg`);
  await db.runAsync(QUEUE_FOOD_PHOTO_SQL, [
    photo.id,
    photo.foodItemId,
    photo.slot,
    photo.ownerUserId,
    durableUri,
    photo.storagePath,
    nowIso,
  ]);
}
