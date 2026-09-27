# TS-4 — the diet trial's own screen, `/trial/[pet]`

**Date:** 2026-09-26 (into 2026-09-27)
**Issue:** CUL-1300 · project *Diet trial — its own screen*, milestone B · The screen
**Outcome:** shipped via #947, dark behind `trial_screen`. Nothing sends an owner to the screen yet: TS-5 re-points Home's strip and TS-6 the other senders.

## What shipped

- **`app/trial/[pet].tsx`**: the route. It holds the gate and draws nothing of the feature (the Signal route's shape). Flag-off, it answers with a small screen and a door to the Pet tab, and issues no trial read. It rises at `SIGNAL_OPEN_MOTION.riseMs`, with no animation under reduced motion.
- **`lib/trialRoute.ts`**: builds and parses `/trial/<pet>`.
- **`lib/trialScreenModel.ts`**: a pure model. It places what `resolveTrialCard`, `resolveTrialStrip` and `buildTrialLedger` already say, and withholds on top of them:
  - A safety face is keyed on the card's register lines. It shows no ledger and only the card's own actions.
  - Over a pet that may not be eating, a running trial's card is resolved without coverage and without the untracked head.
  - No ledger at the milestone, and no Manage beside its three choices.
  - The vomiting line is the strip's field, verbatim.
  - The floor suffix stays beside the exposure count it qualifies; the LOCKED qualifier renders once, at the card's foot.
  - Nothing that counts renders until the facts have answered for the route's pet.
- **`components/trialScreen/TrialScreen.tsx`**: draws the model.
  - Every read, door and sheet takes the route's pet (C-9).
  - VoiceOver lands on one element holding the title and sub-line.
  - Every door is ≥ 44pt.
  - The lifecycle runs through TS-3's shared host.
- **The Replace / Start hand-off.** `profileStartTrialHref` sends `?pet=&open=start_trial&ts=`. The Pet tab consumes it in a ref (C-22) and opens `StartTrialModal` once, over the named pet, after that pet's trial read has answered.
- **Guards.**
  - The route joins `guards/trialScreenFlagOff.test.tsx` SURFACES, with its consumer list pinned. The mutation fixture moved to an unlisted path.
  - `guards/trialWindow.test.ts` and `guards/dietTrialProvenance.test.ts` name the screen as a second host. Their per-site assertions are kept.

## Decisions

- **PM, in session (2026-09-26):**
  - Build TS-4 now as a draft and hold the merge until CUL-559 is cut (T-2).
  - At `/wrap` the PM said "and merge". CUL-559 was still `Todo`, so **the merge overrides that hold**. The dark screen will be in the 1.2.0 binary. No sender reaches it, nobody is allowlisted, and flag-off byte-identity is proven by the guard.
- **Build calls, posted on CUL-1300 before code:**
  - An ended trial's title is the card's kicker, because the strip does not exist there.
  - The vet report door, and the completed card's *Open vet report*, are withheld when the route's pet is not the active pet. `/report` reads `activePet`. Follow-up: CUL-1334.
  - The Replace / Start hand-off is in TS-4 per the issue, although spec §10 lists it under TS-6.
- **Spec-directed fixes from the reviews:** the list door shows its head before hydration (§3.4); no Manage at the milestone (§3.9); the exposures door shows on ended trials (§3.6); title and sub-line are one accessible element (§6).

## What broke, and how

- **The first push was blocked by the repo's pre-push hook.** Two pinned registries (the decision-sheet opener and the card-lines reader) correctly named only the Pet tab. The screen joined each, with its reason, after I read each guard's intent.
- **The `adversarial-reviewer` failed the first build with three findings.**
  1. HIGH: an ended trial with a live intake decline dropped "needs a call today", because the safety face was keyed on the state.
  2. MEDIUM: after a stood-down refusal, the below-floor "so far" paragraph leaked the ratio, up to "28 of 28" on an extended window.
  3. A spec conflict, below.
- **The re-run found two new narrow cases from the fix itself.**
  - A record whose meals name no food read as "Nothing is on the record for this trial yet." over refused meals.
  - The untracked-head line lost its referent.
- **All of these are fixed without new copy.** Each fix was proven by mutation, meaning the targeted tests went red when the fix was reverted.
- **Falsification attempts, as recorded:**
  - 1,500 generated running trials (1,184 not eating): no state or register change from the projection, no ratio leak, no lost floor, and the safety face shows exactly when the card has flag lines.
  - Also run: A1 / A2 (below floor), B1–B4 (ended trials), D1 (no trial diet on the list), E2 (facts unreadable), F2 (overrun), and G / G2 / H2 (the re-run's cases).

## Reviews

- **`code-reviewer`:** ship-ready. Its nits are fixed: the malformed-link copy, and a test for the re-read on refocus.
- **`pm-feature-review`:** walked Jordan and Sam through every state.
  - Fixed per spec: the floor-suffix referent, the list door before hydration, Manage at the milestone, the terminal exposures door, and the VoiceOver order.
  - The rest went to PM decisions or issues.
- **`adversarial-reviewer`:** FAIL, then a narrow FAIL, then fixed. Its DoD line is on CUL-1300.

## Residuals

- **Four PM rulings, on CUL-1339:**
  1. The refusal face's milestone link at the window. It reaches *Stopped early*; see CUL-1337 for Dr. Chen.
  2. Manage on the intake-decline face. Without it, TS-6 makes that face a dead end.
  3. The mock's free-fed line, "It also can't tell you if she stops".
  4. "What {pet} can eat" on overrun.
- **Filed:**
  - CUL-1334: the report takes a pet.
  - CUL-1335: "1 … were" grammar in the card.
  - CUL-1336: read-state edge cases (zero pets, a failed facts read, stale facts).
  - CUL-1337: an ended card keeping the viability ask.
  - CUL-1338: meals with no food in the card.
- **Copy flagged for one voice pass with the PM:** "Pet tab" (no tab carries that label), the flag-off title "Nothing to show here", "pull", and the archived-pet line. These are mostly spec-prescribed.
- **Not built here:**
  - *For the call* (TS-7).
  - The Signal door (TS-9).
  - The flag-off door carrying the pet (TS-6).
