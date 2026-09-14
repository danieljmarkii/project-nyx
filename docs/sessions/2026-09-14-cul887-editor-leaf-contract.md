# The event editor asks the leaf contract, on every leaf

**Date:** 2026-09-14

Shipped via #846. One issue (CUL-887), both halves — the description's `hasPhoto` gate and the 2026-09-13 comment's `confidenceModel` gate. Client-only: no schema, no migration, no Edge Function, nothing on either standing deploy hold.

## What shipped

`app/edit-event.tsx` was the one surface that ignored the per-leaf contract in `constants/eventTypes.ts`. Two affordances, one shape of defect, and the second is the one that mattered:

- **Photo.** The section was unconditional, narrowed to `!isLook` by N-3. Every leaf declaring `hasPhoto: false` still offered *Attach a photo*, and `resolveEventPhotoDisplay` gates only the EMPTY add-photo hero on the flag — so a photo attached through the editor renders as the record's hero on a type that declared it would never carry one.
- **Saw it / Found it.** `showConfidenceControl` was `!config.hasFood && !isWeight && !isMedication && !isLook` and never consulted `confidenceModel`. A cough or sneeze opened in the editor got the control and could be stamped with a window time claim those leaves declare unwritable by construction (taxonomy D10 — a cough is heard, never found later). That column prints on the vet report and feeds detector ⑦.

Both now ask the contract, matching the record screen and both capture surfaces: `hasPhoto ?? true` and `confidenceModel !== 'witnessed'`, with an unknown leaf degrading to today's generic offer per §8.

## The issue's table was wrong, and the way it was wrong is the lesson

It named three leaves as `hasPhoto: false` — `cough`, `sneeze`, `check_in`. There are **four**: `meal` is also false, and the editor was offering the row on all four.

The issue was not careless; it was written the way the bug was written. The defect it describes *is* a hand-listed set of types that agreed with the contract right up until a wave added leaves the list had never heard of, and the report reproduced that exact move one level up — enumerating the leaves rather than asking the predicate. Two artifacts, same failure mode, and the second one was the bug report about the first.

That is why meal rode along rather than being carved out. Keeping it would have meant a fifth hand-listed set of types in a codebase whose `hasPerIncidentRead` docstring already names *"a second list that agrees today"* as the failure mode it was extracted to end. And meal's suppression is not a new product call: `app/event/[id].tsx:735` already ships it, under a reviewed ruling (*"Meals' clinical artifact is the food name, not a photo, never beg for one — Dr. Chen + Jordan, on-device review"*). The editor was simply the last door.

Surfaced to the PM as a decision brief before any code, since it changes a shipped surface the issue did not name. Ruled A (predicate as written, meal included) in session.

## Two asymmetries, both load-bearing

**The gate suppresses the BEG, never the EVIDENCE.** That is `constants/eventTypes.ts` §6/§7 verbatim, and it is why the render condition is `displayAttachmentUri || offersPhoto` rather than the flag alone. An existing photo keeps its row on any leaf; only *Attach a photo* disappears. `PhotoViewer`'s `onReplace` is withheld on those leaves too — it is a second door to the picker, and gating the row while leaving it would have closed the front and left the side open.

The reason is not squeamishness about deleting rows. The record screen renders that photo as its hero regardless of the flag, so an editor that hid it would be the surface disagreeing with the record about what the record contains.

**Closing a door does not rewrite what came through it.** Widening the confidence gate retroactively means rows stamped through the old control now open with no control on screen. Chased that through the save path rather than assuming: `confidenceTouched` is only ever set by the control's own handlers, so with no control rendered the save omits the field and `updateEvent` preserves what the row holds. Had it worked the other way, an unrelated note edit on a windowed cough would have silently re-graded it to witnessed and printed as `seen` on the vet report — B-448's defect arriving from the opposite direction, and silent.

The residue is stated in the code rather than left to be discovered: such a row can no longer be re-graded from this screen. Production holds none, so the trade is an unreachable correction on zero rows against an open door on every row.

## Both row checks came back zero

The issue asks for them, and both are the whole difference between a door-closing change and a data-migration question:

| Check | Result |
| -- | -- |
| Attachments on `cough` / `sneeze` / `check_in` / `meal` | **zero** — the only type carrying one is `vomit`, 83 rows |
| `cough` / `sneeze` rows at window confidence | **zero** — 40 rows total, every one witnessed |

Worth noting what the second number means at GA (CUL-960), which is why the comment recommended landing this before it: 40 rows is one beta cohort. The door being closed is one that every account walks past the day the flag graduates.

## The test walks the enum, not the bug report

`app/editEvent.leafContract.test.tsx` (new, 33 cases) drives the editor for **every key of `EVENT_TYPES`** and asserts both affordances against that leaf's own fields. Sampling the four leaves this bug named would have inherited the bug's blind spot — such a test would have been green on the day cough shipped.

Non-vacuous by construction: the enum holds leaves on both sides of both predicates, so the positive cases (vomit offers the photo row, itch offers Saw it / Found it) fail loudly if a mock breaks rendering, and the absence assertions can never be the only thing measured. Two set-equality assertions pin the populations themselves, so the walk cannot quietly start walking a different set — that is where the "four, not three" claim is enforced rather than trusted.

Five mutations, each reding only what it should:

| Mutation | Reds |
| -- | -- |
| Confidence gate reverted to the four-type list | `cough`, `sneeze` — **and nothing else** |
| Photo gate reverted to `isLook` | `meal`, `cough`, `sneeze` |
| Viewer `onReplace` ungated | the Replace case |
| Evidence branch dropped (beg-flag only) | the existing-photo cases |
| Save re-asserts confidence with no control on screen | the windowed-cough preservation case |

The first one is the interesting proof: the PR's central claim is that the predicate swap is equivalent on ten leaves and changes exactly two. Reverting it and watching precisely cough and sneeze go red is that claim measured. Asserting it in a comment would have been the same claim un-measured.

## What the comments now say

Three comment blocks in `app/edit-event.tsx` documented the *old* narrow gates, one of them explicitly: *"The tempting refactor is to read `config.confidenceModel` … It is wrong here … that version would silently change two shipped types under an unrelated PR."* That reasoning was correct when written and this PR is the sanctioned place it stops being correct, so the block was rewritten rather than left to contradict the code under it. Same for the save-path comment that named "meals/weight/doses" as the leaves without a control, and the N-3 photo comment pointing forward at this issue.

`app/editEvent.look.test.tsx`'s two cases still pass unchanged — a look reaches the same answer through the predicate every other leaf is now asked — and both gained a note saying so, plus a pointer to where the contract's own coverage now lives. They stay because N-3's claim is about the LOOK specifically, and it should keep failing on its own terms if `check_in` ever loses that answer.

One behaviour change beyond the issue's two halves, called out in the PR so it is not discovered later: N-3 hid the photo block on a look entirely, and under the beg-vs-evidence shape a look holding a photo would now show it. Unobservable today (zero `check_in` attachments) and it aligns the editor with the record screen.

## Verification

`tsc --noEmit` clean. Full suite green: 382 suites / 8241 tests. The editor suites also run green under all three CI zones (UTC+14 / +12:45 / −10) — checked locally rather than left to the `App (jest, non-UTC timezones)` job, since the fixtures carry a date.
