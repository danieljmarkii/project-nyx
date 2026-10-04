# Pet tab: a failed trial read shows a retry (CUL-1458)

**Date:** 2026-10-04
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-42 of *Out of beta — Noticed, Design v2, History v2, the trial screen*. BUILD. Shipped via #1036.

## What shipped

- `app/(tabs)/profile.tsx` now reads `useDietTrial`'s `status`. On `unreadable` the trial slot renders `DietTrialUnreadableCard` ahead of the door row and the card, not gated on `trialLoading`, so a retry in flight keeps the card up with a working button.
- `components/profile/DietTrialUnreadableCard.tsx`: kicker, one line, secondary *Try again* → `reloadTrial`. It has no Start on purpose: whether a trial is running is the thing the read could not say, and the start form over a running trial is the end-the-current-one flow.
- `lib/dietTrialCard.ts`: `trialCardUnreadableLine(pet)`.

## The copy call

"I couldn’t check on {pet}’s diet trial just now." The trial screen's "I couldn’t pull {pet}’s trial just now" was not reused. That screen is only reached through a door that implies a trial. The Pet tab slot shows for every pet, most with no trial, so "pull {pet}’s trial" would assert one exists. Designer / nyx-voice call, logged on the issue, reversible by the PM.

## Verification

- Five tests in `profile.trialLifecycle.test.tsx`: the line and retry; no Start, no card; a stale other-pet input does not win; busy during retry; a loaded read still draws the card. The file's `lib/dietTrialCard` mock takes the real line through `jest.requireActual` (C-34).
- Mutation: disabling the branch made 3 tests fail.
- `tsc --noEmit` clean. Guards, the profile, components/profile and dietTrialCard suites pass (1,575). The pre-push full suite passed.

## DoD

AC pass (above) · anti-patterns: theme tokens only, `ThemedText`, no `ActivityIndicator`, no `disabled` used as chrome · types pass · tests added · no secrets · Designer ✓ (Principle 5, C-12 error-not-absence, voice) · Engineer ✓ · Data N/A · Dr. Chen N/A · adversarial review N/A: an error-state render with no clinical or statistical logic · future-self: reuses the existing status and slot, no new pattern.

## Residuals

None. Reachability stays low (it needs a thrown SQLite read), and this state is covered by jest rather than a device check.
