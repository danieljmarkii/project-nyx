# Engines v3 PR-27a — a re-run over a live call keeps the escalation on screen

**Date:** 2026-09-29

Shipped via #985 (CUL-827, which absorbs CUL-816). Client only: no migration, no Edge Function. Dispatched by /dispatch as Engines v3 PR-27a; it clears the way for PR-27, the rescued-escalation disclosure (CUL-819).

## The defect

Tapping **Re-run analysis** on a vomit or stool read that said *Worth a call* marked the local row `pending` before asking the server. The pending branch renders ahead of the read card, so the escalation and its sentence left the screen and "Reading the photo…" took their place.

That lasted for the length of the re-read. On a refused invoke or a watch that gave up, it lasted until the owner left the screen, because the pending frame was keyed on `status === 'pending'` alone and nothing ever cleared it. A spinner reads as *nothing was found* on the one surface built never to reassure. This is CUL-812's shape, one status over.

## What shipped

- **`escalationSurvivesReRead`** (`lib/incidentReadState.ts`) is the pending sibling of `escalationSurvivesFailure`. It is keyed on `isEscalationVerdict`, so it also holds a verdict this build does not know yet (EN-3's `call_now`).
- **Both sections render the pending frame only while a read is in flight** (`working || retrying`, counted from the tap).
  - Over an escalation the frame is skipped. The card stays, and the Re-run slot shows the re-read in place ("Reading the photo again…", or "Reading this one again…" for a photoless contextual escalation). The control is disabled while the read runs.
  - Calm verdicts keep the pending box from the tap, the CUL-812 asymmetry.
  - A watch that gives up falls through to a frame that carries a retry.
- **Every refusal path is caught:** a rejected invoke, the re-base read, and the stool EN-7 re-check trigger. The restore itself shipped with CUL-1275.
- **The card can now be hidden mid re-run, and both Hide paths respect that.** A refused invoke's restore keeps the owner's latest Hide or Show over the same words (CUL-1323 intact). A failed Hide rolls back `dismissed_at` alone over the current row.
- **`arrivalMotion`** re-seeds the stage's "was" when a wait starts. Without that, the mount's first-load box survived in it and replayed the arrival (a clip, plus a ghost "Reading the photo…") over an escalation that never left the screen.

## Adversarial review (clinical-guardrails)

- **Round 1 — FAIL, nothing clinical.** It found four things:
  1. the arrival replay;
  2. a calm card beside the new re-read line during the re-base read;
  3. a mid re-run Hide undone by the restore;
  4. uncaught reads.

  All four were fixed in `db65814`.
- **Round 2 — PASS.** It tried:
  - a first open, a log-chain wait, and a calm re-run, where the arrival still fires once;
  - the stale-pending mount;
  - reduced motion, a photo removed mid-wait, and `read_disabled`;
  - the CUL-1323 new-words case, where an old hide never lands on new words.

  Its one residual, R7 (a failed Hide re-marking a finished row pending), was fixed in `8e3d99e`.
- **Every fix is mutation-proven.** The escalation guard, the give-up keying, the rejection catch, the arrival re-seed, calm-at-tap, the hide restore and R7 each redden a component test when reverted. The R7 test first passed with its fix reverted, because nothing visible moved. It now asserts `Add details`, which only a finished read offers.

## Residuals

- A re-run started from a calm screen, when the server already holds an unseen escalation, shows the pending box until that escalation lands. Nothing leaves the screen. This predates the change, and the escalation is spoken when it lands.
- CUL-143 edits the same two files and was deliberately not folded in.
