# Engines v3 PR-27e: the server decides "may wait" for call today

**Date:** 2026-10-08
**One thing:** T5 L1 — Edge Functions: a decision the server stores is a snapshot, so it is re-made when the record moves · check: pending

Dispatched session (PR-27e, CUL-1628), the second of three PRs under the PM's ruling A on CUL-1611. Plan posted on the issue, PM go typed in session (the plan's four open calls built as recommended). Shipped via #1106.

## What shipped

- `supabase/functions/_shared/incidentMayWait.ts`: the one pure predicate. Every rule on CUL-1611's list is a named check:
  - the allow-list (vomit `repeated_vomiting`, stool `repeated_loose_stool`);
  - no photo finding, present or unsure;
  - no blood-coloured or unclear colour;
  - no model call, including after a photo is removed;
  - a settled read;
  - no call-now sign within the floor's 72 h window (EN-4's floor re-run on every neighbouring vomit, each neighbour's row, lethargy around the run, a cat's intake at every vomit and at the read);
  - no DST change in the profile zone.

  A TRUE also needs EN-4 on and a record that could be read.
- `_shared/incidentMayWaitEvidence.ts`: the reads (caller's JWT, fail closed, never failing the analysis). Also the lower-only re-check of a stored TRUE, which runs after any neighbouring read, after a failed or capped one, after a re-floor, and on a TRUE just written.
- `_shared/incident-analysis.ts`: every write that writes `tier` writes `may_wait` (087's writer contract). That covers the full write-back, the owner-edited update, the capped call, the floor-only write, the rescue, the error-only note, and a hold over a stored TRUE. With the tier key off no write names it, except to take back a TRUE written before a rollback. Under the tier key a model read names the photo set it read inside its own payload (`read_photo_set_key`). `FRAMEWORK_RULE_VERSION` moves from f2 to f3.

## Decisions

- **FALSE vs NULL.** FALSE only when this incident's own photo refused the wait, and it is never written over. Photos are hard-deleted, so it is the one trace a removed photo leaves. Every other refusal is NULL, so a refusal caused by a neighbour, a cap or DST can't chain down a run of vomiting or outlast its cause.
- **The PM's go** built (a) stool `concurrent_vomiting` off the allow-list; (b) `mixed`/`unsure` colours refuse; (c) a neighbour's FALSE refuses; (d) DST in the profile zone, with the device zone left to PR-27f.
- **A cat whose meals aren't rated never waits** (adversarial pass 1). A logging gap must not grant a night's wait inside the hepatic-lipidosis window.
- **"Read" means the payload says so.** The row's `photo_set_key` stamp is advanced by writes that read no photo (the capped escalation, the floor-only write), so only the payload's own key counts.

## Falsification attempts (DoD)

Four adversarial passes, each in an isolated context.
- **Pass 1: FAIL.** A stored TRUE outlived later facts: a hold and a capped run over a new photo, a tier-key rollback, a race between decision and write, an unrated cat. All fixed.
- **Pass 2: BROKEN.** A photographed neighbour whose read never showed the subject passed. Failed and capped neighbour reads didn't re-check. Fixed.
- **Pass 3: BROKEN.** The row stamp let a replaced photo pass as read. Fixed with the payload key.
- **Pass 4: HOLDS-WITHIN-SCOPE.** All four of CUL-1510's passes held, except through the two residuals below.

Every rule and every fix was proven by mutation: 20 predicate mutations, 10 wiring and 14 fix mutations, each red. The four CUL-1510 passes are fixtures in `incidentMayWait.test.ts`. The `code-reviewer` found no bugs, and its cleanups (the re-check in parallel, two comments) are in.

## Residuals

- **CUL-1436 (R1):** nothing on the phone calls the re-floor yet. A later lethargy, vomit or meal log, or a cat's fast ageing, doesn't re-check a TRUE.
- **CUL-1668 (R2, filed):** an owner edit after a TRUE leaves it standing. This needs a migration.
- PR-27f (CUL-1629) is now blocked by both, and its render gates are on that issue.
- **Noted, not fixed:**
  - two concurrent reads of the same event can overwrite a sticky FALSE (the same class as the tier race);
  - `ai_raw_payload` is client-writable under 013's owner policy, so an owner could hand-forge `read_photo_set_key` on their own row (hardening, comment on CUL-1668).
- **For a PM / Dr. Chen ruling:** brown vomit or plant matter in a cat; puppies and kittens under six months (the floor re-run passes no birthday).

## Teach

### One thing: a decision the server stores is a snapshot (T5, L1)
The server can see the whole record, so it decides whether waiting is safe. But it decides at one moment and writes the answer down. If something new lands afterwards (a lethargy log, a blood photo on the vomit next to it), the written answer is out of date until something makes the server look again.

**Like:** a doctor's "you're fine to go home" is true when it's said. If you start feeling worse on the drive, the note in your pocket hasn't changed, but it no longer applies.

**In today's work:** `supabase/functions/_shared/incident-analysis.ts`
`await revalidateNeighbours(writeBack.values.may_wait === true)`
After every read lands, the server re-checks the "may wait" answers next to it, and the one it just wrote, and can only take them back.

**Why it matters to you as PM:** whenever a feature stores a judgment, ask "what makes it look again?". Here, three of the answers (a later log, an owner's edit, time passing) are not wired yet, which is why PR-27f is blocked.

**Check:** a TRUE was written at 8 PM. At 9 PM the owner logs lethargy, and the phone doesn't call the server. What does the record say at 10 PM, and which issue fixes it?
