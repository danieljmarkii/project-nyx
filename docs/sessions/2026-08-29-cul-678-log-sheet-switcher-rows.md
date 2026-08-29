# CUL-678 — should the switcher's management rows render inside a capture surface?

**Date:** 2026-08-29 · **Mode:** DISCOVERY · **Track:** Event Taxonomy Expansion (host gate) / `log_picker_v2`

The issue is on `Waiting on PM` and names a three-way fork, so the deliverable is a decision
round, not code. Per CLAUDE.md's *mock what you change* rule the options differ visually and are
therefore drawn side by side rather than described.

Mock: `docs/culprit-log-sheet-switcher-mockups.html` (round 1) —
https://claude.ai/code/artifact/0218543c-826c-4893-b4c5-587982e08a0e

## The question

The log sheet's title opens the pet switcher, and the switcher is the Home header's — so it
arrives carrying `Add a pet` and `Archived pets` (multi-pet spec §3.3 rules the flip "opens the
same switcher sheet"). In the header those rows are right. Inside a capture surface they are
lifecycle admin, and either one closes the sheet.

## What the code says (verified, not assumed)

| Fact | Where |
|---|---|
| The panel renders both rows unconditionally; `Archived pets` gates only on ≥1 archived pet | `components/pet/PetSwitcherSheet.tsx:135/141` |
| The log-sheet switcher is reachable **only at `stage === 'grid'`** | `components/log/EventTypeSheet.tsx:206–219` |
| `addPet(data, { select: true })` then `router.back()` | `app/add-pet.tsx:37–38` |
| `/add-pet` is `presentation: 'modal'` — the cancel path is a swipe, which also leaves the sheet closed | `app/_layout.tsx:295` |
| The FAB menu's "Logging for" chip opens the same switcher, **unflagged, shipped** | `components/log/FAB.tsx:205–229` |

## Three corrections to the issue as filed

1. **The mis-tap eats the sheet, not a draft.** The switcher only exists on the grid step — once a
   type is picked the title is gone — so there is never a half-filled confirm behind it: no photo,
   no note, no time. CUL-612's discard guard covers that stage and is unreachable from here. What
   is lost is the owner's place in the flow, plus (on the completed-add path) the active pet.
   The accidental ending is the likelier one and is a *pure* loss: back out of the form and
   nothing changed except that the log is gone.

2. **The same rows are one tap away, already in production.** The FAB chip is a capture surface by
   the same test, and its active-pet change is identical — landing on a menu whose next row writes
   a meal in one press. It is cheaper (the menu survives the trip, the recent-food list re-queries
   to empty for a new pet, the chip renames), but it is the same defect. Filed as **D2** rather
   than folded in or ignored.

3. **(B) is not a routing change.** A pushed screen renders behind an RN Modal — the CUL-662
   finding — so the add-pet form cannot appear over the log sheet; the sheet must close for it to
   be seen at all. (B) is therefore sheet-state restoration across a native modal (remember open /
   stage / pet, re-present on return), on the exact seam that wedged the app for every multi-pet
   account last week.

## The prerequisite CUL-618 named is now satisfied

That round recorded: *"CUL-678 cannot be resolved by deletion. Pulling the management rows out of
the capture sheet needs somewhere for them to go first."* At the time `/add-pet` and
`/archived-pets` were reachable from exactly one file. Both halves shipped the same day —
CUL-618 gave the Pet tab a switcher (2+) and a stated `Add a pet` (one pet), CUL-704 kept the
single-pet Home header's switcher — so the door map now holds under (A) even applied to both
capture surfaces: every household keeps a route to both destinations from the Home header alone,
and a second from the Pet tab. `app/(tabs)/profile.tsx:1358` already carries the reasoning in
place, naming this issue.

## Recommendation

**D1 = (A)**, hide both rows when the switcher is hosted by a capture surface — one optional prop
on `PetSwitcherPanel`, defaulting to today's behaviour so the header, the Pet tab and the wrapper
are untouched. **D2 = (i)**, apply it to the FAB chip too, because the rule is about the surface
class and two switchers a tap apart with different row sets is the inconsistency that gets refiled
as a bug.

(A′) — dropping only `Add a pet` — is drawn in the mock to be rejected: it keeps the sheet-loss
and leaves the surface half-pure.

## Consequence to accept under (A)

It makes CUL-662's `onNavigateAway` wiring unreachable on its only consumer. Keep the prop with
the reason written down rather than deleting it — a future in-Modal layer host that navigates will
otherwise rediscover the defect from scratch.

## Status

**Awaiting the D1/D2 rulings.** Nothing built. No schema, no migration, no Edge Function, no
RLS/Storage path in the proposal.
