# 2026-08-28 — Saw it / Found it segments: the shared hit band (CUL-657)

**Mode:** BUILD · **Outcome:** shipped via #733 (draft) · **Track:** Aug. 2026 Design Polish

## What this was

`TimeConfidenceField`'s **"Saw it happen" / "Found it"** segmented control is two `flex: 1`
siblings sitting **flush** — no gap, inside an `overflow: hidden` bordered container — and each
carried both `minHeight: 44` **and** `hitSlop={8}`.

The `minHeight` already put each segment at the floor across half the width, so the slop bought
no reach. What it bought was an **overlap**: each expanded rectangle reached 8pt past its inner
edge, so the two shared a **16pt band centred on the divider**, where a tap resolves by
**z-order** rather than by intent — the CUL-612 rule, in its worst placement, since the
ambiguous band is dead centre of a two-option control.

The stake is not cosmetic: this is the top-level witnessed-vs-discovered classifier, so a
mis-resolved tap records a **witnessed** event as a **discovery window** or the reverse. That is
the B-448 confidence-leak class, and the vet report prints the difference.

## What was built

- `components/log/TimeConfidenceField.tsx` — deleted `hitSlop={8}` from both segment
  `TouchableOpacity`s; added the absence-comment.
- `components/log/TimeConfidenceField.test.tsx` — extended the existing *"claims no reach into
  its neighbours"* assertion (until now scoped to the three radio rows on purpose, carrying a
  note pointing at exactly this control) to cover the segments: `neither segment carries
  hitSlop`, `the segments are flush — there is no gap for slop to spend`, and `each segment
  selects its own mode`. Removed the now-stale "deliberately NOT fixed here" note.

No layout change, no behaviour change beyond removing the ambiguity. Nothing was lost, because
the rows were already at the floor.

## Decisions made

**The absence-comment states the rule in its general form, not the instance.** This is the third
application of the same fix in this one file — `FieldRow` and the three radio rows both shipped
it under CUL-579 (#715) — but the earlier two are *not* the same case. Those had a gap the slop
was **overspending**; these are **flush**, so *every* point of slop reaches into the neighbour.

So the comment says: **flush siblings get no slop at all — there is no gap to spend.** That is
the CUL-579 "pick the tool by the geometry, not by habit" rule seen from its third angle, and
stating it generally is what stops the next contributor reading "44pt floor" from adding the
prop back for the reason it was added the first time.

**A second assertion pins the geometry the rule rests on.** `the segments are flush` fails if a
later redesign puts real space between them — which is the moment to *re-derive* the rule rather
than inherit it, since at a sufficient gap the slop would become legitimate again. The row is
located by a `commonAncestor` walk derived from the tree, not a fixed number of `.parent` hops,
so it cannot quietly start measuring a different element after a refactor.

## Persona flags raised

None. No conflict — this is the third instance of a fix the PM has already approved twice in
this file, and the issue itself names the change and its shape.

## Open questions surfaced

None. None resolved.

## Known issues / tech debt

**CUL-688 filed, deliberately not folded in.** `SimpleEventConfirm`'s found-mode radio rows (the
`log_picker_v2` flag-on twin, `:447` / `:453`) are `minHeight: **40**` — *under* the floor — sit
in a `windowPanel` with `gap: theme.space0_5` = **4pt**, and carry `hitSlop={8}` each. Facing
reach `8 + 8 = 16pt` across a 4pt gap → a **12pt shared band**, on the *same* confidence
classifier ("Sometime before" vs "Between two times"), on the **shipping-forward** surface that
outlives the path fixed here.

It is a genuinely different fix, which is why it is its own issue rather than a widening of this
PR: the slop there is doing **real vertical work** under the floor and cannot simply be deleted.
The CUL-579 remedy applies — **grow the box** to `minHeight: 44` and drop the slop — which
changes layout rather than removing a prop.

**One smaller residual, not filed:** the `Change` link on the witnessed time row is a bare text
label with `hitSlop={12}` — roughly 41pt tall, marginally under the floor. It is *not* this
issue's class (its facing neighbour is an inert `Text`, so there is no ambiguity to resolve, and
the row's own `minHeight: 44` gives it vertical room), and CUL-688's scope is the radio rows. Worth
a look whenever the next tap-target pass reaches this file.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npx jest --ci` | **274 suites / 5993 tests**, all passing |
| New assertions vs. pre-fix tree (CUL-613) | both confirmed **red** first — see below |

Per the CUL-613 rule — *a guard that has only ever been green has not been tested* — each new
assertion was run against the tree it was written for:

- `hitSlop={8}` restored on both segments → ✕ `neither segment carries hitSlop`, and **only**
  that test failed.
- `gap: 16` added to `styles.seg` → ✕ `the segments are flush`, and **only** that test failed.

That second run matters as much as the first: it proves the flush assertion is reading the
segments' actual parent rather than passing vacuously on some other node.

The identity walk (`owningTouchable`), not `fireEvent.press`, is what carries the first
assertion — this same file already records why, having learned it the hard way during CUL-579.

## PM action items

None. **CUL-688** is filed as ordinary scheduled work (Medium, `Todo`, Aug. 2026 Design Polish),
not a decision request — it carries no `Waiting on PM` label because nothing about it needs a
ruling.

## Recommended next steps

1. **Review + merge #733.** Self-contained; the only thing a device adds is confirming the
   divider-band behaviour by thumb, which a jest tree structurally cannot prove.
2. **CUL-688** — the flag-on twin. Independent of this PR (different file), so it can run
   concurrently; it is the more consequential of the two, since it is the surface that ships
   forward.
3. The rest of the Aug. 2026 Design Polish run order, per the project description in Linear.
