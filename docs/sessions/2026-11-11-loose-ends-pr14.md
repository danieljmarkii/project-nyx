# Loose ends PR-14: shaping the offline label photo

**Date:** 2026-11-11
**One thing:** none — dispatched session, not this round's teach row
**Mode:** DISCOVERY (shaping brief), then BUILD on the PM's `go 1`, [CUL-1920](https://linear.app/projectnyx/issue/CUL-1920)

## What the code says

- `app/medication-capture.tsx` `runUploadAndExtract` uploads the label once. Offline it throws, the screen moves to the edit step, and since CUL-2170 the commit records no `photo_path`. The photo stays only in the picker's cache directory and nothing retries it.
- The only entry is `app/log.tsx`'s add-new (`fromLog=1`), so a dose is always logged and the drug row reaches the server through `presyncMedicationItems` (ignoreDuplicates, no `photo_paths`).
- Storage is scoped by the `{uid}/` prefix (migrations 021, 117); account deletion purges the whole `{uid}/` folder. No server change is needed.
- Event and vet attachments already queue objects (local row with `local_uri`, object first, row second, `sync_attempts` quarantine), and the sign-out wipe deletes the files of any table with a `local_uri` column.

## The brief

Posted on CUL-1920. Recommended: a local `medication_label_uploads` queue (Option 1), with "Read it now" split to its own row once mocked, and food capture's identical gap kept as its own class issue ([CUL-2704](https://linear.app/projectnyx/issue/CUL-2704), filed this session, `Live harm`). Forecast: 1 row.

## The build (PM: `go 1`)

- A label whose upload failed is queued at save in a local `medication_label_uploads` table (copied into app storage, wiped at sign-out with its file), never at the failed upload, so an abandoned capture leaves nothing behind.
- `syncPendingMedicationLabels` (lib/sync.ts) runs in every sync cycle (reconnect, foreground): object first, then `photo_paths`, then the cache, then the mark. Offline costs nothing; a permanent failure quarantines.
- Two privacy passes. The first found that a queued older label could overwrite a label the owner replaced on the detail screen (same storage key). The second found the read-then-upload window still open. Closed for good by giving each queued label its own key and applying the update only to an empty slot. Also from the passes: re-encode or fail (no EXIF-bearing original), and a sign-out epoch check before every write.
- Filed [CUL-2708](https://linear.app/projectnyx/issue/CUL-2708) (the event and vet re-upload drains send the original when re-encoding fails). Added instances to CUL-1477 and CUL-1476.
- Correction to the brief: the app does read connectivity (`useIsOnline`). The band promises the upload either way, which is true in both cases.

## Outcome

Shipped via #1506.
