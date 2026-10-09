# Engines v3 PR-27j: a photo the retry queue lands later takes back a stored may_wait (migration 092)

**Date:** 2026-10-09
**One thing:** T4 L1 — The database checks who is asking, even inside a trigger: a cleanup that runs during account deletion runs as the deleting role · check: pending

Dispatched build of CUL-1682, shipped via #1128. Schema only. **092 is unapplied**: applying it takes the PM's typed `apply 092`, and a dispatched child neither applies nor merges a migration, so the PR is left for the PM.

The plan was posted on CUL-1682 and in session, and the PM typed "go". It chose the `event_attachments` trigger over three other options:
- **(a) the retry queue asks for the read:** needs `lib/sync.ts`, which #1126 holds, and fixes only the phone that drains.
- **(b) the detail screen re-reads on mount:** fixes only a phone that opens the detail screen, and is UI work, which can't ride a migration PR.
- **the reader-side check:** belongs to CUL-1629, the reader's own issue.

**What shipped.**
- One INVOKER function, `take_back_may_wait_on_photo_change()`, in 089's shape: pinned, EXECUTE revoked from clients, raises nothing, lower-only (TRUE → NULL).
- Two AFTER triggers on `event_attachments`:
  - one fires on INSERT or DELETE;
  - one fires on `UPDATE OF event_id, pet_id`, only when one of them actually moves. The client upserts with `onConflict: 'id'`, so a retry of a row that already landed is a same-value ON CONFLICT DO UPDATE, and it must lower nothing.
- What it lowers:
  - **self:** the touched event's own TRUE, whatever the event's type;
  - **neighbours:** when the touched event is a live vomit or stool, every TRUE of the same pet anchored within 72 h of it;
  - **fail-closed:** an unreadable event lowers every TRUE on the attachment's pet.
- `guards/mayWaitPhotoChange.test.ts` (new) pins:
  - both triggers;
  - the move trigger's column list, checked against the columns `readMayWaitRecord` reads off `event_attachments`;
  - the cascade gate's exact shape, and the lower-only write;
  - the window, checked against the reader's `near`;
  - the incident types, checked against `MAY_WAIT_INCIDENT_TYPES`;
  - the predicate lines the trigger answers.
- `lib/functionHardening.test.ts` registers the new function.

**What broke on the way (the adversarial pass, verdict BROKEN, then fixed).**
- **Account deletion.**
  - `auth.admin.deleteUser` deletes `auth.users` as `supabase_auth_admin`, and the cascade reaches `event_attachments`. A cascade's row triggers run as the role that ran the outer DELETE: `current_user=supabase_auth_admin`, re-measured on a scratch cluster.
  - That role holds no grant on `public`, so the first draft would have aborted every account deletion with a photo: `permission denied for schema public`. 092 is the first trigger on that cascade path that touches another `public` table.
  - **Fix:** on a DELETE only, a writer without UPDATE on `event_ai_analysis` and SELECT on `events` returns before the sweep. Privileges are read from `pg_catalog`, schema first, because naming a table in a schema you can't use raises. An insert or move by such a writer still raises, so the gate fails loud and never silently skips.
- **The window answered the wrong question (C-34).**
  - The first draft mirrored 090's ±144 h. That window answers "does a moved vomit change the floor re-run", and the floor reads no photo.
  - The photo question is "is it a neighbour". `readMayWaitRecord` reads photo sets only for its `near`: live incidents within 72 h. Now 72 h, inclusive, plus the soft-deleted filter.
- **The probe went green for the wrong reason, once.** The case meant to prove "an insert by a writer without grants raises" was being refused by RLS before the trigger ever ran. The mutant that moved the gate onto every operation survived until the case admitted the row through a policy and checked the error's text.

**Proof.**
- **Scratch Postgres 16 probe:** 38 cases.
  - 092 passes all 38.
  - The no-trigger stub fails the 15 lowering cases and K21, which needs a trigger to exist; every other keep case passes.
  - The ungated first draft fails the deletion-cascade case with `permission denied for schema public`.
- **Mutants:** all 17 behavioural mutants caught, gate and window included.
- **Guard:** reds without 092 (16 tests). All 5 gate and window guard mutants are caught. The one survivor, a dropped `REVOKE … FROM authenticated`, is the hardening replay's known gap, CUL-1678.
- **Fast checks:** tsc clean. 17 migration suites passed (653 tests) before the fix; after it, the three may-wait and hardening suites (103 tests) and typecheck pass. CI was green on the first push.

**Reviews.**
- `adversarial-reviewer`: BROKEN on the cascade, then fixed. The clinical logic held:
  - every client path (edit, detail, log, retry queue) runs upload → row → read, so the trigger fires first;
  - the replace path lowers on both writes;
  - the no-op retry upsert lowers nothing;
  - a lethargy or meal photo is ignored;
  - the CUL-882 cross-pet move lowers both sides;
  - the 075 freeze and 088 allow the sweep and do not chain;
  - a planted cross-account row under RLS stays contained.
- It also narrowed the read-in-flight blind spot: the pipeline's own post-write re-check re-reads the attachment ids. The header now says so.

**Found and filed:**
- CUL-1695: the read half. The photo still waits for a read: (b) now, (a) once #1126 frees `lib/sync.ts`.
- CUL-1699: `event_attachments` has no same-pet guard. A service-role write on a planted row could lower another account's TRUE.
- Commented on CUL-1629: the reader must require `read_photo_set_key` to equal the current set before it renders a TRUE.

**Residual.**
- The late photo still gets no read; the louder line stands until one runs (CUL-1695).
- The read-in-flight instant closes only at the reader (CUL-1629).
- Before applying, check whether `supabase_auth_admin` holds the grants (the query is in the PR). Either way the gate keeps account deletion working.

## Teach

**T4 — The database checks who is asking (L1)**

*In plain words.* Every request to the database runs as some role: a signed-in owner, the server, or the system account that deletes a whole account. Before each read or write, the database checks what that role may touch. A trigger is a small rule the database runs by itself when a row changes. It doesn't get its own identity: it runs as whoever made the change.

*Everyday analogy.* A hotel cleaner can open the rooms on their floor. If a guest checks out and the cleaner's checklist says "also tidy the minibar log in the office", the cleaner is still the one at the office door, and their key doesn't open it. The checklist is the trigger. Being on it doesn't change whose key is used.

*From today's work,* the gate added to 092:
```sql
IF TG_OP = 'DELETE' THEN
  IF NOT has_schema_privilege('public', 'USAGE') THEN
    RETURN NULL;
```
Deleting an account removes the owner's photos as the system account (`supabase_auth_admin`), which isn't allowed into the app's tables. The first draft tried to tidy the "may wait" flags during that delete and would have stopped the whole deletion with "permission denied". These lines ask first: "can whoever is deleting even open these tables?" If not, they step aside. Everything they would have tidied is being deleted anyway.

*Check:* when an owner deletes a single photo from the app, does this gate step aside? Why or why not?
