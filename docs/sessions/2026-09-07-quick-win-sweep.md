# Quick-win sweep — double-submit guards, the Remove confirm's photo, one epoch-day inverse, two guard/test fixes

**Date:** 2026-09-07

A `Quick Win` label sweep: fifteen candidates read in full, five built, six issues closed, one filed, four reconciled without code. Shipped via #811.

## What shipped

| Issue | Change |
|---|---|
| **CUL-822 + CUL-251** | `guardSubmit` on `app/log.tsx`'s simple/symptom confirm **and** weight confirm — the last two commit paths without a double-submit guard |
| **CUL-825** | `app/event/[id].tsx`'s Remove confirm names the photo it is about to destroy (CUL-645 parity), asking the record rather than component state |
| **CUL-393** | The last two private copies of `dayKeyFromIndex` deleted; the day-math guard extended to both files |
| **CUL-818** | `guards/ownerFacingCopy.test.ts` gains a shape-based bare-`.error` rule at the `<Text>`-child sink |
| **CUL-783** | `touchableToken` in `testUtils/tree.ts` — identity assertions that fail readably instead of OOMing the runner; 9 sites converted |

Filed, not built: **CUL-833** (a fourth private `owningTouchable` copy in `VomitAnalysisSection.test.tsx` that returns props rather than the node — CUL-710's consolidation, not this change).

318 suites / 6826 tests green, `tsc --noEmit` clean, all three CI checks green on the final head.

## The sweep's own findings

**Two issues were wrong about their own defect, and checking `file:line` first changed the work.**

- **CUL-818** claimed a `{row.error}` added to either incident section would ship green. Probing the live scanner before building gave a different answer: `Alert.alert('X', row.error)` was *already* caught by the bare-error rule under `immediate=true`. Only the `<Text>` child was open. That narrowed the fix from a broad rule sitting dangerously close to the Supabase `{ data, error }` shape down to a single opt-in sink.
- **CUL-393** described three private copies of the epoch-day inverse; `dietTrialOutcomeFacts` already delegated, so two remained. The issue's own TL;DR was the accurate half and its "Why" paragraph had aged.

**One issue was excluded on evidence a previous session had already left.** CUL-620 (tab bar `accessibilityRole="tab"`) reads like a one-word fix in the title. Its latest comment records a prior session verifying against the shipped RN source that `role="tab"` maps to `UIAccessibilityTraitNone`, so the item would *lose* the button trait, and that the "N of 4" positioning comes from `tabbar` on the container. That is a device-gated decision, not a mechanical change. The general form: **a comment can be the exclusion criterion, so read it before the code.**

**A suggested grep under-caught, and the issue that suggested it was the one it under-served.** CUL-783 proposes `grep 'toBe(owningTouchable('`, which finds 5 sites. A scan tolerant of newlines and of a variable bound to a host finds **9**, across 5 files — a multiline call and four `expect(from).not.toBe(to)` comparisons were invisible to the single-line form. Converting only the 5 would have left the same defect class half-open, which is how it survived CUL-710 in the first place.

## What broke, and how

**The CUL-825 fix shipped a regression, caught by `code-reviewer` and closed in `b719ffc`.**

`loadAll` sets `event` and only *then* awaits `getEventAttachment`, while the screen's full-render gate is `loading && !event`. The footer — Remove included — is therefore interactive for the whole span of that read, with `attachment` still `null`. The new confirm read that state, so a Remove tap inside the window printed the plain sentence over a genuinely photographed record: no warning, and the photo gone. Exactly the failure CUL-825 was opened to prevent, re-introduced by the change meant to close it.

This is the §C-12 ambiguity (*a read that hasn't answered is never an empty record*) reaching a surface that cannot tolerate it. The predicate `!!attachment` was not wrong — it is what the hero and the moment payload already use, and reusing it rather than re-deriving is normally right. **The new consumer was wrong.** For a renderer, `null`-while-loading resolves a frame later and costs nothing; for a one-shot destructive confirm the wrong answer is unrecoverable. The fix is a different question, not a better predicate: the confirm asks the record when the state cannot already answer yes, pays nothing on a hydrated record, and on a read failure falls back to the state rather than inventing a photo it cannot see.

**The part worth keeping:** the three tests written for that commit were all green over the defect. Their mocks resolve inside the same `waitFor` poll the assertion runs in, so the intermediate state never renders — a fixture that is *too* well-behaved reproduces the happy path and nothing else. Mutation proof answers "does this test detect the bug"; it cannot answer "is there a state my fixture never enters", and an async I/O boundary always raises that second question. The regression test holds the attachment read open across the tap, which is the only way to observe the window.

Recorded as a new paragraph under `docs/engineering-lessons.md` §C-12, with a one-clause extension to the CLAUDE.md rule.

## Decisions made

- **CUL-818's rule is opt-in at one sink, keyed on shape.** A property access (`row.error`) is a column read off a record; a bare identifier (`{error}`) is React state holding mapped copy and stays spared, as does `setFailureError(result.error)` everywhere else. It is safe at the `<Text>` child for the same reason that sink's own comment is written: an Error *object* there crashes RN, so anything surviving is a string. CUL-651 already falsified half that argument; this is the rest of the correction. A copy attribute (`label={row.error}`) is left spared and recorded as a known limit — that sink cannot make the object-crash argument.
- **CUL-393's guard extension went beyond the issue's ask, deliberately.** Closing the duplication without closing the *list* would fix the instance and leave the mechanism: `dietTrialOutcomeFacts`' inversion evaded the guard for exactly one reason, that the file was not on a list, and these two were not on a list either. `dietTrialFacts` is carved out of `DAY_MULTIPLICATION` because its one remaining multiply offsets a real instant by a duration and reads it back locally — genuinely not the forbidden shape.
- **`touchableToken` mints per host *instance* via a WeakMap, never from the label.** A label-derived token would make two buttons with identical labels compare equal, leaving the readable version a strictly *weaker* assertion than the one it replaces — the CUL-579 defect class going quiet, which is worse than the OOM it fixes.
- **`lib/utils.ts` was not edited** for CUL-393, though the issue suggested lifting into it. It sits in three Edge Functions' import closure, so a change there drifts their fingerprints and owes a deploy the standing holds cannot pay. Deleting copies costs nothing there.

## Reconciliation byproduct (no code)

- **CUL-724** — `Quick Win` label removed. Its own Shape paragraph lists five changes across three files, two device-gated, one (what a reactive-swap announcement should say) a Designer call. It is a small PR, not a sweep item, and carrying the label means every future sweep reads it in full and drops it again. Its natural pair is CUL-681's `EmptyState`, named in the issue.
- **CUL-705** — excluded on the decision filter, which its own body states ("the only genuinely open question"). A decision brief is on the issue: whether a failed pet-hero photo says so, or fails silent like the small discs. One ruling from being a clean quick win.
- **CUL-766** — excluded: device-gated by its own admission, and the remaining option is a motion change to CUL-601's arrival.
- **CUL-833** — filed.

## Residuals

- The `log_picker_v2` sheet path still has no Undo / Change time (the sibling half named in CUL-825). This change makes the record's confirm the equal of the card's, so that cohort is no longer served by the *weaker* of two doors — but it still has only one, and the PM ruling on firing the named card there stands.
- `testUtils/tree.ts` has no unit test of its own (noted by `code-reviewer` as a nit); it is exercised transitively by five consumer suites and held up under direct probing. Worth revisiting if the module grows.
