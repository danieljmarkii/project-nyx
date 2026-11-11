# Loose ends PR-14: shaping the offline label photo

**Date:** 2026-11-11
**Mode:** DISCOVERY (shaping brief), [CUL-1920](https://linear.app/projectnyx/issue/CUL-1920)

## What the code says

- `app/medication-capture.tsx` `runUploadAndExtract` uploads the label once. Offline it throws, the screen moves to the edit step, and since CUL-2170 the commit records no `photo_path`. The photo stays only in the picker's cache directory and nothing retries it.
- The only entry is `app/log.tsx`'s add-new (`fromLog=1`), so a dose is always logged and the drug row reaches the server through `presyncMedicationItems` (ignoreDuplicates, no `photo_paths`).
- Storage is scoped by the `{uid}/` prefix (migrations 021, 117); account deletion purges the whole `{uid}/` folder. No server change is needed.
- Event and vet attachments already queue objects (local row with `local_uri`, object first, row second, `sync_attempts` quarantine), and the sign-out wipe deletes the files of any table with a `local_uri` column.

## The brief

Posted on CUL-1920. Recommended: a local `medication_label_uploads` queue (Option 1), with "Read it now" split to its own row once mocked, and food capture's identical gap kept as its own class issue ([CUL-2704](https://linear.app/projectnyx/issue/CUL-2704), filed this session, `Live harm`). Forecast: 1 row.

## Outcome

Waiting on the PM's go.
