# CUL-1323: a hidden AI note never hides a read the owner has not seen

**Date:** 2026-09-27

Shipped via #952 (draft). BUILD session on CUL-1323 (Aug. 2026 Design Polish), started from the CUL-1275 session (#938) after the PM ruled option (a) and said "start it here". Branch `danieljmarkii/cul-1323-a-hidden-ai-note-stays-hidden-over-the-next-read-a-new-worth`, a second PR on the PM's explicit say.

## What shipped

**The server clears the hide on every new read.** A dismissal (`event_ai_analysis.dismissed_at`) is a statement about the read the owner saw, never about the incident. Every server write that records a read now clears it:
* both modes of `buildAnalysisWriteBack`, which covers the capped path's contextual escalation;
* the failure write's rescue (#940's CUL-815 path), which writes an escalation's words over a row that held none;
* a hold (#940's CUL-1201 rule), which keeps a stored escalation's words over a calmer read. It clears a hide it finds, and it still writes nothing over an un-hidden finished row.

A run that reads nothing keeps the hide: the error-only failure, the failed upsert and the cap state.

**The client writes a Hide or Show only over the read on screen.** `lib/analysisDismissal.ts` makes the write a compare-and-set.
* It compares everything Hide takes off the screen: the verdict, the read text, the description and every observation, with the contents arrays compared as a fully quoted Postgres literal.
* No row matched means the read changed underneath. Both sections then re-read, show the record, and say "This note changed / It was updated while this was open. Have a look, then try again."
* The same words coming back means a failure, which is rolled back and said.

**Guards.**
* **Server:** the pipeline suite drives every write path end to end (a re-read in both modes, the capped escalation, the rescue, the hold and its settle, and a wordless failure). It also has a sink scan over `supabase/functions`:
  * only the three writers write read words or touch the hide;
  * each `.from()` is resolved at its own site, and one the scan cannot name fails closed (`delete-account` is the one exemption);
  * a query that escapes unfinished is refused.
* **Client:**
  * a read recorder renders each section over a row that records every column it reads, and each column must be compared or excluded with a reason;
  * a pin keeps the lists inside `SELECT_COLS` and over the descriptors' `RED_FLAG_COLUMNS`.

**Docs.** `clinical-guardrails` carries the hide rule under Pattern 7, beside the never-lower rule.

## Decisions

* **The ruling, (a):** a new read always clears the hide (PM, 2026-09-27).
* **A hold clears it too.** This follows the ruling's letter. "Those are the words the owner hid" is true only of a hide made through the new client, and builds on phones hide unconditionally (round 2).
* **The compare covers the screen, not the red-flag list.** Hide takes the grid and the description off, and a replaced photo can change any of them under byte-identical words (rounds 2 to 4).
* **Owner-facing copy is direction-neutral.** It is true for Show and Hide, for a new read and for an edit on another device, and whether the newer read is shown or hidden.

## Falsification attempts

Five `adversarial-reviewer` rounds. The first four broke, the fifth broke only the guard, and every break was fixed and proven by mutation.

* **Round 1: BREAKS.**
  * The Hide itself was unconditional, so a stale screen could hide a Worth a call that landed first.
  * The capped path's clear was untested.
  * The stool section lacked vomit's in-flight Show test; that fix went to #938.
* **Main moved (#940)** and reopened the bug: its rescue wrote an escalation without clearing the hide. Fixed with the merge.
* **Round 2: BREAKS.**
  * A hold kept a hide an old build made over an unseen escalation.
  * The same words over a new blood finding passed the compare.
  * The scan missed a split builder, a table constant, a mutated result and a shadowing parameter.
* **Round 3: BREAKS.**
  * "Fresh red" to "Dark / tarry" passed, through `stool_blood_type`.
  * Five scan shapes passed.
  * The old-build residual was overclaimed.
  * A stale-screen Edit overwrites a newer read's blood finding; that bug predates this work, filed as CUL-1356.
* **Round 4: BREAKS.**
  * A file-wide binding map let a same-named `const table` launder a write, green on a live plant.
  * The regex pin could not see `description` or a destructured read.
  * `contents` was excluded.
* **Round 5: HOLDS** on the array compare (then confirmed live: the quoted literal parses as `vomit_content[]` / `stool_content[]`, order counts, and `{}` matches) and on the recorder. **BREAKS the guard only:**
  * an arrow helper handing out a query;
  * a nested generic;
  * a literal carrying observations.

  The reviewer's fix was proven in a copy; each shape is now a fixture.

## Residuals (stated in the code)

* **Old builds:** a build already on a phone still sends an unconditional Hide. On it, a stale screen can hide an unseen Worth a call, and a hidden row offers no Re-run to trigger the clear. Rows the old bug left hidden are on file. This is **CUL-1357**, a PM decision brief: a server witness (recommended), or an OTA plus a backfill.
* **A failed re-read after "changed"** puts back the card the owner was looking at, with "Could not update". Nothing is hidden.
* **The recorder cannot see** a column read only behind another column's value that no fixture holds.
* **The scan's stated blind spots:** `.rpc()` and SQL functions, computed keys, a query bound and then passed along, arrow-function scope, and capitalised receivers.

## Filed

* **CUL-1356 (High):** the same race on Edit.
* **CUL-1357 (High, Waiting on PM):** old builds and rows already hidden.
