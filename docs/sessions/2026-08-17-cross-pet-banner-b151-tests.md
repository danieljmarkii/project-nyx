# Cross-pet banner — switch-settle + archived-exclusion tests (B-151 / CUL-449)

**Date:** 2026-08-17

Test-coverage quick win. Closed the two regression-guard gaps the **#203 adversarial
review** left on the cross-pet safety banner (multi-pet §4 — one calm banner above the
Signal zone when a *non-active, non-archived* pet has a cached safety finding). No
production code changed; both behaviors already held, they just had no test that would
catch a regression. Shipped via **#670** (draft).

## The two gaps

**(a) Switch-settle self-banner** — tapping the banner calls `selectPet(banner.petId)`,
switching the active pet *while staying on Home* (no blur/refocus). Whether the newly-
active pet's banner-about-itself then clears rests entirely on `useFocusEffect` re-running
when its callback identity changes on the still-focused screen. `useCrossPetSafetyBanner`
keys its `useCallback` on `[activePetId, otherPetsKey, signalTick]`, so a switch mints a new
callback → the effect re-runs → `others` is recomputed without the now-active pet → no
self-banner. The review flagged this as "unverified expo-router `useFocusEffect`-on-focused-
dep behavior".

**(b) Archived-exclusion** — the banner treats *every* pet in `petStore.pets` as eligible
(it filters out only the active pet, never an archived one). The sole thing keeping an
archived pet out of that list is `usePet`'s `is_active=true` query filter, which
`petStore`'s own INVARIANT comment leans on. The review noted it "HELD but has zero test …
one unfiltered `setPets` would surface an archived pet's banner".

## What was added

- `hooks/useSignal.test.ts` — new `describe('useCrossPetSafetyBanner — switch-settle self-banner (B-151)')`
  with two `renderHook` tests: (1) after switching to the banner's pet, the banner clears
  (no self-banner); (2) with *both* pets flagged, switching re-selects the now-non-active pet
  — proving the effect genuinely re-ran and recomputed the candidate set, not just filtered
  one out. Reuses the file's existing faithful `useFocusEffect → useEffect(cb,[cb])` mock and
  the already-mocked `readSignalsAndRefresh`.
- `hooks/usePet.test.ts` — new `describe('usePet — cross-pet banner archived-exclusion (B-151)')`
  test that records the pets query's `.eq()` calls and asserts `['is_active', true]` is
  present. The shared `mockReads` helper used anonymous `.eq()` stubs and never observed the
  argument, so this filter was untested.

## Verified non-tautological (mutation testing)

Each new test was proven to fail when the behavior it guards is broken, then reverted:
- Collapsing the banner effect's deps to `[signalTick]` → both switch-settle tests fail
  (banner stays stuck on the tapped pet, i.e. a self-banner).
- Dropping `.eq('is_active', true)` from `usePet` → the archived-exclusion test fails with
  the exact `Expected ["is_active", true]` message.

## Checks

- `hooks/useSignal.test.ts` + `hooks/usePet.test.ts` → 13 pass.
- `tsc --noEmit` → clean.
- Full pre-push suite → 237 suites / 5281 tests green.

## Notes

- STATUS.md deliberately untouched — this doesn't change any canonical state (phase, tracks,
  open questions), so per the minimal-diff `/wrap` rule there was nothing in it to make true
  or false (and it avoids the known collision surface).
- Out-of-scope observation, not folded in: a *second* server-data caller of `setPets` exists
  — the Archived-pets restore screen (`app/archived-pets.tsx`), which independently re-loads
  with the same `is_active=true` filter before its `setPets`. It's a screen (heavier to test)
  and outside the loader the review named, so it wasn't tested here. If a guard for that path
  is wanted, it's a small follow-up — flagged in the CUL-449 close-out comment rather than
  scope-creeping this PR.
