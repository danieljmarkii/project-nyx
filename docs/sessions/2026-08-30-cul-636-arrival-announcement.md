# CUL-636 — the arrival moment gets its sentence (VoiceOver)

**Date:** 2026-08-30
**Outcome:** shipped via #785 (draft). Also filed CUL-766, CUL-767; scoping comment on CUL-638.

## What shipped

CUL-601's first-insight arrival moment (`docs/nyx-app-polish-requirements.md` §4) was ~1.2s of motion plus one soft haptic with **zero owner-facing strings**. Everything that said "something arrived" was in pixels, so an owner on VoiceOver got an unexplained congratulatory buzz — worse than nothing, since a celebratory haptic on a pet-health app invites the owner to imagine what it meant.

`arrivalAnnouncementCopy` (`lib/signalCopy.ts`) now speaks `"{Pet}'s first pattern is ready"` — the round-1 mock's own headline (`docs/culprit-app-polish-mockups.html:327`) — announced from the moment's **existing 900ms haptic timer** in `useArrivalMoment`.

## The three decisions, and why each is where it is

**1. It rides the existing timer, not a new effect keyed on `playing`.** Three consequences, all deletions rather than additions:
- It inherits every gate the moment already has (safety-class, marker-once, empty-renderable-set, latency, pet-switch), so no second predicate is minted that could drift from the first.
- `halt()` already clears that timer, so an arrival cut short by a blur, unmount or pet switch goes quiet on **both** channels with **no new `appActive` guard**. This is not an assertion: mutation M2 (announce at 0ms) reds the pet-switch test, which is the proof that the placement *buys* the cancellation.
- It is the same instant as the tap, so the moment reads as one beat — the defect stated positively.

**2. It announces on iOS *and* Android**, parting from the two announce sites above it. `AckLine` (`SignalZone.tsx:730`) and `TextField` (`:168`) gate to `Platform.OS === 'ios'` *because each pairs with an `accessibilityLiveRegion` node that already covers Android*. The arrival has no such node, so copying their platform check would ship the identical defect to TalkBack. A test exists so that "fix" fails instead of passing quietly.

**3. It marks the occasion, it does not read the card.** The insight is already rendered and reachable in the a11y tree when this fires; repeating it would make the owner hear the finding twice and the occasion never.

Scope held: silent wherever the moment is silent, including the safety path. Whether the safety-led owner gets anything is CUL-638's PM round, untouched.

## What the reviews changed — the part worth keeping

Both reviews found something real, and **both findings were in the verification, not in the source**.

**`code-reviewer` — a confirmed hole in the mutation set, not the code.** Hardcoding `arrivalAnnouncementCopy('Nyx')` in the source **passed all 53 tests**. Every fixture in the arrival block is named `'Nyx'` for every `petId`, *including the pet-switch case* (`'pet-1'` → `'pet-2'`, both `'Nyx'`) — so the suite could not distinguish a pinned name from a constant. That is the CUL-574 wrong-pet class, invisible by construction. Eight mutations had been run and **none of them touched the name**: the mutation discipline is only as good as the mutation set, and a fixture that gives two different behaviours the same value defeats it silently. Two cases now close it, each confirmed red by its own mutation.

The same review asked whether pinning `arrivedFor` at arrival start (vs reading `name.current` at fire time) was exercised at all. It was not, in either direction. **The pin is kept, and the reason is a proof rather than a preference:** it is read three lines below the `activePet.current !== petId` guard — the one point where the active pet has just been verified against the pet whose marker is being spent. Reading the ref fresh inside the timer re-opens exactly the window that guard closes, because refs are written during render while the pet-switch halt runs in an effect; a fire landing between the two would speak the **new** pet's name over the **old** pet's moment. A stale name after a rename is the opposite trade — cosmetic, and the card corrects it. Trading a proof for a cosmetic gain is the wrong direction; a test now pins it.

**`pm-feature-review` — an unverified premise in my own comment.** I had justified the 900ms placement partly as "not competing with the screen-change notification the frame swap posts". **There is no such notification.** Verified rather than conceded: RN posts an a11y notification from four places on iOS and none is a content re-render — `RCTModalHostViewComponentView.mm` (ScreenChanged, modal presentation only), `RCTMountingManager.mm` + `RCTAccessibilityManager.mm` (LayoutChanged, both from an explicit `setAccessibilityFocus`), `RCTViewManager.m` (LayoutChanged, on an `accessibilityState` prop write). The timing stands on the two reasons that *were* verified. The correction is kept in place rather than deleted, because the useful part is the class: a stated reason nobody checked, which a later reader would have built on — the §9a lesson arriving in a two-line comment instead of a spec.

**The generalisable pair:** both defects were in material written to *justify* or *verify* the change, not in the change. The source was right; the reasoning about it was wrong twice.

## What it could not settle

Whether the utterance actually **lands** is a device question, and it is the feature's real risk. `announceForAccessibility` is iOS's least reliable a11y channel — an announcement posted while VoiceOver is mid-utterance can be queued or silently dropped — and unlike every other announce site in the app (each a *backstop* for a rendered node) this one is the **sole carrier**, for a moment that happens once per pet ever, with the marker spent whether or not it was heard. If it does not land in practice, the fix is a rendered node (CUL-638), not different words.

## Filed

- **CUL-766** (Medium) — the arrival stage is `pointerEvents="none"` for the full 1.2s, so the card is inert to a VoiceOver double-tap for ~300ms after we say "ready". Pre-existing, but this change raises its severity. Deliberately not folded in: the fix is to CUL-601's motion behaviour, and the suggested alternative (announce on the tail) is *not* cheaper — the tail is an `Animated` completion callback that also fires on `halt()`, so it needs the `finished` guard riding the timer avoids.
- **CUL-767** (Low) — "first pattern" is spoken over `reflection` findings, which the app elsewhere explicitly declines to call a pattern. Best decided inside CUL-638's round.
- **CUL-638** — scoping comment: a rendered line must **replace** this announcement, not join it (S10 one-carrier), plus the reliability argument and the two mock frames showing this copy already reviewed in a rendered position.

## Checks

`tsc --noEmit` clean · full suite **295 suites / 6370 tests** green · CI green on all three jobs (`App (typecheck + jest)`, `App (jest, non-UTC timezones)`, `Edge Functions (deno test)`). No schema, no migration, no Edge Function touched — `lib/signalCopy.ts` verified absent from every Edge closure (CUL-717), so the CUL-19 / CUL-557 deploy holds are unaffected.
