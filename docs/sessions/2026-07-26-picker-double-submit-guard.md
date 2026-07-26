# Picker double-submit guard — one tap, one event (B-336)

**Date:** 2026-07-26

Shipped via **#471**. Bug fix on the shipped quick-log path; no schema, no build-step
advance. Closes **B-336** (a `code-reviewer` residual from B-325 / #342) and files
**B-477**.

## The bug

A picker tile *is* the write. Tap a food or a medication and an event lands, with no
confirm step in between — that's Principle 1 working as designed (zero decisions at
moment of event), and it's exactly what makes the tile re-entrant. The write is async
(SQLite + child row + sync push), the tile stays live for those tens of milliseconds,
and a rapid double-tap ran `handlePickMedication` twice: **two dose events for one
pill**, which reaches the vet report as a genuine double-dose.

B-336 also carried the B-325 wrinkle: on the retroactive-combo path the second run's
`setComboConfirm` overwrote the first's, so the first dose's "Did {pet} still get it?"
sheet never rendered. That dose still surfaced via the History "Unconfirmed" tag — no
false `given`, no data loss — but the prompt was silently skipped.

## What shipped

**`hooks/useSubmitGuard.ts`** (new) — latches on the first tap, drops every tap that
arrives while the write is in flight. Wired around **both** `handlePickFood` and
`handlePickMedication` in `app/log.tsx`, one guard for the screen (only one picker step
is ever mounted, so the two paths can never be in flight together).

**The release rule is explicit rather than inferred**, which is the part worth
remembering. The guarded function returns `true` when it **committed** an event — stay
latched, the screen is dismissing, no later tap on the same visit may write again — and
`false` when it wrote nothing (a failed or refused write, where the owner is still on
the picker looking at an alert and the tile must work again). A throw releases too: an
unexpected failure must never leave the picker permanently dead.

**At the handler, not as a `disabled` prop on the tiles.** `FoodPicker` also serves the
B-417 selection surface (`StartTrialModal`), where a tap toggles a set and re-tapping is
the whole point; a tile-level guard would have to know which mode it's in. Guarding the
write guards exactly the paths that write. This is what the backlog row recommended
first, and the selection surface is the reason it was right.

## The falsification pass, and the second commit it produced

The first cut settled the guard's answer at the *end* of each handler, i.e. after the
completion card, the optimistic timeline row, the confirm sheet and the navigation had
all run. Trying to break it surfaced the one path back to the bug:

> **Counterexample:** the dose insert succeeds, and then something *after* it throws —
> `showMedicationMoment`, `prependEvent`, `setComboConfirm`, `router.back()`. The throw
> propagates out of the handler, the guard's `finally` sees no commit, **releases**, and
> the next tap writes a second dose for a pill that was already recorded.

That is precisely the artifact the guard exists to prevent, reachable through the guard
itself. Fixed by settling the answer **on the write** and wrapping everything past it:
`handlePickFood` early-returns `false` on a null `handleConfirm` result and runs its
card + trial-flag inside a `try`; `handlePickMedication` wraps its whole post-insert
presentation block the same way. A failed card is cosmetic and self-corrects — History
and the dose detail read ground truth — and it must never cost a duplicate record.

Held under the same pass: the guard can only ever *prevent* a duplicate write, so there
is no path where it converts an unconfirmed dose into a `given` one, none where it
suppresses an escalation, and none where it changes the B-156 PR B3 intake→adherence
coupling — that logic, the write-time pet identity, and the B-325 confirm-sheet gating
are byte-for-byte unchanged.

Not run as the `adversarial-reviewer` subagent (this session had a standing instruction
against spawning unrequested agents); the attempt above is the stated falsification the
DoD asks for, done in-session. The changed logic is control flow around a write, not
clinical or statistical logic — no threshold, no read, no escalation moved.

## Tests

9 cases in `hooks/useSubmitGuard.test.ts`, using a deferred promise so the second call
genuinely lands mid-flight rather than sequentially:

- a burst of four taps runs the write once;
- a second tap on a **different** tile is dropped too — a fat-fingered double-tap
  usually lands on the neighbour, which a per-tile guard would miss;
- latch-after-commit, release-after-no-write, release-on-throw;
- survives the mid-flight re-render `handlePickFood`'s `setState` calls cause (a guard
  held in state rather than a ref would read stale and let the second tap through);
- and one pinning the caller contract above: a committed write whose presentation throws
  and is swallowed stays latched.

`npm test` green — 132 suites / 2340 tests. `tsc --noEmit` clean. Both CI checks green
on #471.

## Left open

**B-477** — the simple/symptom confirm button (`onPress={() => handleConfirm()}`, two
call sites) and the weight confirm button on the same screen have the identical hole:
bare `TouchableOpacity` over an async write. Deliberately outside B-336's scope, which
names the picker press path. The fix is now a drop-in — `useSubmitGuard` exists, so it's
a wrap plus threading a boolean through `handleConfirmWeight`'s early returns. Colder
path than the pickers: these steps have a deliberate confirm action rather than a
one-tap tile, so the taps are less bursty and a duplicate weight row is less clinically
loaded than a duplicate dose.
