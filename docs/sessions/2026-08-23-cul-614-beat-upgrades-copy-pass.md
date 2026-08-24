# CUL-614 — in-place beat upgrades + the completion copy/guardrails pass

**Date:** 2026-08-23

PR 5 of 5, and the end of the completion chain (CUL-603, `docs/nyx-app-polish-requirements.md` §5). Shipped via **#707**. Follows CUL-604 (#700, the haptic vocabulary) and CUL-606 (#703, the named card). CUL-612 (Undo) and CUL-613 (capture paths) were `In Progress` in parallel sessions when this one started, which shaped the scope: this PR stayed off `NamedCompletionCard.tsx` and off the capture screens, and touched `momentStore` additively only. CUL-613 merged before this session closed — see the base-merge note at the end, which is where that scoping proved itself.

## What shipped

**The sentence rule went app-wide.** PR 2 left an explicit scoped claim in `lib/completionCard.ts`'s header naming this PR as its other half: `SheetLogBeat` still defaulted `title` to `'Logged'`, so a beta account on `log_picker_v2` confirmed a "Found it" vomit with a word that named neither the event nor the window the app had just written — on the surface where the owner is least able to check, since the sheet covers Home. `SimpleEventConfirm` now returns the `LoggedRecord` built from the same `buildTimeFields` output the summary pill reads and the write used, and the beat composes through `lib/completionCard` → `lib/logCopy` → `describeOccurredAt`.

`title` became **required**. That is the enforcement, and it is worth naming as a shape rather than a rule: PR 2 made a card that cannot be *handed* a display string; this makes a beat that cannot be *left without* one. Same guarantee approached from opposite sides, and neither has a fallback that says nothing. The dwell went 1400 → 1800ms because 1.4s was sized for a single word.

**The MedStrip confirm joined the register.** The best interaction in the app was wearing the flattest feedback: no mark, no haptic, and `"Dose logged just now"` — drug-agnostic, on a Home that renders one card per med (D3), so an owner confirming one of three cards read a line that could have belonged to any of them. It now reads `{drug} · logged just now`, carries the R2 check, and plays `commitRoutine()` after the write resolves.

Two small decisions inside that. The mark uses `colorAccentInk`, not the mint `colorMomentConfirm` the ring-bearing beats use: this glyph sits bare on white, where mint measures ~2.2:1 — under the 3:1 floor for a graphical object — while ink is the same accent (the one-accent rule holds) at ~5.5:1 and is already the confirmed line's colour, so mark and sentence read as one unit. And the haptic fires *after* the write resolves rather than on the tap, which is the opposite convention from `destructiveConfirm`; the difference is that this button has no confirm step needing the tap to feel heard, and a buzz on a failed dose would tell the owner in the most physical way available that something was recorded when it was not.

**The dwell now pauses while the owner is touching the card.** A dose card carries nine chips inside a 5s window, and each tap re-armed only `CHIP_CONFIRM_HOLD_MS` (1500ms) — so an owner who tapped an adherence chip and then paused to read the four vehicle labels watched the card leave under their finger. `momentStore` gained `pauseDwell` / `resumeDwell`, wired to the meal and medication card roots' `onTouchStart` / `onTouchEnd` / `onTouchCancel`. It lives in the store for the reason the commit haptic does (CUL-604): a card that grows a new control inherits the pause with it, rather than re-deriving a rule about its own dismissal.

Three details in that are load-bearing rather than incidental:

- **`rescheduleHide` banks while paused instead of arming.** Touch and press events interleave as touch-start → `onPress` → touch-end, so a chip handler's `rescheduleHide(1500)` fires *while the finger is still down*. Arming there re-creates the exact bug the pause exists to fix, which is a pleasing trap: the naive implementation looks correct and does nothing.
- **Resume takes the MAX and routes through `rescheduleHide`**, so a flagged 7s window — or a double-dose conflict that landed mid-gesture — survives, and the safety floor re-applies on top.
- **A `PAUSE_CEILING_MS` (20s) watchdog force-resumes** a gesture whose end was lost to a Modal mounting over the card. The pause is a convenience; the dismissal is the contract, so a lost release degrades to a card that lingers, never one that never leaves.

**The copy pass** closed the last two reachable bare `'Logged'` fallbacks (`'Food logged'`, `'Dose logged'`) and found one thing that was not about phrasing at all — see below.

## The finding the copy pass actually produced

`nyx-voice` Pattern 1 (first person for the pet, by name) turned up a wrong-pet gap rather than a tone problem. The beat **replaces** the confirm stage inside the sheet, and that stage's header (`"Vomit — Nyx"`) was the only thing naming the pet. So at the single moment the owner is told the write happened, the screen had stopped saying whose record it happened to — on a sheet whose pet was fixed several taps earlier at grid→confirm and cannot be seen behind it. In Sam's multi-pet household that is CUL-574's class, confirmed rather than caught.

