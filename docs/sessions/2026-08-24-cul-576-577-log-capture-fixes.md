# CUL-576 + CUL-577 — log-capture: clock provenance and photo permissions

**Date:** 2026-08-24

Shipped via #720. The defect-wave pairing the App Polish spec's §9 plans as one
session ("CUL-576+CUL-577 — one session — both log-capture fixes"). Client-only per
§8: no schema, no Edge Function, no flag, no deploy — the standing `generate-report`
hold is untouched. Both fixes live in `app/log.tsx` and
`components/log/SimpleEventConfirm.tsx`.

## The headline: CUL-576's fix shape was inverted, and its predicate was dead

The issue asked to re-stamp `occurred_at` at save, mirroring the meal path, keyed on
`source !== 'manual'/'exif'`. Two things were wrong with that before any judgment
call: **`occurredAtSource` defaults to `'manual'`**, so the predicate could never
fire; and the meal path is not the precedent it looks like. Its own comment says why
it may re-stamp — on that one-tap path *"the user never saw the time picker"*.

On these screens the time **is** on screen: `/log` renders it in the time row, and the
confirm renders it in the summary pill, which `nyx-more-events-picker-requirements.md`
§0 makes *the save* ("the summary pill IS the save"). A save-time re-stamp therefore
commits a value the owner was never shown, and breaks a design-locked rule to do it.

And the accuracy argument runs the other way. **A symptom is logged *because* it just
happened**, so the screen opens *after* the event and every passing second moves the
clock away from it. Dog vomits at 5:33, owner opens at 5:33:30, fumbles for a photo,
saves at 5:35:30: mount is 30s off, save is 2.5 min off. The audit's F18 is a single
line with no worked scenario behind it, and the scenario is what decides it.

PM deferred to the recommendation. What shipped instead is two fixes.

## Fix 1 — the provenance (not in the issue at all)

`occurredAtSource` now seeds `'now'`, not `'manual'`.

Migration 007 defines `'now'` as *"was auto-stamped to `now()`"* — precisely this
case — while `'manual'` is the app asserting a **human chose** this timestamp. Nobody
did; the app did, at mount. Every symptom and weight logged on the default clock has
been claiming otherwise, on the column that exists (per `lib/eventTimeEdit.ts`, B-525)
so the vet report and correlation engine can tell a witnessed-now log from an owner
backfill.

Worth stating plainly because it is what makes the fix cheap: **this is not a new
state.** Meals already write `'now'`, no Edge Function reads the column, and no client
surface branches on it except the EXIF attribution line (which is `'exif'`-gated). So
it is a record-fidelity fix with no rendered change and no deploy. Existing rows are
unrecoverable — `source` alone cannot separate a real manual backfill from a defaulted
one retroactively — so no re-key was attempted.

This is the same class as B-525 seen from the other side. That one found a picker edit
keeping a stale `'now'`; this one found the clock default wearing a `'manual'` it never
earned.

## Fix 2 — the staleness, re-derived on re-entry

One pure predicate, `lib/eventTimeEdit.ts::refreshedNowPoint`, shared by both surfaces
— the house doctrine that file's own header states ("living here rather than in a
handler means it is pinned by a test instead of by two screens remembering to agree").
Only a `'now'` point is re-derived: an owner-set time and a photo's EXIF stamp both
outrank the wall clock.

Re-entry means two moments: returning from the photo picker, and the app returning to
the foreground (`hooks/useAppActive`, rising edge). Display and write never diverge,
so the pill stays the save.

An **in-flight latch** keeps the foreground effect out of the photo path. iOS makes
the app `inactive` while a picker is up, so on return both mechanisms fire and the
effect could clobber a real EXIF stamp with the wall clock. The latch consumes the
rising edge *before* the guard, deliberately — a skip means the photo path owns the
point on that trip, not that a re-derive is owed later.

One thing fell out that the issue could not have predicted: **CUL-612's discard guard
had to change.** Its baseline comment promised "an unattended sheet does not become
dirty as the clock moves" — which was free while the clock never moved. It now
compares the **source**: while a point is `'now'` it is the app's standing assumption
rather than the owner's work, so it stays out of the draft entirely. Without that, a
restored sheet nobody had edited would meet a discard dialog.

