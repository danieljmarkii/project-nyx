# CUL-621 — the meal and dose cards adopt the shared TimeEditSheet

**Date:** 2026-08-29

Finishes the strangler CUL-606 started. `MealCompletionCard` and
`MedicationCompletionCard` each carried their own inline copy of the "Change
time" `DateTimePicker` modal; both are deleted and both now render the shared
`components/ui/TimeEditSheet`, which until today had exactly one caller.

Shipped via #739.

## What the issue got wrong, and why it mattered

Two of the issue's premises did not survive contact with the tree, and the
second one changed the shape of the work.

**The Geist note was stale.** The issue suggested this could ride CUL-609's
sweep because the inline sheets used raw `<Text>`. They did not — the sweep had
already reached both cards, and every string in both inline modals was already
a `ThemedText`. Nothing to ride.

**It was not pure duplication.** The issue described "the same ~50 lines twice",
which is true of the two incumbents relative to *each other* — they were
byte-identical. But `TimeEditSheet` was written fresh in #703 rather than
copy-pasted from them, and it had drifted on eight points:

| | meal + dose (shipped) | `TimeEditSheet` |
|---|---|---|
| chrome | inset floating card, `radiusMedium`, `shadows.lg` | edge-to-edge bottom sheet, `radiusLarge` top corners |
| title | `textLG` | `textMD` |
| Save colour | `colorAccent` #00C2A8 — **~2.3:1 on white, sub-AA** | `colorAccentInk` #0B7B6C (~5:1) |
| disabled | `theme.opacityDisabled` | hardcoded `0.5` |
| `accessibilityRole` | absent on Cancel/Save | present |
| `maximumDate` | `new Date()` per render — a live clock | pinned at mount |
| Android | closed the sheet on any change event | absent |
| draft state | owned by the card | owned by the sheet |

So "adopt the shared component" was a **visible change to two shipped
surfaces**, not a silent refactor — and the PM had to rule on it rather than
discover it in a build. Presented as a decision brief; **ruled A: adopt
`TimeEditSheet`'s presentation as-is.** The deciding argument was that
`ScopeMenu` and `AddTrialFoodSheet` are both edge-to-edge with `radiusLarge`
top corners, so the shared sheet is the house pattern and the two incumbents
were the outlier. Convergence is the polish track's thesis, and the "after" was
already-approved shipped UI, so no new mock round was cut.

Three fixes ride along for free: the sub-AA Save label becomes AA, Cancel and
Save gain a real button role, and `maximumDate` stops reading a live clock.

## The generalisable bit: a test that is green from birth has not been tested

CLAUDE.md's CUL-613 rule says to run a new guard against the tree it was written
for. This session is the second time that rule paid, and the first time it paid
*twice in one file*.

Neither incumbent had **any** coverage of its picker — so a blind swap on the
app's best-loved surface was exactly what was on offer. The new tests were
therefore written **first, against the pre-change tree**, and split by what they
are for:

- **Refactor-safety** (must pass *before and after*): the question asked, the
  three fields written, Cancel writing nothing, the card dismissing on save.
  Three of these passed pre-change, which is the point — they capture today's
  behaviour so the swap has something to be measured against. This is the
  inverse of a guard, and the direction matters: a refactor test that goes red
  before the change is not describing the behaviour you are preserving.
- **Adoption-proving** (red before, green after): `getByRole('button', …)` on
  Cancel and Save. Confirmed failing on both cards pre-change.

Then `TimeEditSheet.test.tsx`, which did not exist. Its two guard-shaped tests
pin the details the component's own header calls load-bearing — the
empty-`onPress` `Pressable` and the pinned `maximumDate` — and **both were
mutation-checked**: the Pressable was replaced with a `View`, and `maximumDate`
was made to read a live clock, each in turn, to confirm the test went red.

The first version of the Pressable test **did not**. It pressed the title and
asserted `onCancel` was not called, and it passed just as happily with the
Pressable deleted — because an inert label calls nothing either way. A negative
assertion over a synthetic press is trivially true. The rewrite uses the CUL-579
ancestor walk instead: from the title, walk **up** to the nearest host owning a
press responder, and fail on `null`. That discriminates, and the mutation
confirms it does.

Worth stating plainly, because the near-miss is the transferable part: *the
test was written specifically to protect a documented, load-bearing detail, by
someone who knew exactly what the defect was, and it still did not detect that
defect.* Being green is not evidence. Only the mutation is.

## Scope held

Three things were found and **filed rather than folded in** — one PR per
session, and this diff was already a swap on a beloved surface:

- **CUL-701** — both cards stamp `occurred_at_source: 'manual'` on a
  peek-and-save that changed nothing. The CUL-576 class, and precisely the
  defect CUL-606's adversarial pass fixed on the named card via
  `sourceAfterPointEdit`. Prior source is `'now'`, not `'exif'`, so it is a
  false provenance claim rather than data loss — which is why it is a separate
  issue and not a blocker on this one.
- **CUL-703** — the always-`null` `severity`/`notes` still passed to
  `updateEvent` (named by the issue itself as separate work). Harmless today
  only because neither path writes an owner note; latent the day one does.
- **CUL-702** — the Android picker. The deleted line dismissed the sheet
  *without saving*, so the edit was discarded; the shared sheet keeps the picker
  mounted, which on Android can re-open the dialog. Neither is right, the fix is
  a sequential date→time flow, and nobody can verify it without an Android
  build. Parked at Low while the shipping target is iOS.

Other `DateTimePicker` call sites (`app/log.tsx`, `TimeConfidenceField`, the
profile modals, the onboarding DOB picker) are different surfaces, not copies of
this sheet. Deliberately untouched.

## Decisions

- **The presentation converges on `TimeEditSheet`** (PM, option A). The house
  bottom-sheet shape wins over the incumbents' inset card.
- **`TimeEditSheet` mounts conditionally, and that is now a documented
  contract.** `visible` is hardcoded on its `Modal`, so the *mount* is what pins
  `maximumDate` to open-time; a caller rendering it unconditionally would pin
  the maximum to card-mount instead. Written into the component header, because
  it is the kind of coupling a future caller would otherwise have to rediscover.
- **The title stays per-card.** A meal asks "When did this happen?", a dose asks
  "When was this dose given?" — not because the two differ in kind (both are
  witnessed points), but because `title` is required precisely so a caller
  cannot *inherit* a question that may not match its field. That requirement is
  CUL-606's adversarial finding, and letting the dose card fall back to the meal
  card's wording would erode it by habit.
- **`0.5` → `theme.opacityDisabled`** in `TimeEditSheet` — a token violation the
  incumbents did not have, and adopting would have spread.
