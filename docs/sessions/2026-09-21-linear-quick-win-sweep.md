# Quick Win sweep — the fold's clear epoch, the pet write as a hydration, the custom window that settles

**Date:** 2026-09-21 · **Issues:** CUL-826, CUL-511, CUL-371 · shipped via #884
**Also touched (no code):** CUL-350 (read, cut with a brief), CUL-421 (PR #791 found conflicted, noted)

---

## What this was

A `Quick Win` label sweep. Fourteen candidates read in full — bodies, not titles — three
built, one commit each on one branch, one draft PR carrying all three ids and attached
to each.

The exclusions applied before reading: `Waiting on PM` (CUL-425, CUL-586); anything whose
fix lives inside an Edge Function — on 2026-09-21 every function in `deploy-manifest.json`
is `pending` or `hold`, so the server-side halves (CUL-239, CUL-246, CUL-295, CUL-538,
CUL-274, CUL-125, CUL-470) are gated; anything on the per-incident read surface, whose
review gate is clinical (CUL-816, CUL-823, CUL-827, CUL-143); RLS / Storage / the deletion
cascade (CUL-597, CUL-244, CUL-283, CUL-692); device-only chores.

Three candidates already carried released-claim cut comments from earlier sweeps and were
skipped on that record: CUL-510 (the completeness check is vacuous as written — measured
2026-09-13), CUL-400 (the allowed-set screen's empty state is a ruling, not a mirror),
CUL-781 (no Deno in a cloud session). The comment convention paid for itself three times.

**One classification worth recording.** The 2026-09-15 sweep listed CUL-826 under the
RLS / Storage / deletion exclusion. Read at the file, it is a race in the sign-out
*wipe* of a device-local AsyncStorage key holding finding ids and timestamps — no RLS,
no bucket, no account-deletion cascade — and its fix was already shipped for the sibling
module in #806 with tests. It was built here under the `code-reviewer` gate alone; the
Trust & Safety line in the PR says what the fix does (a wipe is now a wipe under every
interleaving) so a reader can disagree with the classification rather than miss it.

## What shipped

**CUL-826 — the fold's clear epoch holds under every interleaving.** `clearSignalFold`
bumped once, before its `removeItem`; a write that STARTED after the bump snapshotted the
bumped value, read the pre-wipe blob, passed its re-check and wrote the previous account's
map back. The clear now bumps on both sides of the removal, and `writeFoldEntries` +
`pruneFoldStore` re-check after their `setItem`, removing the key if a clear happened
during the call — `lib/observationFold.ts`'s shape, applied to the original it was
copied from. Three tests drive the real writer and clear with hand-swapped storage
functions (the file's own convention: a restored spy over the mock's `jest.fn` corrupts
the cases after it — the first cut used `spyOn` and was green alone, red in the file).
Each half of the fix reds at least one test on its own.

**CUL-511 — a pet write counts as a hydration.** `reconcileFromPreferences` resolves the
named daily-summary body from the pet store on `hydrationTick`, and nothing on the pet
write paths bumped it. `addPet` / `updatePet` / `removePet` bump now, in the store's
mutators rather than at the five screens that write `pets` — `notifyTrialChanged`'s
reason: the next screen to add a pet will not know the notification exists. Loads
(`setPets`) and re-points (`selectPet`, `patchPetById`) never bump; the two no-op early
returns are what make "a write that changed nothing does not bump" true. The tick's
consumers were traced: none writes the pet store.

**CUL-371 — a custom-window edit settles before the report regenerates.** 600ms, only for
an edit of the custom window already on screen; the first request, a pet change and
Default ↔ Custom stay immediate. `isCustomWindowEdit` (`lib/reportRange.ts`) is the pure
decision; the screen holds its timer and compares against what LANDED, so a third tap
inside the window still coalesces. The body's alternative — an Update button — is a
visible surface and was left for a mock round. The screen test uses real timers on
purpose: a fake clock under `waitFor` advances itself and would fire the timer under test
mid-assertion.

## Cut, with the reason on the issue

**CUL-350 — fold `NightHeroGround` onto `NightGround`.** Every divergence between the two
is a dated design decision: the hero has no teal radial (removed after on-device QA
2026-07-12), carries the PM-ratified whorl ground, and draws different aurora geometry and
a different star field. A fold is either a change to the hero's pixels (a mock round) or
four props on the primitive (a config object, not a recipe). Recommended won't-do, with
the 12-line aurora-def extraction as the honest small alternative.

## Verification

`tsc --noEmit` clean · `npm test -- --ci` 439 suites / 9599 tests · every new test red
against the pre-fix code (CUL-371's two-tap case also red against a bypassed timer) ·
`code-reviewer` ship-ready with no blocking findings.

## PM action items

None. No check-in armed: nothing else is landing on `main` tonight, and the rule says
never overnight.
