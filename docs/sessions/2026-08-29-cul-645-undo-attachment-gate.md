# CUL-645 — Undo asks before it takes a photo with it

**Date:** 2026-08-29
**Issue:** CUL-645 (Aug. 2026 Design Polish → completion chain, parent CUL-603)
**Outcome:** shipped via #741
**Also filed:** CUL-707 (C-wide — Recently deleted for events)

---

## What this session was

CUL-645 arrived as a **PM decision** issue on `Waiting on PM`, not a build: *"Whether Undo stays a bare one-tap, and if not, what changes."* It was written by the `adversarial-reviewer` off CUL-612 and carried four options with B marked as the team recommendation.

So the session ran DISCOVERY first — verify the brief against the shipped code, hand the PM something they can rule from — then BUILD once ruled. That split mattered: **two of the brief's three premises did not survive contact with the code, and the option it priced highest was mis-priced.**

## The verification pass

### 1. "Undo is the only destructive action without a Cancel" — false

**"Remove from library"** (food archive, `app/food/[id].tsx:525`) is also unconfirmed, and its shipped comment states the principle outright:

> *No confirmation dialog: the undo snackbar is the safety net (the Linear/Gmail undo-over-confirm pattern), and nothing is destroyed, so a modal asking "are you sure?" for a reversible tidy-up would be friction, not safety.*

Reading all five destructive actions together gives the app's real rule — **confirm XOR a way back, exactly one safety net each**:

| Action | Confirm | Way back |
|---|---|---|
| History Remove · detail Remove · Remove photo | ✅ | — |
| Vet document Delete | ✅ | ✅ 30-day "Recently deleted" |
| Remove from library (food) | — | ✅ Undo snackbar |
| **Completion-card Undo** | **—** | **—** |

Undo was the only one with **neither**. That is a sharper and more defensible anomaly than the one filed, and it is what the fix is aimed at. Recorded as a CLAUDE.md convention this session.

### 2. "A small conditional in the three cards" — one gate in one card

An event photo can only ever reach **`NamedCompletionCard`, from `app/log.tsx`'s simple-event branch**:

- `MealCompletionCard` — meals carry no photo; `food-capture` shoots to `nyx-food-photos` (the food library), never `event_attachments`. `app/log.tsx:931` already said so.
- `MedicationCompletionCard` — no attachment path; `medication-capture`'s label shot is drug-label extraction.
- The B-745 sheet (`SimpleEventConfirm` → `SheetLogBeat`) attaches photos but has **no Undo at all**.

The brief's parenthetical ("the payload already knows whether a photo was attached") was also wrong — neither `LoggedRecord` nor `NamedPayload` carried the fact. But `attachmentUri` is in scope at the `showNamedMoment` call site, so B was *cheaper* than advertised, not more expensive.

### 3. "C needs an un-delete path, which the app does not have" — mis-priced

The un-delete pattern is shipped **twice** (`restoreFood`, `restoreVetDocument` + the `app/vet-files.tsx` Recently-deleted surface), and the data all survives an Undo — the soft delete leaves the local `event_attachments` row and file intact, and because **CUL-639 is unfixed the Storage object survives too**. Undo does not currently destroy the photo; it removes the only door to it.

What actually prices C out is `REMOVED_DURATION_MS = 2400` — a `Restore` on the removal line is a **2.4-second** window. That is a net for a mistouch the owner watches happen and nothing else. C is only real as a *Recently-deleted-for-events* surface, which is a track. Filed as **CUL-707**.

### The cross-issue constraint

**CUL-639's "fuller fix" must be sequenced after this.** Today the bytes survive an Undo; calling `detachEventAttachment` from the reversal would make Undo genuinely destroy them, converting this from an access problem into data loss.

## The ruling

PM ruled **B′** — a sharpened B — and directed C-wide to be filed separately.

B′ is not B-with-a-dialog. After CUL-612's asymmetric `hitSlop` closed the z-order mistouch, the residual is a **comprehension** failure: an owner reversing a mis-logged event with no idea the photo goes too. A generic "Are you sure?" adds a checkpoint and delivers nothing. **B′ is the confirm that names what is being lost** — the body is the feature, the extra tap is its price.

Copy (PM-selected preview, shipped verbatim):

```
Remove this log?
The photo you attached will be removed with it.
[ Keep it ]        [ Remove ]
```

