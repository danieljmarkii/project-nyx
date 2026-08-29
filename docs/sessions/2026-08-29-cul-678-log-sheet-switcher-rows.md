# CUL-678 — should the switcher's management rows render inside a capture surface?

**Date:** 2026-08-29 · **Mode:** DISCOVERY, then BUILD after the same-day ruling · **Track:** `log_picker_v2` (gates the CUL-663 sweep → event-taxonomy W1 GA)

Shipped via #749. Ruled mid-session, so this record covers both halves.

The issue is on `Waiting on PM` and names a three-way fork, so the deliverable started as a
decision round, not code. Per CLAUDE.md's *mock what you change* rule the options differ visually
and are therefore drawn side by side rather than described.

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

## Ruled the same day

- **D1 = (A)** — hide both management rows on a capture host.
- **D2 = (i)** — the rule covers the FAB menu chip too.

## The build

Three files plus tests. No schema, no migration, no Edge Function, no RLS/Storage path — the one
data-access change is a *removal* (see below).

- **`captureSurface` on `PetSwitcherPanel`**, defaulting off, and forwarded by the
  `PetSwitcherSheet` wrapper. Named for **what the host is**, not for what it hides, so a new host
  declares itself and inherits the rule rather than re-deciding it. The Home header, the Pet tab
  and the wrapper's presentation are untouched.
- **The archived-count query is skipped on a capture host.** The link is its only consumer, so
  with the row gone it is a network round-trip whose answer nothing can read — made at the moment
  the owner is trying to log something. The test asserts the *call*, not the row: that is what
  tells "never asked" apart from "asked, and hid the answer".
- **`EventTypeSheet` and `FAB`** each pass it, with the reason in place.

### `onNavigateAway` is kept, deliberately

Under `captureSurface` no row can fire it, so on `EventTypeSheet` — its only consumer — it is now
unreachable. It stays wired anyway, and the comment says why: it is the contract for a Modal host
that *does* show the rows (a pushed screen renders behind an RN Modal), and re-showing them here
without re-adding it would bring CUL-662 back invisibly. The order it pinned is not lost either —
it is still asserted on the panel itself, which is where the contract lives.

### Tests — and the pre-fix run that earns them

Per **CUL-613**, every case was run against the tree it was written for before being trusted:

- **5 confirmed RED pre-fix** — the panel keeps every pet and drops both rows; it never asks
  whether an archived pet exists; the wrapper forwards the flag; the log sheet hosts no management;
  the FAB declares itself a capture host.
- **3 pass pre-fix by design** (regression guards): the flag is off by default so the header/Pet
  tab are untouched, the FAB still uses the Modal wrapper rather than the layer, and a one-pet
  household renders no chip at all (§7.8).
- **Mutation-proved** per **CUL-621**, not just read: reverting the source to **option (A′)** —
  hiding `Add a pet` but leaving the archived link — turns exactly the two capture-surface cases
  red and nothing else. So the guard discriminates the ruled option from the rejected neighbour,
  rather than merely from today's behaviour.
- `components/log/FAB.test.tsx` is new; the FAB had no test file, and without one the D2 half of
  the ruling would have shipped unasserted.

## One comment corrected

The wrapper's header claimed *"this is the shipped surface and its behaviour is unchanged"*. True
when CUL-662 wrote it; false the moment the FAB started passing `captureSurface`. Rewritten to say
what is actually invariant (the presentation) and what is not (which host it is), and to name the
Pet tab, which became a third consumer in CUL-618 and was never added. Same class as the CUL-618
finding: the only symptom of the change was a comment that had quietly become false.

## Verification

`tsc --noEmit` clean · `jest` **281 suites / 6140 tests green** (279/6099 at CUL-618, plus this
file's 3 cases and 5 new ones).

Subagent passes (`code-reviewer`, `pm-feature-review`) were **not** run — this session was
instructed not to dispatch agents. The diff was scanned against the anti-pattern lists in-context
instead; that is a weaker check than an un-anchored read. The `rls-privacy-reviewer` is genuinely
N/A: no RLS, Storage, deletion or export path is touched, and the only data-access change removes
a query.

## What the device pass still owes

The FAB half is the part that wants it: that surface is **unflagged**, so unlike the log sheet it
reaches every multi-pet account on the next build rather than a beta cohort. jest renders Modals
happily — the CUL-662 lesson — so "the switcher still presents from the FAB" is not proven here.

## Not folded in

CUL-679, CUL-680, CUL-617, CUL-628 read and left alone. No new issue was needed: D2 absorbed the
only out-of-scope thing this session found (the FAB chip), which is why it was put to the PM as a
ruling rather than filed.
