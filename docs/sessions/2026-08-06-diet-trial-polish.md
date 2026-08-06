# Diet-trial polish — cross-surface consistency + card-affordance honesty

**Date:** 2026-08-06
**PR:** shipped via #603 (draft) · branch `claude/diet-trial-polish-6opibr`

A "quick win" polish session on the recently-shipped diet-trial feature (B-417 and
its followers), with the PM dogfooding as one of the first users. The track had
been reviewed exhaustively on the *clinical/statistical* axis; this was the pure
**craft** pass it had not had — small copy, cross-surface consistency, and one
genuinely sharp affordance bug. Discovery ran a `pm-feature-review` over every
trial surface; the PM ruled the decisions; execution landed as one PR of focused
commits. No schema, no clinical/statistical logic touched.

## What shipped

**Housekeeping (docs only).**
- Reconciled backlog drift: **B-534/535/536/538** were marked `Open` but shipped via
  #515 (the squash-merge rewrote the message so a `#515` grep on `main` missed it;
  `ENDED_TRIAL_GRACE_DAYS = 30` in `lib/dietTrialFacts.ts`, B-538's shipped code with
  a "(R5, B-538)" test, confirms it). Marked Done.
- **B-707** ruled **A** by the PM (accept §5; the derived-name-over-a-hatch residual
  is closed by B-705's source-gate, not a persistent no-derive state). Recorded in
  the backlog + CLAUDE.md Open Questions; full archive move deferred to a later wrap.

**Cross-surface identity + date consistency (B-706).**
- The Foods-tab strip said "Diet trial" while the Pet-tab card kicker and Home strip
  said "Rabbit trial". Extracted `proteinTrialLabel(protein)` into
  `lib/trialProteinPicker.ts` — the card's `trialIdentityLabel` and the Foods strip
  now both call it, so the three surfaces can't disagree on the name. Multi-pet lower-
  cases into the possessive ("Biscuit's rabbit trial"); null protein → "Diet trial"
  (TG-2, never a claim). **Closes B-706.**
- Foods strip separator em-dash → middle-dot (the Home strip and the "What {pet} can
  eat" subtitle it taps into both use " · ").
- Trial list screens rendered "Aug 27" (`formatCalendarDate`, locale-dependent) while
  the card renders "27 August" — so tapping the card's link flipped "3 July" to
  "Jul 19" in one hop. Added a locale-independent `formatLongDate` to `lib/utils`
  (sharing `MONTHS` with the card's `formatTrialDate`, deleting the card's duplicate
  array) and swapped the six trial-surface call sites onto it.

**List-screen title pattern.** `trial-foods` put a generic "Diet trial" in the nav
header and the real title in the body — so "Diet trial" appeared *again* in the
subtitle one line down. Aligned it to the pattern `trial-exposures` already uses (nav
header carries the words the owner tapped; body opens on the fact) via a new shared
`trialFoodsTitle(petName)` helper. The duplicate body title (and its dead style) are
gone. **Designer's call**, delegated by the PM: align the messy screen *up* to its
already-correct sibling.

**Card affordance honesty (the sharp one).**
- The header said "Change" on a running trial, but one active trial per pet is a DB
  constraint, so it opens the ordered *end-and-replace* sheet. "Change" read as an
  *edit* and routed an active trial straight to its own destruction — and on `day_one`
  the header is the card's **only** control, so a day-1 owner tapping the one button
  was offered the destruction of the trial they'd just started. The label now comes
  from an exhaustive `trialManageLabel(state)`: running → **"Replace"**, `completed` →
  "+ Start" (its only Start path), `no_trial`/`abandoned` → **suppressed** (the body
  already carries a Start CTA — which also kills the duplicate "+ Start" the review
  flagged on those two cards). PM chose the *quick fix* (relabel) over a fuller
  edit-surface reshape.
- Extended the "What {pet} can eat" link (B-616 FR-5) from states 2/3/6 to
  `day_one`/`free_fed`/`below_floor` via a shared `viewAllowedFoodsAction` helper. This
  is what gives `day_one` a real action — so the header is no longer its only control,
  which de-fangs the day-1 trap above as a side effect.

**StartTrialModal copy.** The "done" teaching screen offered "Log {pet}'s first meal",
but R3 made back-dating the encouraged path, so on a day-11 trial the first meal was
days ago. Now mirrors the sheet's own `dayCounter > 1` guard: day 1 keeps "first
meal"; a back-dated start reads "Log a meal for {pet}".

## Decisions

- **Designer's call on list titles** (PM-delegated): nav header = screen identity, no
  duplicate body title; align `trial-foods` to `trial-exposures`.
- **"Replace"** as the running-trial header verb (honest about the destructive
  end-and-replace; the blocked sheet's own copy clarifies the mechanics).
- **B-707 = A** (PM).
- **Left, not a duplicate:** the "Ends {date}." line under the More-options duration
  field (`StartTrialModal.tsx:732`) *looked* like a repeat of the primary
  `durationHelperLine`, but the two have distinct documented rationales (B-565
  always-visible disclosure vs. local feedback at the point of duration override) and
  sit at different scroll positions. Removing it would strip live feedback. Filed as
  B-715 for a device look rather than guessed-and-removed.

## What broke and how it was fixed

- The date-format swap broke exact-string assertions across the trial suites
  ("Jul 1" → "1 July", etc.) and the strip glyph ("—" → "·"). Updated every stale
  assertion (the RECEIVED values were the correct new output). One straggler surfaced
  only in the full run — a *component* test (`AddTrialFoodSheet.test.tsx`) rather than
  a lib test — fixed in its own commit.
- The "Change" relabel + suppression broke two `DietTrialCard` component tests that
  pinned the old behaviour; rewrote them to the new intent and *strengthened* them
  (asserting the duplicate CTA is gone).
- **`code-reviewer` caught a real fix-before-merge bug** the green suite couldn't:
  my first `trialManageLabel` suppressed the header on *every* `abandoned` card, but
  two branches ship `actions: []` with no body Start CTA (the intake-decline
  replacement and the degenerate unparseable-start branch) — and this card is the
  app's **only** trial-start entry point, so those cards would have had zero controls.
  Refixed to key suppression on the body's actual actions, not `state`, with two
  regression tests through `resolveTrialCard` (shipped in a follow-up commit on #603).
  The same review folded in three small items (`MONTHS` typed `readonly`, the
  `viewAllowedFoodsAction` "2/3" docstring correction, four stale short-date comment
  examples).

## Tests / DoD

- `tsc --noEmit` clean; full `jest --ci` green (**4572 passed**); non-UTC spot-check of
  the date-touching suites at **UTC+14 and UTC−10** both green (`formatLongDate` builds
  from local Y/M/D components, so it's timezone-stable by construction).
- Added unit tests: `proteinTrialLabel`, `formatLongDate`, `trialManageLabel`
  (exhaustive per-state), `view_allowed_foods` presence on the three states, the
  Foods-strip "{Protein} trial" parity, and a day-1 "first meal" copy guard.
- **Persona sign-off:** Designer ✓ (cross-surface consistency, the title pattern, the
  honest "Replace" relabel) — Engineer ✓ (shared one-source helpers, exhaustive switch
  with a `never` check) — QA ✓ (assertions updated + new coverage) — Data / Dr. Chen
  **N/A** and **adversarial review N/A**: this diff touches no clinically or
  statistically load-bearing logic (labels, date formatting, a nav link extended to
  more states, a copy conditional) — nothing feeds detection, coverage, escalation, or
  the vet report's computations. `code-reviewer` run on the diff — it caught one
  fix-before-merge stranding bug (fixed, with regression tests) plus three small
  cleanups; re-verified green after.

## Filed, not fixed (new backlog rows)

- **B-712** — Home trial strip taps to the top of the Pet tab, not the trial card
  (needs a scroll-to-anchor; on-device confirm). *Later.*
- **B-713** — completing via the "start another" back-door drops the owner's outcome
  (PM call: accept, or route through the outcome step). *Next.*
- **B-714** — no mid-trial way to correct a trial's duration short of the milestone
  (the real gap behind the old "Change" header). *Later.*
- **B-715** — the `StartTrialModal` "Ends {date}." device-judgment nit above. *Later.*

## Parked (unchanged this session)

B-592 (overrun card sentence — needs a mock round), B-593 / B-533-residual (Dr. Chen
vet sitting), B-594 (report window anchor — `generate-report` redeploy train). None
were in scope for a polish session.
