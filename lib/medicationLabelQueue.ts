import { persistCapture } from './storage';

// CUL-1920: queue a medicine label photo whose upload failed at capture, so it
// uploads on its own once there is a connection (lib/sync.ts
// syncPendingMedicationLabels, run by every sync cycle, which the app starts on
// reconnect and on foreground).
//
// Called from the capture's SAVE, never from the failed upload itself: a capture the
// owner abandons queues nothing, so no photo of a label nobody kept sits on the phone
// or reaches Storage.
//
// The photo is first copied out of the picker's cache directory, which the OS may
// clear, into the app's own attachments directory. That copy is also what the
// sign-out wipe deletes: clearLocalData walks every `local_uri` column. If the copy
// fails, persistCapture hands back the cache path and the label still queues; it
// just may not survive a cache eviction (the same best-effort rule as event photos).

export interface QueuedLabel {
  medicationItemId: string;
  localUri: string;
  storagePath: string;
}

interface QueueDb {
  runAsync(sql: string, params: string[]): Promise<unknown>;
}

export const QUEUE_MEDICATION_LABEL_SQL = `INSERT OR REPLACE INTO medication_label_uploads
   (id, local_uri, storage_path, created_at, synced, sync_attempts, sync_error)
 VALUES (?, ?, ?, ?, 0, 0, NULL)`;

export async function queueMedicationLabelUpload(
  db: QueueDb,
  label: QueuedLabel,
  nowIso: string,
): Promise<void> {
  const durableUri = persistCapture(label.localUri, `${label.medicationItemId}-label.jpg`);
  await db.runAsync(QUEUE_MEDICATION_LABEL_SQL, [
    label.medicationItemId,
    durableUri,
    label.storagePath,
    nowIso,
  ]);
}
