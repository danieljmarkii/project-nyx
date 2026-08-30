# Log sheet pre-GA nits — the single-pet title row stops announcing a switch

**Date:** 2026-08-30
**Issue:** CUL-682 (item 1 shipped; items 2 and 3 PM-ruled no-change)
**Outcome:** shipped via #756

---

## What this session was

CUL-682 grouped three pre-GA polish items on the `log_picker_v2` log sheet, two of
which said "confirm on device first". The session's actual work was deciding which of
the three were *fixes* and which were *calls* — and one of them turned out to be a
much larger question wearing a nit's clothes.

The split: **item 1 built**, items 2 and 3 ruled no-change by the PM, each with a
follow-up issue where one was warranted.

## Item 1 — the "dimmed" announcement (built)

The grid title was one `TouchableOpacity` with `disabled={!multiPet}`.

The issue asked for a device confirmation before spending anything on it. That turned
out to be answerable here, and more definitively than a device pass would have:

- RN copies `disabled` into `accessibilityState.disabled` — `TouchableOpacity.js:279–285`
- iOS maps that to `UIAccessibilityTraitNotEnabled` — `RCTViewComponentView.mm:483`
- VoiceOver speaks that trait as **"dimmed"**

and a probe render of the single-pet sheet returned
`{accessible: true, state: {disabled: true}, responder: true}` — a focusable,
unavailable-sounding node over a control that does not exist. The chain is a property
of the shipped source and the render tree, so the device look would only have
re-observed it.

**The framing that made the fix obvious:** the visual suppression was always right
(multi-pet §3.1/§7.8 keeps multi-pet chrome off a one-pet account). Only the
announcement was wrong, because **one prop was doing two jobs that are not the same
act** — hiding chrome, and claiming a control exists but is off. Splitting by host
separates them: multi-pet keeps the switch control, single-pet gets a plain `View`
that is `accessible` and carries its own label.

**The label is the second half**, and it came from CUL-679's handoff comment on this
issue rather than from the original description. The avatar's 38pt forced
`flexShrink: 1` onto `title`, so a long name now ellipses here — and with no label the
full name had nowhere to survive, on the one surface whose job is naming which pet a
health row lands on. Multi-pet never had that problem; its label already spells the
name out. The comment called it two birds and one edit, and it was.

One thing worth writing down because it looks present in a diff and does nothing on a
device: **the label needs `accessible` on the `View`.** Without it the label never
applies, and the disc and the sentence stay two separate VoiceOver stops — the second
of which reads the *ellipsed* text. That is the original defect with a fix sitting
next to it.

### The guards, and what proved them

Four tests. Three are guards and one is refactor-safety, and per CUL-613 each was run
against the tree it was written for *before* being trusted — plus, this time, against
its own rival fix, which is where the discrimination actually gets tested:

| Mutation | Red |
|---|---|
| The pre-fix tree | all three guards |
| Drop `accessible`, keep the label (an inert label) | the one-node guard only |
| Keep the touchable for single-pet, drop only `disabled` | the disabled-state guard only |

The second mutation is the one worth noting: `getByLabelText` finds a label whether or
not the node is `accessible`, so the "long name survives" test **alone would have
blessed an inert label**. That is exactly the CUL-613 failure mode — a guard written by
someone who knew the defect, that still misses it — and it is why the third guard
exists as a separate assertion on `props.accessible` rather than as a second
expectation inside the first.

The fourth test (multi-pet still announces a real, enabled button) passes on both
sides, which is the side a refactor-safety test belongs on: its job is to pin the
behaviour being preserved, and the fix touches that branch too.

**Asserted on state rather than through a press.** Pressing a disabled touchable is
silent either way, so a press cannot tell "inert" from "inert and announced as
unavailable" — and the announcement is the entire defect. (CUL-579, one step further:
there the lesson was that a press can reach a handler it shouldn't; here it is that a
press cannot see the thing under test at all.)

## Item 2 — "Logging for" vs "Log for" (ruled: leave the split)

Two capture surfaces, one tap apart, in different registers. CUL-679's comment had
already narrowed it: both are now avatar-led, so the difference is two words rather
than two visual treatments.

Ruled **leave it**, and the reasoning is worth keeping because it is not "we couldn't
be bothered":

