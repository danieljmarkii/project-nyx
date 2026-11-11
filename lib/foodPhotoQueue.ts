import { persistCapture } from './storage';
import type { FoodPhotoSlot } from './captureUploads';

// CUL-2704: queue a food capture's photo whose upload failed, so it uploads on its own
// once there is a connection (lib/sync.ts syncPendingFoodPhotos). The food twin of
// lib/medicationLabelQueue.ts, and kept apart from lib/captureUploads.ts for the same
// reason that one is: this module WRITES, and the pure slot helpers sync.ts needs must
// not pull a writer into Home's import closure (guards/homeWrites.test.ts).
//
// Called from the capture's SAVE, never from the failed upload itself: a capture the
// owner abandons queues nothing, so no photo of a food nobody kept sits on the phone or
// reaches Storage.

/** One queued row per food and slot: a second save of the same capture (a retry after
 *  a failed commit, or a retake) replaces it rather than queueing the slot twice. */
export function foodPhotoQueueId(foodItemId: string, slot: FoodPhotoSlot): string {
  return `${foodItemId}-${slot}`;
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
