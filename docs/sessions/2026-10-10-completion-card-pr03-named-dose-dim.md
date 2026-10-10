# Completion card PR 3: the symptom and dose cards' motion, the dose's gold rule, and the dim

**Date:** 2026-10-10
**One thing:** D5 L1 — What a reviewer looks for: an error path that counts as a pass · check: pending

Shipped via #1148 (CUL-1713). Dispatched by `/dispatch` (PR-03 of *Completion card: daylight and motion*). Plan-gated: the plan and the hint's wording were posted on CUL-1713, and the PM's go was typed in session. Left open for the PM: the merge waits on §4's device rows on the iPhone.

## What shipped

- **`NamedCompletionCard.tsx`** now runs on PR-02's `useCompletionArrival`:
  - the rise, the disc, the pen, the words, and gold on the celebrate tone only;
  - the touch-finish (the card has no dwell pause, so it gains the finish only);
  - the scrim's opacity is the card's, and `shown` is `isNamedDimUp`, so the dim and the look chips read one predicate;
  - Undo makes the card inert from the tap (Change time and the vet-call line's door return early);
  - the leaving body is hidden from assistive tech with no live region, and "Removed" re-arms its 2.4s dwell through `armRemovedDwell`;
  - a vet-call line patched in late finishes the arrival, then runs `FOLD_LAYOUT`, then settles the tone.
- **`MedicationCompletionCard.tsx`** gets the same hook, which gives it the Reduce Motion branch it lacked. Undo guards cover the adherence chips, the vehicle row and Change time. A late double-dose note finishes the arrival first.
- **The dose's gold.** `doseCelebrates` lives in `lib/commitTone.ts` and imports `isGivenAssumed`. `lib/medications.ts` is untouched, because it is in `ask`'s and `generate-report`'s import closure (C-26). `completionTone` covers the medication payload, and today's unconditional halo is gone.
- **The gold waits on the double-dose check.** The pieces:
  - `MedicationPayload.doubleDoseSettled` and `markDoubleDoseSettled`, refused unless the dose is visible and not undone;
  - `applyLogTimeDoubleDoseCheck` settles on every exit that has an answer;
  - the hook gains an optional `haloPending`;
  - the card latches a forfeit when the check is still pending at `haloDelayMs`;
  - `patchAdherence` re-arms the wait when the answer moves to Given;
  - `patchDoubleDose` settles for the answer it was computed for.
- **R4-2.** `isNamedDimUp` sits beside `isCornerCardUp`. In `LookHeader.tsx`, every `HeaderChip` that writes takes `disabled || dimUp` and, while dimmed, the hint *"Ready again when the card at the bottom closes"* in place of the gloss. `write()` refuses under the dim before `selectChip()`. The doors stay live.
- **Spec.**
  - Two lines name `lib/commitTone.ts` as `doseCelebrates`'s home (the planned correction).
  - §2.3's settle line now matches the calmer failure rule below.

## The reviews

**Code review** (isolated `code-reviewer`) found one real bug. An in-doubt dose answered Given showed gold for one local read before its recheck landed a conflict, because the "settled" flag was set once and never re-armed. Fixed: answering Given re-arms the wait until the recheck lands. Test added and proven by deleting the re-arm. Its nits were left:

- The dwell-pause comment it called stale is accurate (the card still has no dwell pause).
- A double Undo tap is already made `ignored` by the store.

**Adversarial review** (isolated `adversarial-reviewer`, run against the code before that fix) returned FAIL with four live breaks. All four are fixed toward calm:

1. **Conflict, then Missed, then Given with a failing recheck → gold standing over a likely repeat.** A failed recheck had counted as settled against the answer before. A failed recheck now never settles.
2. **In-doubt answered Given with a failing recheck → permanent gold.** Same root; fixed by the re-arm plus the failure rule.
3. **A failed log-time check settled to gold.** An unknown was treated as a clear check. A failed read now never settles. This departs from v1.1's "failure reports settled" wording; the spec line is corrected in this PR, as a team call toward calm.
4. **A stalled JS thread could bloom native gold while the check was pending.** The native fade rose on the UI thread from 250ms, and only a JS timer stood in its way. With a check pending, the hook now starts no native gold clock; the JS beat decides and fades it in from there. Proven by deletion.

Held, by its own tests: a second dose over a gold card, an assumed given, Refused, a log-time conflict, a touch while pending, Undo, Reduce Motion with the log-time check.

Residuals it named, low severity:
- A VoiceOver-activated Missed between 250 and 400ms can let the arrival's fade run to its valve at about 460ms before the gold leaves.
- A no-conflict settle landing between the hook's due beat and the card's forfeit timer can bloom the gold late.
- `app/medication-capture.tsx` shows the dose card without running the check, so a first dose from capture never gets gold. That fails toward calm.

## Falsification

Every guard was broken on purpose and went red:

- **Dose card:** the halo forced on, then off; `haloPending` dropped; the forfeit dropped; the pending branch in `startHalo`; a settle on recheck failure; the re-arm; each Undo guard (adherence, vehicle, Change time); the leaving body.
- **Named card:** the touch-finish; the Change time guard; the floor-line guard; the leaving body; the scrim's opacity; the patched-line finish.
- **LookHeader:** `dimUp` deleted from `disabled`; the check in `write()` deleted.

## Residuals

- §4 device rows 4–6 and 9–13 need the iPhone (Runtime B). No test can see a frame: the native driver never steps in the test renderer.
- The three low-severity items above.

## Teach

### One thing — What a reviewer looks for: an error path that counts as a pass (D5, L1)
A reviewer's sharpest question is "what happens when this step fails?" Code often handles the happy answer and the bad answer and forgets a third outcome: no answer at all, because something broke. If that third outcome quietly takes the happy branch, the app shows a reassurance it never earned.

**Like:** a smoke alarm whose battery died. If the panel shows "no smoke" because it heard nothing, it is reporting silence as safety.

**In today's work:** `lib/medicationDose.ts`
`console.warn('[medication-dose] log-time double-dose check failed:', e);` followed by `return;`. Before the review, the next line marked the check settled, which let the dose's gold through on a check that had crashed. Now it just stops, so the gold never shows.

**Why it matters to you as PM:** when you read a spec line like "reports settled on every exit path, including failure", ask what the owner sees on the failure path. Here, the spec's own wording was the bug, and this PR corrects it.

**Check:** If the double-dose check crashes on a dose the owner really did give, what does the card show, and why is that the right side to be wrong on?
