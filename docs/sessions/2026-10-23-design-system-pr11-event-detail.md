# Design system PR-11 — the event detail screen, built as its round ruled

**Date:** 2026-10-23
**One thing:** D5 L1 — What a reviewer looks for: the case your tests never built · check: pending

Shipped via #1314. Issue: [CUL-1912](https://linear.app/projectnyx/issue/CUL-1912), the build of the event detail design round ([CUL-1907](https://linear.app/projectnyx/issue/CUL-1907), every recommendation taken). Dispatched as PR-11, plan-gated; the PM typed the go in session.

## What shipped

**Commit 1** moved eight files onto the M1 kit with no ruled visible change. The files were the screen, the two analysis sections, the two field editors, the read card, the read section and the observation grid.
- Edit, Remove, Save, Cancel and Try again moved onto `PrimaryButton`.
- The section labels moved onto `SectionLabel`, the in-doubt pill onto `Badge`, and the editors' inputs onto `TextField`.
- The waits moved onto the Tick.
- Every hand-typed size moved onto the scale. The style ratchet fell by 1 font size, 4 line heights, 17 spacings, 2 radii, 5 WhorlSpinners and 14 hand-typed 44s.

**Commit 2** built the ruled picks:
- P1: Edit in the header, "Remove this vomit" as the last row, and no footer, which closes D-824.
- P2: one date-and-time line.
- P3 and P11: Home's ground and card surface, with dashed edges on every state that is not a read.
- P4: the rail in the gutter.
- P5: a 17pt verdict at every tier.
- P6: one foot row.
- P7: hairline rows.
- P10: a dashed add-photo tile.
- D-820: "The photo wasn't read", with the vet line.
- D-823: the off frame on the first frame.
- D-828: the strip keeps an absence's label and counts edits.

The incident spec's §4 gained the D-820 row, a Tier 2 edit the ruling approved.

The capture harness gained four capture-only read-state records, so every UI PR now photographs a Worth a call, a Keep an eye out, a consent-off record and a read that never landed. Before this, CI's one incident shot was a photoless vomit with no read.

## What broke and how

- **`code-reviewer`.**
  - The new header Edit was about 30pt wide, under the 44pt floor. It is fixed with a `minWidth`.
  - A `disabled` no state could reach was removed.
- **The captures.**
  - At AX5 the header Edit ran into the title. It is fixed by capping its text scale.
  - The consent-off frame still sat on its own grey box. It now sits inside the read's dashed frame.
  - The record line printed the date twice on old records. The "how long ago" clause now drops past a week.
- **Adversarial pass 1: FAIL, QUIET.** On an account that declined AI reading, an owner's Re-run under a stored Worth a call painted the off frame over the call for as long as the re-read ran.
  - Neither of the predicate's guards held. The re-run flag falls before the watch starts, and the phone marks its own copy pending.
  - Fixed: the off frame now paints only with no row behind it.
  - A test in each section reproduces the break against the old rule.
- **Adversarial pass 2: PASS.** It could not put the off frame over a held row by any path:
  - a re-run under a call or a calm read
  - a stale pending row
  - a realtime landing
  - a give-up
  - an add-photo re-read
  - a consent flip mid-visit
  - the floor preview

## Residuals and follow-ups

- [CUL-2185](https://linear.app/projectnyx/issue/CUL-2185): while loading, the off frame can say "wasn't read" about a photo read before the no, or over a failed fetch. It drops no warning compared with main's tick.
- [CUL-2181](https://linear.app/projectnyx/issue/CUL-2181): at AX5, screen titles and the date line overflow. Main already did this.
- [CUL-2182](https://linear.app/projectnyx/issue/CUL-2182): "Unclear" in the strip has the same missing referent.
- [CUL-2183](https://linear.app/projectnyx/issue/CUL-2183): the consent frame's dot and heading style.
- **Owed before merge:** one filmed sitting of the arrival (P4) and a device check of D-823. [CUL-823](https://linear.app/projectnyx/issue/CUL-823) is left out of the PR until that check.

## Teach

### One thing — What a reviewer looks for (D5, L1)
A reviewer's job is to find the case nobody built a test for. Our tests all passed, because each one checked a situation we had thought of. The reviewer went looking for the one we hadn't: an owner who had said no to AI reading, looking at a warning, and tapping Re-run. In that moment the screen swapped the warning for "AI reading is off".

**Like:** a fire drill. Every drill you planned goes fine. The inspector's value is asking "what if the alarm goes off while the stairwell door is propped open?", the one combination nobody rehearsed.

**In today's work:** `components/event/VomitAnalysisSection.tsx`, the off frame's rule
```
const offBeforeRow =
  hasPhoto && consent === 'declined' && !retrying &&
  (row === undefined || (working && row === null));
```
Before the fix the last line also allowed a row marked "pending", which is exactly what a Re-run creates over a warning that is already on screen. `!retrying` looked like the guard for that, but the app drops that flag a moment before the re-read starts.

**Why it matters to you as PM:** a green test suite tells you the cases someone imagined work. It says nothing about the ones nobody imagined, which is why the adversarial pass is required on safety screens and not optional.

**Check:** the fix keeps the off frame away from any record that already has a read on it. If someone later adds a new way for a record to lose its read row mid-visit (say, a "reset this read" button), would today's tests notice if the off frame started showing over a warning again? Why or why not?