## CUL-577 — the permission order, and the half not built

Both handlers asked for the **media-library** grant up front and bailed *before* the
source chooser appeared, so an owner who had denied Photos could never take a camera
photo. On a vomit or stool log that photo is the payload the per-incident AI read runs
on (`lib/simpleEvent`), so a library denial cost the clinical half of the log.

Chooser first, then only the chosen source's permission — the shape seven other call
sites already used; these two were the outliers, and they were the two that mattered
most.

Extracted to **`lib/photoSource.ts`** rather than fixed twice in place, for a reason
worth remembering: the rule was duplicated across both surfaces, and the one that is
**not** behind a beta flag (`app/log.tsx` — `log_picker_v2` is seeded dark) is the one
with **no test file**. Sharing the rule is what put the live path under the same
coverage as the dark one. Writing it down surfaced two more things: each denial can now
name the other source (only honest *after* this fix — before it, a denial on one path
really was a denial on both), and the chooser resolves on an Android back-gesture
dismiss, without which the attach row deadens until the screen is torn down.

**The secondary ask was deliberately not built.** The issue calls the native `Alert`
chooser undesigned and points at `food-capture`'s two-button intro. That file
(`:250-255`) documents the rule the other way round: on-screen buttons **where there
is screen room**, action sheet **for a single CTA** — and deliberately keeps the sheet
for the latter. The log surfaces are single-CTA attach rows, so the sheet is already
the sanctioned shape. Building a designed chooser would also be a visible change to a
`log_picker_v2` surface, needing mock frames under "Mock what you change" — an Effort-S
defect fix turning into a mock round. Flagged on the issue as a PM call and its own
issue if wanted.

Both photo entry points also gained explicit error handling; they are floating promises
at `onPress`, so a rejecting picker was an unhandled rejection and a row that silently
did nothing.

## Adversarial pass

The counterexamples tried, and why the logic held:

- **Back-dated log + background.** Owner sets yesterday 9pm (`'manual'`), phone
  backgrounds, returns. Point untouched. **Held** — this would have been a silent
  re-dating of clinical history.
- **EXIF photo racing the foreground event.** **Held** by the latch (above).
- **Re-entry while in "Found it".** The found path derives `occurred_at` from the
  window's *latest* edge; a leaking point would widen a discovery bound the owner
  already asserted — a **stronger** claim than the record holds (the B-448 direction).
  **Held**: `buildTimeFields` ignores the point there. Pinned by a test.
- **Discard guard.** Caught, and fixed as described.

Two sibling mount-stamps were deliberately **not** swept: `foundLatest` and
`estimatedAt` re-seed on mode change and route to `source: 'manual'`, and — the real
reason — a *later* discovery bound is a **weaker** claim, so freshening them would
widen a window past what the owner asserted. Checked rather than assumed, which is the
point.

## Process note

The one testing lesson worth carrying: the first version of the re-entry test helper
**passed while testing nothing**. It reused a single React element across `rerender`,
and React bails out of re-rendering a subtree handed a referentially identical element
— so the mocked `useAppActive` was never re-read. It only surfaced because the
assertion was written to fail first. Same family as CUL-613's guard lesson: a test that
has only ever been green has not been tested.

## Base drift

Five PRs landed on `main` while this was in flight (#715–#719), one of which —
**CUL-611**, the Geist closing audit — swept *both* of this session's files. `main`
was merged in and the result verified rather than assumed: the auto-merge was clean
textually, but a clean text merge over a sweep that rewrites `Text` → `ThemedText` in
the same functions proves nothing on its own. All eight of this session's files came
through intact and CUL-611's new `guards/geistRollout.test.ts` passes over them.

## Verification

`tsc --noEmit` clean. Full suite **268 suites / 5884 tests** green post-merge (262 /
5814 pre-merge), 20 new
(`lib/eventTimeEdit`, `lib/photoSource`, the confirm). `guards/ownerFacingCopy.test.ts`
green over the new denial copy (nyx-voice Pattern 8: plain cause, calm, a concrete next
action). **On-device pass not run** — this is static/unit verification only, and the
permission behaviour in particular can only really be judged on a device with the
grants actually denied.