The beat now speaks R1's exact subline, `Saved to {pet}'s record`, from `confirm.petName` — the pet captured at grid→confirm, never a re-read active pet. Using the same string as the named card is deliberate: R1 and R2 are one register in two shapes and should not describe the same act differently.

This is the second time in this chain that a rule stated for one reason (voice) caught a defect of a different kind (multi-pet identity). Worth remembering that the voice pass is not decoration.

## Falsification attempts

The diff touches no detection or correlation engine, so no `adversarial-reviewer` pass was required — the `code-reviewer` independently reached the same conclusion. But it does sit next to two safety mechanisms, so both were attacked rather than assumed, and each was verified **against source** rather than against the comment describing it:

- **Can the dwell pause weaken B-156 G1** (an unanswered dose card lands `unconfirmed`, never `given`)? No, structurally. The only two dismiss sites in `momentStore` — `armHide`'s timer and `hide()` — do `set({ visible: false })` and nothing else; the in-doubt state is decided at *insert* (`isComboDoseInDoubt` over the stored null adherence), not at dismiss. So dwell length changes how long the owner has to answer and never what silence means.
- **Can any pause/resume sequence shorten the double-dose safety window?** No. The nastiest ordering is a conflict landing *while* paused: `patchDoubleDose` → `rescheduleHide(7000)` banks rather than arms, and resume takes `max(banked, 5000)` before `rescheduleHide` re-applies the floor — 7000 either way. The reviewer added a sharper reason than the one the code was written for: `floorMs` is recomputed fresh from current state on *every* `rescheduleHide` call, so even a value banked before the conflict existed cannot escape the floor.
- **Can the MedStrip haptic fire over bad news** (D7's silence-on-safety)? No, and this was the claim most worth checking, because the comment asserting it was one I had written. `lib/medStrip.ts:395` gates the confirm payload on `!isWithholding` as a hard conjunct, so the only control that can play a haptic does not render on a card carrying a refusal fact. Now asserted in `MedStrip.test` so a future change that let the button through fails loudly instead of quietly buzzing over a refusal.

## Two coverage gaps closed on the way

`SheetLogBeat` had **no test file at all** — and it is the one beat whose §5.6 tone split lives outside `momentStore`, because the root `CompletionMoment` renders under the sheet's Modal. So a duplicated safety rule had a test on one of its two implementations, which is how the two drift. Six cases added, including that the haptic still fires under Reduce Motion (the component asserted that in a comment and nothing held it — and under Reduce Motion the haptic is carrying *more* of the confirmation, not less, since there is no spring to announce the beat).

The `code-reviewer` then found the mirror of the same problem in the new work: the dwell state machine was thoroughly tested at the store level, and nothing tested the two lines of JSX reaching it. An edit swapping `onTouchStart` for `onTouchEnd`, or dropping `onTouchCancel`, would have left every store test green while the card either dismissed under the owner's finger or never dismissed at all. Both cards gained a `testID` and three cases each, driving the real store rather than a spy.

## Decisions

- **The R2 beat names the pet** (above). Not in §5's text; taken under the always-on copy standards and the multi-pet guard.
- **The MedStrip mark is `colorAccentInk`, not mint.** Contrast, and the one-accent rule. §5 says "the mark"; the token follows the surface, the same reasoning `lineFlag` already carries about the mock's print-legibility red.
- **The dwell pause is one flag, not a touch count.** With two fingers down, the first `onTouchEnd` resumes while the second is still resting. A counter models that literally and buys a worse failure: one missed touch-end leaks the count permanently, so every later gesture pauses a card that can never resume — the strand the design exists to avoid, made routine. The flag's error is bounded and points the safe way (a full fresh window from the release). Named in the code so it reads as a decision, not an oversight.
- **The meal card's nameless fallback says `'Food logged'`, not `'Meal logged'` / `'Treat logged'`.** That rule already has two implementations (`EventRow`, `lib/dayEvents`) and this was not the place to mint a third; "Food" is also true for the `'other'` and `null` food types neither existing copy covers. Filed as **CUL-625** rather than folded in.
- **The named card was left to CUL-612.** The dwell pause is one line to add there whenever that session wants it; adding it here would have collided with in-flight Undo work for no behavioural gain (the named card has no chip row).

## Residuals

- **On-device verification is outstanding** and needs a dev-client build — Expo Go plays no haptics. **CUL-616** already owns that standing pass for the chain; this PR adds the dwell and the MedStrip beat to what it should cover.
- **The time-picker Modal does not itself hold the card open** (pre-existing: `openPicker` never touches the dwell). Unchanged by this PR, and incidentally improved — the touch that opens it pauses the dwell, and the watchdog covers a lost touch-end — so it was left alone rather than widened into scope.
- **CUL-625** — the meal/treat display-label rule's two implementations.

## Base merge — CUL-613 landed mid-session

`main` moved to `8d0dab25` (#706 CUL-613, #705) while this PR was open, and #707 went un-mergeable. Worth recording because of *where* it conflicted: **only `CLAUDE.md`**. No code conflict at all, which is the parallel-safety scoping paying off — staying off `NamedCompletionCard.tsx` and the capture screens meant two sessions edited the same subsystem on the same day and never touched the same code line.

Both sessions had amended the same completion-convention bullet. Resolved **on meaning, not by keeping both sides**: this session's amended CUL-606+614 line replaces main's unamended copy of that same rule, and CUL-613's genuinely *new* bullet ("every commit path routes through its completion card") is kept alongside it. One copy of each rule. The failure mode being avoided is the 2026-07-24 overnight's, where a resolution kept both sides and shipped two contradictory lines to `main`.

CUL-613 also shipped a **new guard this session's diff is a subject of** — `guards/completionCard.test.ts`, which fails the build when an `insertMeal(` / `insertMedicationDose(` call site does not reach for its completion card. It passes, and the *why* was checked rather than the green trusted, on that guard's own stated lesson: `components/home/MedStrip.tsx` is spared by an **allowlist entry keyed on the file path** (line 74, reasoned as "R2, not R1"), not by an inline `completion-card-ok` comment — so the file is genuinely in the scan set and deliberately exempt, not silently skipped. Post-merge: 256 suites / 5626 tests green, `tsc` clean, all four guards pass.
