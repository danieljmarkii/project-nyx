# CUL-604 — `lib/haptics.ts`: the seven-verb vocabulary, wired into the existing beats

**Date:** 2026-08-22

Shipped via #700. PR 1 of 5 in the completion-system chain (CUL-603). No schema, no
deploy, no flag, no visual change.

## The problem, stated precisely

The product had **zero haptics**. Not "inconsistent haptics" — none at all, on any
surface, including the six confirmation registers the completion chain exists to
converge. Every commit, every chip, every destructive confirm was silent.

That is the surface reason. The reason this is PR 1 rather than a polish item bolted
on at the end is that a haptic vocabulary is exactly the kind of thing that arrives
*wrong* if it arrives incrementally: each screen reaches for whichever `expo-haptics`
constant looks right in isolation, and the tone rules — the ones with clinical weight
— never exist as anything a reviewer can point at.

## What was built

`lib/haptics.ts`: six exported verbs, named for **moments rather than patterns**.
Call sites say `commitSymptom()`; they never say `impactAsync(Soft)`.

That is not stylistic. `impactAsync(Soft)` and `notificationAsync(Success)` look
equally reasonable in a diff — nothing about the raw constants tells a reviewer that
swapping one for the other on a symptom path is a clinical error. `commitSymptom()`
vs `commitRoutine()` does. The naming is the enforcement mechanism for the two rules
below, and the rest of the module exists to make those rules hard to break.

### Rule 1 — a symptom commit is not a success

Routine commits play the system success notification (the soft double-tap owners
already read as "done, nicely"). A symptom commit plays a single soft impact.

We acknowledge a 2am vomit log; we never congratulate it. This is the same reasoning
that already withholds the gold glow from the `calm` beat — the haptic layer is being
made to agree with a decision the visual layer took in 2026-06.

The implementation detail that matters most here is what it *didn't* do: it did not
invent a second symptom predicate. `SYMPTOM_TYPES` already carries the clinical
decision about which event types are symptoms, and both `app/log.tsx` and
`EventTypeSheet` already derive the beat's tone from it. The haptic reads the
payload's **existing tone** and routes on that. A second predicate here would be the
diet-trial §5.3 mistake in miniature — two definitions of the same clinical fact,
free to drift, with the drift invisible until it matters.

### Rule 2 — silence on safety, by rule

A safety card arriving, or a red-flag AI read landing, gets **no haptic**. Plainness
is the severity signal (`nyx-signal-home-requirements.md` S1), and a buzz on bad news
is the phone rewarding the owner for it.

An absence is the single hardest kind of rule to hold through code review, because
**nothing in a diff that adds `commitRoutine()` to a safety card looks wrong**. It
looks like consistency. That is how it would actually arrive — not as a mistake, as a
tidy-up.

So it is enforced structurally, in two layers:

- The module **exports no verb a safety surface could reasonably call**. There is no
  `safetyArrival()`. `lib/haptics.test.ts` pins the export list, so adding one is a
  visible, argued change rather than a slip.
- `guards/haptics.test.ts` fails the build if a safety surface **imports the module at
  all**. It is a source scan in the `widgets/CulpritWidget.test.ts` /
  `guards/ownerFacingCopy.test.ts` shape.

The guard **derives** its scan set rather than hard-coding one: any `components/*.tsx`
whose source carries a safety marker (`priorityClass`, `INSIGHT_RENDERERS`,
`event_ai_analysis`, `useCrossPetSafetyBanner`, `safetyFlag`) is in scope, plus five
always-scanned files whose silence is load-bearing enough that a rename must not
quietly drop them. A hard-coded list has one failure mode — the *next* safety
renderer, written by someone who never read this doc — and deriving the set closes it.

Screens under `app/` are deliberately **out** of scope. They compose safety components
alongside everything else (Home hosts the cross-pet banner *and* the pull-to-refresh
gesture in one file), so a screen-level import proves nothing about what the safety
surface itself plays. The arrival beat this rule governs would live in the component.

Escape hatch: an inline `// haptics-guard-ok: <reason>`, reason mandatory — the
`LOCAL_WIPE_TABLES` / `NOT_WIPED_ON_SIGN_OUT` discipline. Reaching for it on a safety
surface should feel like the argument it is.

