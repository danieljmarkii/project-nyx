# PR-51 — The trial screen for every account (CUL-1307, TS-GA)

**Date:** 2026-10-05
**One thing:** S3 L1 — A removal PR moves coverage, it does not delete it · check: pending

This was a dispatched session (Out of beta — Noticed, Design v2, History v2, the trial screen · PR-51). It shipped via the PR this record rides in. D1 was re-ruled (b) on 2026-10-04, so 1.2.0 ships with all four betas on: no cut gate, no flip. TS-DP (CUL-1306) was canceled the same day; the PM tests in production. PR-50 (#1066) is the precedent for the shape.

## What shipped

**The flag.**
- `hooks/useTrialScreen.ts`, its test and `guards/trialScreenFlagOff.test.tsx` are deleted with the flag (C-32: no registry named them, checked by grep across the repo).
- `'trial_screen'` is gone from `ALLOWLIST_FLAG_KEYS` and `ALLOWLIST_FLAGS_UNSET`; `lib/appConfig.ts` lists it as the seventh graduated key, and `lib/appConfig.test.ts` pins that a stray `app_config` row is ignored.
- Its `BETA_REGISTRY` row is gone, so the shelf lists the widget, Design v2 and History v2.

**Every door opens the screen.**
- `app/trial/[pet].tsx` keeps one fallback, the link that names no pet, and its way out is the bare Pet tab route.
- `components/home/TrialStrip.tsx` is the door (or the Design v2 card) and nothing else; the shipped strip and its Pet-tab href are deleted. A model with no pet draws nothing.
- `app/day-summary.tsx` pushes `/trial/{pet}`; `app/rundown.tsx` always builds the recheck.

**The Pet tab.**
- The trial slot is the retry (CUL-1458), the door row, or the no-trial start card with its one action. The running card's actions, the CUL-170 trial anchor and the tab's lifecycle host (`useTrialLifecycle` + `TrialLifecycleSheets`) are deleted; the screen is the only host. The start form and the screen's `?open=start_trial` hand-off stay.
- `lib/profileFocus.ts`: `'trial'` leaves `ProfileFocus`. The frozen widget link now reads through `widgetTrialFromParams` and forwards once to `/trial/{pet}` after the switch lands, with the same one-shot ref, drop rules and cold-start wait the focus path had (C-22, C-9).

**Tests.** The lifecycle suite was the hook's real behavioural coverage, so it was re-hosted rather than deleted: `components/trial/TrialLifecycleSheets.test.tsx` drives the same 19 cases through a minimal host wired as the trial screen wires the card. `app/(tabs)/profile.trialSlot.test.tsx` keeps the CUL-1458 cases and adds the door, the one-action start card and "the tab mounts no trial sheet" (a spy that the pre-GA tree would have called). Flag-off cases elsewhere were deleted; the widget suite now asserts the forward.

**Docs.** `docs/nyx-diet-trial-requirements.md` §4.2's routing sentence and screen count are rewritten and the ⚠ pointer retired (the issue asked for it). The trial-screen spec's header records GA and the flag-off sentences carry ⚠ retired markers. The CLAUDE.md row (a net shrink; the budget guard holds).

## Decisions

**The widget forward is its own arrival, not a focus.** Deleting the `'trial'` focus arm meant the widget's link needed a reader of its own. A separate one-shot keeps "a focus is a scroll target" true and stops a leftover `focus=trial` link from doing anything but landing at the top of the tab, where the door is.

**`DietTrialCard` keeps its running-state branches.** The screen still resolves the same card model; the component simply never receives a running state on the Pet tab now. Trimming it is not this PR's removal.

## Not done here

- The `app_config.trial_screen` row's deletion: PR-60 owns migration 084 and the data-only clean-up.
- STATUS.md: PR-60 owns it.
