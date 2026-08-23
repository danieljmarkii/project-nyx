# CUL-599 — the parallel session, and the glyph tests it left behind

**Date:** 2026-08-23

Shipped via #705. One test file, no production code, no schema, no deploy.

This session built CUL-599 in full and shipped none of it. A **second session built the
same issue at the same time**, and its PR is the one that merged. What follows is the
collision, why it cost almost nothing, and the one gap it did leave — which is what this
PR closes.

## What happened

| | |
|---|---|
| `session_01HAh…` (this one) | branch `…-grfqhz` → PR **#701**, opened 00:10:16 UTC |
| `session_01Sd7…` | branch `…-wiw7wk` → PR **#702**, opened 00:10:31 UTC |

**Fifteen seconds apart.** Neither branch existed when the other session ran its
orientation, so neither had anything to notice. Both sessions read the same spec, took
the same two rulings, and produced two complete, tested, CI-green implementations of the
same tab bar. The PM merged #702 at 11:33 UTC; #701 was closed as superseded.

By the time this session was asked to "wrap and merge", `main` had moved three commits
on — #700 (CUL-604, haptics), #702, #703 (CUL-606, the named card) — and #701's branch,
cut before any of them, would have **reverted #700 and #703** had it merged. GitHub had
it at `mergeable_state: dirty`. That is the finding worth carrying forward: a stale
duplicate branch is not a no-op merge, it is a revert wearing a feature's PR title.

## Why the duplication cost almost nothing

The two implementations converged on nearly everything that mattered — same ladder, same
rungs, same a11y contract, same decision to measure with a synchronous character budget
rather than `onTextLayout`, same reasoning about why. Where they diverged, **#702 was the
better of the pair**, and specifically on the thing the ladder exists to prevent:

- It models the label's own **letter spacing** in the budget and charges **astral code
  points and accented capitals** their real advances. Its record names a six-character
  Japanese name that passed this session's fit test and would then have been tail-cut —
  the one outcome D2 forbids outright. (This session's budget did guard CJK, via a
  code-point threshold; it did not guard `Ü`.)
- Its **4% headroom** is calibrated against the mock's own stated figure ("at the
  narrowest supported width a tab fits ~12 characters"), which is a better anchor than
  this session's derivation from "6pt of side padding", and its test says so out loud —
  including that the measured number is nearer 10 than 12 once tracking is charged, and
  that the difference falls on the safe side.
- It found that three other surfaces — both completion cards and the Snackbar — each
  carried their own copy of the bar's height as `Platform.OS === 'ios' ? 80 : 60`,
  commented "tab bar height from `app/(tabs)/_layout.tsx`". Changing the bar would have
  made all three silently wrong. It exported `TAB_HEIGHT` and fixed all four.

The traffic was not one-way: `navGlyphs.tsx` on `main` carries **this session's bowl
correction**, ported verbatim and credited to #701 in its comment.

## The gap this PR closes

`main` has **no test** over `components/nav/navGlyphs.tsx` or
`components/glyphs/GlyphSvg.tsx`. Two things are consequently unguarded.

**The wrapper's whole reason for existing.** `GlyphSvg` was hoisted out of
`eventGlyphs.tsx` on the argument — stated in its own header — that "a second copy is how
two families quietly stop matching". Nothing enforced it. The test asserts the drawn
**result**: a nav glyph and an event glyph render identical line attributes. That is
deliberately a property assertion rather than an object-identity one (`eventGlyphs` no
longer re-exports the wrapper, so identity is not reachable — but it is also the weaker
test: forking the wrapper while keeping the values identical breaks nothing, and letting
one family drift is the actual failure).

**The bowl, against its own file header.** `navGlyphs.tsx` opens with *"The paths are
VERBATIM from the design authority… do not redraw them here — a change to the drawing is
a mock round, not an edit."* The bowl is the one path that deliberately is not: the mock
put its base line at y=20 against a body reaching y=21, so at 22pt the line crossed the
bowl's interior and read as a fill level rather than a base. A reader who trusts the
header over the exception — which is what a header is for — restores the mock's geometry
in good faith and the defect returns.

So the guard is geometric, not a string match: it parses the rim and radius out of the
body path and the y out of the base line, and asserts the base sits below `rim + radius`.
**Verified by reintroducing the defect** — restoring the mock's exact `M4 13h16a8 8 0 0
1-16 0Z` + `M9 20h6` fails that one assertion and only that one; reverting returns 13/13.
A guard nobody has watched fail is a guard nobody should trust.

Also covered: house-line conformance per glyph, prop pass-through, mutual distinctness
(no glyph masquerading as another), the mark staying inside the 24 box, and a no-`transform`
assertion — the mock reached its position with `translate(0 2)`, which would also sit the
bowl low against its siblings now that all four tabs share one icon slot.

Thirteen cases. Full suite **254 suites / 5589 tests**, `tsc --noEmit` clean.

## The process finding

The repo's collision guardrails all cover *files* — per-session records, `STATUS.md`
reduced to a pointer card, the minimise-the-diff rule. None covers the **issue**. Nothing
stopped two sessions taking the same `CUL-NNN` a quarter-minute apart, and no amount of
orientation would have: at 00:10:16 there was nothing to find.

The cheap fix already exists in the manual, one step too late. Both sessions moved
CUL-599 to `In Progress`/`In Review` when they opened a PR — ten minutes after starting.
Moving it at session *start*, before planning, turns the second session's orientation
into a check that can actually fire. Filed as **CUL-624** (Backlog → Linear: operationalize
the cutover), with the residual it has to answer: a session that claims an issue and then
dies leaves it looking taken. That is strictly better than the current failure mode — the
backlog-groomer skill already flags a stale `In Progress`, whereas today's collision is
invisible until two PRs land.

## Residual

`accessibilityRole` on the tabs is `"button"` rather than `"tab"` — pre-existing,
unchanged by either implementation, and out of scope for a test-only PR. It belongs with
the tap-target batch (CUL-579).