- They are never seen side by side, only in sequence, and the avatar now carries that
  continuity.
- The grammar tracks a real difference. The FAB chip is a **state label** on a menu
  that stays open across a flip ("Logging for" — you are currently doing this); the
  sheet title **names the destination** of the row about to be written ("Log for").
- The two mechanical unifications each cost something real. "Logging for" on the title
  lengthens the row item 1 just established already truncates. "Log for" as the chip's
  eyebrow turns a state label into an imperative sitting above a name.
- The one option that improves things — adopting the chip's eyebrow+name structure on
  the title, whose name never truncates — is a change to the design-locked round-4/5
  frame, so it needs a mock round, for two words, on a title ruled two days earlier.

## Item 3 — the decorative grabbers (ruled: no change here; own issue → CUL-727)

Filed as a log-sheet nit ("both sheets show one, and they double when stacked").
Checking it found the premise was too small:

- **11 components render a `grabber`**
- **zero pan handling exists anywhere in the codebase** — no `PanResponder`, no
  `Gesture.Pan`, no `react-native-gesture-handler` import outside one comment in
  `PhotoViewer.tsx` noting its absence

So every sheet in the app signals drag-to-dismiss and none delivers. That is an
app-wide affordance question, not a nit on this surface, and the two live options
(build the gesture across 11 sheets; remove the signifier from 11 sheets) are both
their own session. It went to **CUL-727** with the four options and the measurement.

On the doubled case specifically: the two grabbers sit ~230pt apart with the host's
dimmed under the panel's scrim, so what renders is *two stacked sheets* — which is
what is actually happening, and may well be reading correctly. That is the part that
genuinely needs a device look, and the issue says so rather than assuming.

## What the sweep turned up

Checking whether item 1 was a one-off produced the session's most transferable
finding. All 85 `disabled={` sites, and the rule is **narrow**:

- Two more live instances of the same class → **CUL-728**. `RundownTileRow` is the
  sharper one: it already switches `accessibilityRole` to `'text'` when not tappable,
  so the author's intent is explicit in the same element the `disabled` prop
  contradicts.
- Two *correct* uses that bound the rule and are deliberately left alone.
  `app/settings.tsx`'s Coming-soon rows are the best-shaped example in the codebase —
  a real control, genuinely unavailable, with `disabled` paired to a label saying
  **why** ("Privacy policy — coming soon"). `DocumentHero` does the same for a
  document that needs a connection.
- The other ~81 are ordinary unavailable buttons where "dimmed" is correct.

That counterexample is why the CLAUDE.md entry is phrased as *"the tell is that the
chrome is suppressed in the same breath"* rather than as a ban on `disabled`. A rule
that reads "don't use `disabled` on rows" would have broken both correct sites.

## Decisions

| # | Decision |
|---|---|
| 1 | Item 1's premise is decidable from source + render tree; no device pass needed to justify the fix (one is still owed on the row, batching with #751's six checks). |
| 2 | Item 2 — leave the copy split. Registers differ because the surfaces differ; both unifications cost more than the inconsistency. |
| 3 | Item 3 — no change here. The real question is app-wide (CUL-727) and needs a device look before anything is spent. |
| 4 | `disabled` is an accessibility claim, not a chrome-suppression tool — added to CLAUDE.md § Code Conventions with its counterexamples. |

## Residuals

- **CUL-682** — items 2 and 3 ruled; the row's device pass is still owed and batches
  with #751's six checks.
- **CUL-726** — stage 2's confirm header truncates the *pet's* name (the type label
  is first, so the ellipsis always eats the name) with no label carrying it. Same
  class as item 1, one screen later, on the last surface before the write, and it
  affects every household rather than just single-pet ones.
- **CUL-727** — the app-wide grabber question.
- **CUL-728** — the two remaining `disabled`-as-suppression sites.

## Files

- `components/log/EventTypeSheet.tsx` — title row split by host; `TitleRowContent`
  extracted so the two hosts cannot drift.
- `components/log/EventTypeSheet.test.tsx` — 3 guards + 1 refactor-safety test.
- `CLAUDE.md` — § Code Conventions, the `disabled` entry.

`STATUS.md` untouched: no track started or ended, no standing hold changed, no build
phase moved, no pointer went stale.
