# More-events picker PR 3 — the one-surface confirm (B-745)

**Date:** 2026-08-13

Parallel track (not Step 10). B-745 PR 3 — the last PR in the design-locked plan (`docs/nyx-more-events-picker-requirements.md` v1.0; round-4 mock the design authority). PRs 0–2 shipped earlier the same day (#632/#633/#634). This makes **symptoms + Other complete inside the sheet** when `log_picker_v2` is live: the picker grid morphs in place to the teal confirm, the live summary pill is the save, and the completion beat lands in the sheet — Home never leaves.

## What shipped

- **`lib/simpleEvent.ts` (`insertSimpleEvent`) — the shared non-meal write.** The event row (B-010 time fields) + the optional photo attachment + its per-incident AI-read trigger (vomit → `analyze-vomit`, both stool types → `analyze-stool`, unchanged) + the sync push + the Signal regen, in one place. Extracted from `app/log.tsx`'s `handleConfirm` non-meal branch so the full-screen `/log` flow and the new in-sheet confirm can't drift (the insertMeal rationale). `app/log.tsx` now calls it; its inline INSERT, the shared photo block, and the non-meal sync/regen tail were removed (the meal path — `insertMeal` — is untouched; meals never carried a photo, so removing the shared photo block changed nothing for them). One deliberate improvement over the old inline code: a photo-row failure is now best-effort and never fails a **committed** event (so a photo hiccup can't send the owner to re-log and duplicate the record).
- **`lib/logCopy.ts` — the confirm copy.** `summarizeSimpleEvent` (the pill sentence) + `confirmTimeRowLabel` (the row label), both deriving window wording from `describeOccurredAt` (lib/utils) so the pill can **never drift from the History row** the same event will show (the diet-trial "one predicate" doctrine, applied to copy).
- **`lib/eventTimeEdit.ts` — `buildTimeFields` extracted.** The B-010 control-state → (occurred_at, confidence, bounds) reduction moved out of `app/log.tsx` (which now delegates) so both entry points derive one row from one function. Property-style tests added.
- **`components/log/SimpleEventConfirm.tsx` — the confirm form.** Header (glyph + "{Type} — {Pet}" + back), the time pill row + Saw it/Found it chips, the inline window editor, the dashed photo row, the note, and the live summary-pill save. Owns time/photo/note state; does the write via `insertSimpleEvent` + optimistic `prependEvent`; calls `onLogged`.
- **`components/log/SheetLogBeat.tsx` — the in-sheet completion beat.** A compact, self-contained sibling of the root `<CompletionMoment/>` (mint check ring + gold glow on `celebrate`, plain on `calm`; reduced-motion static frame). Deliberately NOT a refactor of the shipped root component — that one is `absoluteFill` at the app root and renders UNDER the sheet Modal, which is exactly why the full-screen flow dismisses first; the in-sheet beat has to render inside the sheet, and keeping the two separate leaves the flag-off path untouched.
- **`components/log/EventTypeSheet.tsx` — the grid→confirm→done stage machine.** Symptoms / stool / Other morph to `SimpleEventConfirm` in place; Meal / Medication / Weight still route to `/log?type=`. The pet is captured at grid→confirm (the confirm has no switcher, so that IS write-time identity here); the stage resets to the grid on every close.

## Decisions

- **The in-sheet confirm lives in `EventTypeSheet`, not `app/log.tsx`.** The prompt said "rework `app/log.tsx`'s step machine," but PR 2 (#634) put the sheet in the FAB (`EventTypeSheet`), so "complete inside the sheet" = the sheet's stage machine. `app/log.tsx` was reworked only where it made the write shared (`insertSimpleEvent` + `buildTimeFields`); its full-screen `simple`-step **rendering is unchanged** (both flags), which keeps flag-off byte-identical and the diff contained. Consequence, taken knowingly: on flag-on the FAB's Vomit/Loose-stool **quick taps** still open the full-screen `simple` step, so a symptom has two confirm designs depending on entry point → filed **B-750** (route the quick taps into the sheet-confirm; pairs with B-749).
- **Copy correction (the clinical-guardrails / History-parity pass — authorised by the task + the mock's own callout).** The round-4 mock drew the open-ended window pill as "found — sometime since this morning", but the stored open-ended window is **upper-bound-only** (`earliest = null`, `latest = discovery`). "Since this morning" asserts a **lower bound the record does not hold**, so the shipped copy is **"found by {time}"** — exactly `describeOccurredAt`'s History wording. The pill derives from that function so it can't drift. (The mock flagged its "found —" phrasing as a draft for this copy pass to reconcile.) Proposed as a Tier-2 note to the requirements §3 AC-FOUND — flagged, not written.
- **The photo "read it for signs" promise is gated to the types that actually read.** `insertSimpleEvent` triggers an AI read only for vomit + both stool types. So the photo sub-line reads "Optional — I can read it for signs" **only** for those; lethargy / itch / Other get a plain "Optional" (clinical-guardrails: never promise a capability the record won't deliver).
- **AC-FOUND scopes "Found it" to witnessed + window.** Open-ended (before) + bounded (between) only — the "around a time" (estimated) sub-mode of the full-screen field is deliberately not offered here (matches the mock + AC-FOUND's "witnessed / window" wording). `occurred_at_confidence` lands exactly as today.

## Persona sign-off

- **Designer** ✓ (P1 zero-decisions — the confirm is a confirmation not a form; P4 no festive beat over a symptom — `calm` tone; the teal confirm register from the mock). One deviation to note: the back chevron follows the round-4 frame's right-aligned placement.
- **Engineer** ✓ — write de-duplicated into `lib/simpleEvent`; `buildTimeFields` shared; theme tokens only; no `any`; async error handling on the write + best-effort photo.
- **Dr. Chen / clinical-guardrails** ✓ — two falsification attempts, both held: (1) *an owner logs a FOUND vomit* → the pill reads "found by {time}", never a fabricated "since this morning" lower bound, and confidence is `window`; (2) *an owner attaches a photo to a lethargy log expecting a read* → the sub-line is a plain "Optional" and no analyze function fires (no false capability).
- **Data** — N/A (no correlation/detection/escalation logic; the write is a straight INSERT, behavior-preserving, tested).
- **QA** ✓ — see AC coverage below.

## Acceptance criteria (§3 riders + §1 scope)

- **AC-CHIP** — the Saw it / Found it chips are `flexShrink:0` + `numberOfLines={1}`; the pair is `flexShrink:0` and the time row is `flexWrap:'wrap'`, so the chips can only drop to their own row, never squeeze/truncate. Pinned in `SimpleEventConfirm.test.tsx` (the structural contract); the visual check at 320pt + max accessibility font is QA spine #3 (on-device). ✓
- **AC-FOUND** — witnessed / open-ended / bounded each write the right `occurred_at_confidence` + bounds (tested via the write args); the window editor opens inside the sheet; the pill re-renders per state at History parity. ✓
- **FL-1 flag-off byte-identical** — `app/log.tsx`'s simple step is unchanged and the flat-grid snapshot passed un-regenerated (11 snapshots green). ✓

## What broke, and the fix

`lib/storagePolicies.test.ts` failed: its bucket-name guard scans for `const NAME = 'nyx-…'` and my SVG gradient-id constant (`GLOW_GRADIENT_ID = 'nyx-sheet-beat-glow'`) false-matched, colliding with `CompletionMoment`'s same-named `'nyx-completion-glow'`. Fixed by giving the beat's gradient id a non-`nyx-` value (`'culprit-sheet-beat-glow'`) — it's an internal SVG def, never a bucket — which keeps the guard intact rather than weakening it.

## Tests

- New: `lib/simpleEvent.test.ts` (event row shape, photo attach + AI trigger for exactly vomit/stool, best-effort photo never fails the event, sync/regen), `lib/logCopy.test.ts` (History parity + the no-"since this morning" assertion + no-`!`), `components/log/SimpleEventConfirm.test.tsx` (AC-CHIP contract, AC-FOUND states + write args, the photo-read-promise gating, double-submit guard), plus `buildTimeFields` cases in `lib/eventTimeEdit.test.ts`.
- Updated: `components/log/EventTypeSheet.test.tsx` (symptom/Other/stool confirm in place; meal/med/weight route out; back→grid; logged→beat→close; calm vs celebrate tone).
- Full suite: **218 suites / 4839 tests green; 11 snapshots green; `tsc --noEmit` clean.** (No ESLint in the toolchain — typecheck + jest are the gates. Edge Functions untouched — no deno changes.)

## Follow-ups filed

- **B-750** — route the FAB quick symptom taps into the in-sheet confirm on flag-on (the entry-point inconsistency above). Pairs with **B-749** (unify the secondary bare-`/log` doors onto the sheet).

## Outcome

Shipped via #<PR>. B-745's three build PRs are complete; the track's remaining item is the **GA call** (FL-4: a removal PR deletes the flag, the old grid, and the shelf row) — a PM decision, not a build step.
