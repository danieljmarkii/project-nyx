# Quick Win sweep — the beta note scoped, the allowed set as one unit, one trial-flag door

**Date:** 2026-09-22 · **Issues:** CUL-224, CUL-305, CUL-354 · shipped via #886
**Also touched (no code):** CUL-423 (closed — premise false in code), CUL-370 (read, cut with the reason)

---

## What this was

A `Quick Win` label sweep. Twenty-one candidates read in full — bodies and latest comments,
not titles — three built, one commit each on one branch, one draft PR carrying all three
ids and attached to each.

The exclusions applied before reading: `Waiting on PM` (CUL-586); anything whose fix
lives inside an Edge Function — every function in `deploy-manifest.json` is `pending` or
`hold` on this date, so the server-side items (CUL-239, CUL-246, CUL-274, CUL-295,
CUL-538, CUL-125, CUL-228, CUL-581, CUL-460's mock-locked sample line rides the same
lane) are gated; the per-incident read surface, whose review gate is clinical (CUL-816,
CUL-823, CUL-827, CUL-83, CUL-143, CUL-409, CUL-544); RLS / Storage / the deletion cascade
(CUL-597, CUL-244, CUL-283, CUL-408, CUL-177, CUL-692); anything that is a design change
without a mock round (CUL-172, CUL-130, CUL-273, CUL-320 — spec §8.1 says display-only).

Four candidates already carried cut comments from earlier sweeps and were skipped on that
record without a new comment: CUL-350, CUL-510, CUL-400, CUL-781. The convention keeps
paying.

## What shipped

**CUL-224 — the beta shelf's honesty note is scoped to what is already in the record.**
The page-level "won't affect your records" was true only while the widget was the one
beta and never wrote; the shelf now carries the log picker, Noticed and Vet visits. The
line now reads *"Turning one on doesn't change anything already in your records."* —
the one claim that holds for every registry entry, read-only or not. Test pins the new
line and the old phrase's absence with a write-capable beta rendered.

**CUL-305 — the diet-trial allowed set hydrates as one transaction.** The per-row loop in
`hydrateDietTrialFoods` now runs inside `db.withTransactionAsync`, so no reader sees a
wet+dry trial as single-food mid-pull and the log-time heads-up cannot spend a food's
one-per-trial budget on a false verdict. Failure semantics tighten in the safe direction:
a throw mid-batch now rolls the whole set back with the watermark unadvanced, and the
next cycle re-applies an idempotent upsert. The test drives `hydrateFromCloud` over a
fake db that records the transaction flag beside every statement.

**CUL-354 — one log-time trial-flag orchestration for both meal doors.** `applyMealTrialFlag`
in the new `lib/mealTrialFlag.ts` replaces the two byte-identical copies in `app/log.tsx`
and `components/log/FAB.tsx`. Not in `lib/trialContaminant.ts` as the issue suggested:
`store/momentStore.ts` imports that module at runtime (`forgetFlaggedFoodInTrial`), so
the issue's "type import only, no cycle" premise was stale, and a function there reaching
back into the store would close one. The store is read at call time
(`useMomentStore.getState()`) rather than through render-time hook bindings, because the
picker path's screen can already be unmounted when the card reveals. The test pins the
gate order off one shared call log — wait, patch, dwell, ledger LAST — and scans the two
screens plus the app tree for a re-copy (comments blanked first, C-18; call shapes, not
bare names, because the store *defines* `patchTrialFlag:`).

## Proven by mutation, before trusting

| Test | Mutant | Result |
|---|---|---|
| `lib/hydrateDietTrialFoods.test.ts` | the wrap removed (pre-fix `sync.ts`) | red — every `inTx` false |
| `lib/mealTrialFlag.test.ts` (scan) | pre-fix screens | red — 3 of 8 |
| `lib/mealTrialFlag.test.ts` (order) | `noteTrialFlagShown` moved before the patch | red — 3 of 8 |
| `app/settings/beta.test.tsx` | pre-fix copy | red — 1 of 8 |

Typecheck clean; full jest 441 suites / 9,609 tests green; `code-reviewer` pass:
ship-ready, no findings.

## Reconciled without code

- **CUL-423 → Done.** The issue's premise — a PRN course with a dose target renders the
  PRN count line "5 doses logged" beside "Dose 5 of 28" — is false in code:
  `computeRegimenCompliance` treats any `target_duration_doses > 0` course as
  dose-denominated and never PRN (`lib/medications.ts:1057-1058`), pinned by *"a dose
  target with NO daily cadence is still a %, never a PRN count"*. The residual gap the
  card can show (`Dose 28 of 28` beside `93% given · 26 of 28`) is D1 by design and pinned
  by its own test. The QA case the issue asks for exists.
- **CUL-370 → cut, stays `Todo`.** `regimenComplianceLine` lives in `lib/medications.ts`,
  which every Edge Function's closure inlines, so any edit there reds
  `guards/edgeFunctionDeploy.test.ts` while every function is `pending`; C-26's remedy is
  to MOVE the owner-facing copy functions out of the shared module, which is the real
  shape of this item and not a sweep's. Comment on the issue says so. Also noted there:
  the "unreachable today" framing is stale — a genuine PRN course with unconfirmed doses
  reaches the same unqualified count.

## Persona sign-off

Designer ✓ (CUL-224 voice: no `!`, plain, scoped claim; nyx-voice register kept) —
Engineer ✓ (import-cycle checked, transaction semantics reasoned, guard proven by
mutation) — Data N/A — Dr. Chen N/A — QA ✓ (AC listed on the PR, all pass) —
T&S N/A (no RLS / Storage / deletion surface touched).