The title matches both sibling Remove dialogs verbatim. The cancel reads **"Keep it"** rather than their "Cancel" — a deliberate divergence (shipped precedent in vet-files, and warmer), flagged rather than silent.

## What shipped

- `store/momentStore.ts` — `NamedPayload.hasAttachment?: boolean`. On the payload, **not** `LoggedRecord`: that type is the sentence source and carries only what the row *says* (CUL-606's shape rule), and a photo does not change `"Vomit · found by 5:33 PM"`. Same placement reasoning as `previousSnapshotKg`, and for the same module. **No change to `undo()`.**
- `app/log.tsx` — the simple-event `showNamedMoment` passes `hasAttachment: !!attachmentUri`. The weight path is untouched.
- `components/ui/NamedCompletionCard.tsx` — the gate, plus the two mechanics below.
- `components/ui/NamedCompletionCard.test.tsx` — 8 tests.

### The two mechanics a naive dialog gets wrong

**The rigid haptic relocates itself.** `undo()` fires `destructiveConfirm()` internally, and its comment justified rigid-on-the-tap because *"the tap IS the confirm"* (§5.6). On the gated path that premise is false — a live "Keep it" is on screen. Calling `undo()` **from the confirm handler** lands the buzz exactly where History and the detail screen land theirs, with no store change. The store's guards return `'ignored'` before the haptic, so a stale confirm does not buzz either.

**The dialog has to hold the card open.** This card never wired the dwell pause (only the chip-bearing meal/dose cards did, for CUL-614's 9-chip problem), so its 5s runs from the **reveal** and the Undo tap does not reset it. Tap at 4.5s, read the dialog for a second, and the confirm lands on a dismissed card: `undo()` refuses on `!visible`, returns `'ignored'`, and **the log silently survives a removal the owner authorised**. A gate that loses the removal is worse than no gate. Fixed with `pauseDwell()` before the alert and `resumeDwell()` on cancel/dismiss and on any non-`'removed'` result.

And because that hold has a ~20s ceiling rather than being infinite, **`'ignored'` after an explicit confirm is now spoken**. It stays silent on a bare tap — a second tap did nothing wrong, and an error there teaches distrust — but after a confirm, silence is the one thing `UndoResult`'s own contract says must never read as "removed".

## Falsification — the guards were mutation-proved, not inspected

Per CUL-613 (*a guard that has only ever been green has not been tested*), each protected behaviour was broken against the tree and the suite re-run:

| Mutation | Result |
|---|---|
| Gate absent (the pre-fix tree) | **7 gate tests red**; the no-photo one-tap test **stayed green** |
| `pauseDwell()` removed | exactly `holds the card open…` red |
| `destructiveConfirm()` fired on the tap | exactly `holds the rigid haptic…` red |
| `'ignored'` branch silenced | exactly `speaks up if the confirm arrives…` red |

Every mutation killed **exactly its own test and no other** — no passenger assertions. And the split CLAUDE.md requires holds: the seven *guards* fail before the fix and pass after; the one *refactor-safety* test (the 95% one-tap path) passes on **both** trees, which is what makes it a baseline rather than a second guard.

## Residuals

- **The photo-less case stays one-tap with no way back** — knowingly. That record can be re-logged from what the owner still holds. Satisfying the rule everywhere is **CUL-707**.
- **CUL-639 unfixed** — the retracted photo still uploads to Storage and is never removed. Sequencing constraint recorded above and on CUL-707.
- The `undo()` staleness guards (`eventId` identity, `visible`) were left exactly as the access-control red-team wrote them. The fix works *around* the `visible` guard by keeping the card alive, never by loosening it.

## Notes

- Merged `origin/main` mid-wrap — a sibling session landed CUL-618 + the PetAvatar states while this ran. Clean merge, no conflicts; full suite re-run green on the merged tree (**280 suites / 6116 tests**).
- `STATUS.md` untouched: no track started or ended, no standing hold changed, no phase moved, no pointer went stale.
- **Access-control red-team judged N/A and stated rather than skipped.** CLAUDE.md names deletion as never-mechanical, which is why this was planned before coding — but the change puts a gate *in front of* an existing soft-delete. It creates no path to health data, widens none, and touches no bucket, policy, RLS rule, or export. The genuine Storage question here is CUL-639, filed and out of scope.

— Designer + Dir. of Engineering lenses, with QA on the mutation pass