### Cosmetic, never fatal

A haptic sits beside the critical path of a health write. Every verb is
fire-and-forget with both rejections *and* synchronous throws swallowed, and returns
`void` rather than a promise — so no caller can accidentally `await` a decorative
effect into their write path. A busy taptic engine, an unlinked native module, or web
must all still let the log land.

## Where the haptic fires, and why there

The commit haptic fires inside `momentStore`'s `present()` **reveal**, not at each
call site. Three consequences, all deliberate:

1. **A future log path inherits its haptic with its card.** This is the same
   can't-forget reasoning that already puts `MEAL_FLAGGED_DURATION_MS` inside
   `showMeal` rather than at its callers.
2. **It rides the reveal, so it lands with its own card.** The picker path defers the
   card ~450ms behind the dismissing `/log` modal. Firing at call time would put the
   buzz half a second ahead of the thing it is confirming, which reads as a stray one.
3. **A superseded card plays nothing.** A second log during the delay clears the
   pending reveal, so the first card's haptic never fires. One commit, one buzz.

Also wired, per the §5.6 table: the in-sheet beat (`SheetLogBeat`, which bypasses the
store entirely and so plays its own, on the same tone split), chip selects, FAB open,
pet switch, pull-to-refresh thresholds, and confirmed destructive actions.

Two smaller calls worth recording:

- **Destructive fires on the CONFIRM, never on the button that opens it.** A haptic
  beside a live Cancel would tell the owner something was destroyed while they can
  still back out.
- **The beat's haptic sits outside the reduced-motion branch.** Touch is not motion —
  the §1 rule, applied here too. Reduce Motion suppresses the spring, not the tap.

## Verification

`tsc --noEmit` clean. `jest --ci`: **248 suites / 5454 tests green**.

The falsification worth naming, because a fixture passing its own detector proves
little: the guard was pointed at a **real** regression — a `commitRoutine` import
added to the actual `components/home/InsightCard.tsx`, the real Signal card — and it
failed, naming the file and line. Restored, green again. That is the check that says
the guard covers the surface it claims to.

The symptom-≠-success rule is asserted as **two different expo-haptics APIs**, so the
"both are commits, share the verb" refactor fails the build rather than shipping.

## Known limits

- **jest asserts against a mock.** Nothing here proves a device actually buzzes, or
  that the two commit patterns are *distinguishable by feel* — which is the whole
  point of rule 1. The on-device pass (PR #700's checklist) is the real verification,
  and it needs a **native build**: `expo-haptics` is a native module, so this rides
  the next A-Native TestFlight cut, not an OTA.
- **Inherited, not decided here:** `stool_normal` takes the `celebrate` tone and
  therefore the success pattern. That is the shipped visual-tone call in
  `EventTypeSheet`; this PR follows it rather than re-opening it. If it reads wrong on
  device, CUL-614's copy/guardrails pass is where it belongs.
- **The guard is syntactic.** It catches an import, not an arbitrary data flow — a
  haptic routed into a safety component through a prop from its parent would pass.
  Same documented class of limit as `ownerFacingCopy.test.ts`. Widen it if a real miss
  appears.

## One flag for the PM

**The spec is not on `main`.** `docs/nyx-app-polish-requirements.md` — the build
contract for this whole track, §5.6 included — exists only on
`claude/design-ux-opportunities-raxh71` (commit `ebf377c0`), alongside the mock rounds
and the CLAUDE.md Read-These row. This session read it from that branch and built
against it.

Nothing about this PR depends on that file landing, but a reviewer on `main` cannot
find the spec any assertion here cites, and **every remaining PR in the Aug. 2026
Design Polish track has the same problem**. Landing the CUL-580 design-record PR is
the cheap fix, and it should probably happen before the next one of these.

## Scope held

Out, per §5's PR split, and deliberately not folded in: Undo (CUL-612), the MedStrip
confirm's mark + haptic and the dwell-pause-while-touched (CUL-614), and any change to
card anatomy (CUL-606). PR 1 is a foundation; it earns its keep by changing nothing
visible.
