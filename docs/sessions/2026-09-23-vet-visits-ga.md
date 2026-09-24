# Out of beta, step 6: vet visits for every account

**Date:** 2026-09-23 · **Issues:** CUL-1081 (the flip, no PR), CUL-905 (the removal) · shipped via #893
**Project:** Out of beta — the log sheet, more event types, vet visits (P-CUL-16), milestone 2

---

## What this was

Step 6 of the *Out of beta* run order: GA-V1 (the `app_config` flip) and VV-GA (the client
removal) for `vet_visits`, in one BUILD session. The two issues had to share a session
(CUL-1081 says so), and the flip rode on the PM's "go", given in the kickoff prompt. Every
gate was on `main` at session start: CUL-962 (#891), CUL-950 (#890), CUL-951 / CUL-970 /
CUL-987 (#888). The sittings were waived on 2026-09-22.

The plan went to the PM before any code (the CUL-905 plan-gate comment) and was ruled "go".
Three PM rulings came with the go:
- **#871 moved off CUL-905.** The mock-rounds PR was *attached* to CUL-905, and an
  attachment closes its issue on merge (CUL-761's trap). It is now a comment instead.
- **CUL-1093 and CUL-1090 gate the 1.2.0 cut (CUL-559), not GA.** Holding the removal PR
  protects no one, since no owner sees vet visits until the GA build ships, and that build
  is the cut. Both issues now carry "blocks CUL-559". CUL-1090's a / b / c option is still
  the PM's.
- **The kickoff prompt's assumptions stand as written.** They were built from a read of
  `main`, and corrected CUL-905's description: 11 gate files, not 12; registry 4 → 3 after
  #891; the tile's target; the bake superseded. The description was patched with a dated
  amendment.

## What shipped

**CUL-1081, the flip (no PR).** Via the Supabase MCP, one row, looked at first:

| `app_config.vet_visits` | before | after |
|---|---|---|
| value | `{"enabled": false, "allowlist": ["<PM uid>"]}` | `{"enabled": true}` |

`UPDATE … RETURNING` returned exactly one row. The read-back showed `daily_look`,
`widget_enabled` and `design_v2` untouched. The row stays until the closeout (CUL-1082 +
CUL-963), because `resolveAllowlistFlag` fails closed on a missing row. No Edge Function
reads the key, re-verified by grep. CUL-1081 → Done.

**CUL-905, the removal (#893).** 38 files, +171 / −2,153.

- **Registry.** The key is out of `ALLOWLIST_FLAG_KEYS` / `ALLOWLIST_FLAGS_UNSET`, and
  `BETA_REGISTRY` goes from 4 to 3. The shelf case and its icon are gone. The retired key
  is named in comments by title, never as a quoted key string.
- **Ten surfaces un-gated.** The six `app/vet-visits/*` screens, Get ready
  (`app/rundown.tsx`), the Home strip, History and the Pet tab. The hooks are gone
  outright, along with each loader's `!enabled` branch and dep and each `<Redirect>`.
  The headers that said the flag-off guard *enforced* the screen / namespace split now
  say it was enforced during the beta and is a convention since GA (C-38).
- **One change from the plan: History's standalone `useEffect(loadVisits)` went too.** The
  plan said it would stay as the mount and pet-switch trigger. A closer read found the
  focus effect already covers both, since its deps include `activePet` and expo-router
  calls it immediately on a focused mount. The standalone effect existed only to catch the
  flag resolving mid-session. Keeping it would have meant a comment giving a reason that
  was no longer true. `code-reviewer` checked all six triggers and found no path that loses
  a load.
- **The old visit form, deleted.** `app/vet-visit.tsx`, its test and its `Stack.Screen`.
  Every field it wrote has a home:
  - date / clinic / vet / reason → the booking sheet's *Already happened* arm
  - notes → *How did it go?* and Edit
  - next visit → *How did it go?*'s next-visit row (in this model the recheck is a booking)
  - photo → *Photograph the paperwork*, into Vet Files (D7: a document never dates a visit)

  It was the only writer of a UTC-derived `visited_at`, so **CUL-946 (Urgent) is fixed by
  deletion**; every screen that writes a visit now passes a `localDateKey` day. Rows
  already mis-dated are not repairable, because nothing records which were logged in the
  evening. CUL-956 loses its vet-visit instance and stays open for its three siblings.
- **Ask's `log-visit` tile** now pushes `/vet-visits?add=happened`, the same door as the
  Pet tab's *Log a past visit* (CUL-942). With the flag on, it used to redirect to
  `/vet-visits/after` with no appointment, the CUL-949 blank-arrival shape. With the flag
  off, it opened the old form for every account.
- **Guards.**
  - `guards/vetVisitsFlagOff.test.tsx` retires with the flag (CUL-954 closes by deletion).
  - `guards/visitReaders.test.ts` drops the deleted file's `ALLOWED` entry (its
    stale-entry test forced that, correctly). It also drops the live `FLAG_KEY_ONLY`
    check, which would have gone vacuous once the three files no longer held the key
    (C-35). The fixture test that drives every shape the key took **stays**, because the
    by-shape property belongs to the detector, not the flag.
  - `guards/designV2FlagOff.test.tsx`: lineage comments only.
- **One new test, mutation-proven.** `app/rundown.test.tsx` pins that the *No prior visit
  logged* tile pushes exactly `/vet-visits?add=happened`. Putting back
  `router.push('/vet-visit')` fails it; restoring passes.
- **Comment sweep.** Every present-tense mention of the old form or the guard is now past
  tense or gone (nine files). Two past-tense history mentions stay:
  `generate-report/style.test.ts:133`, where editing would trip the deploy-ledger guard,
  and `guards/worthRaising.test.ts:209`.

## Verification

- `tsc --noEmit` clean.
- Full `jest --ci`: 439 suites, 9,637 tests, green. That is two suites fewer, matching the
  two deleted test files.
- The touched suites are green under `TZ=Pacific/Kiritimati` and `Pacific/Honolulu`
  (30 suites, 577 tests).
- After merging `main` (#892, CUL-503/504, which also edits `after.tsx`, `_layout.tsx` and
  the log doors) the merge was clean, `tsc` is clean, the 25 shared suites are green, and
  the full suite on the merged tree (the pre-push hook) is 441 suites, 9,656 tests, green.
- Closing grep: no `useAllowlistFlag('vet_visits')`, `useBetaOptIn('vet_visits')`,
  `'/vet-visit'` or `vetVisitsFlagOff` reader remains. `'vet_visits'` remains only as the
  table, plus the detector fixture kept on purpose.
- `code-reviewer`: **ship-ready**, no blocking findings. Its one nit (a 146-char comment
  line) is fixed. It also flagged a gap that predates this PR: no Pet-tab test pins the
  card's render condition, filed as CUL-1097.
- Adversarial review: N/A. No clinical or statistical logic moved.

## Filed and noted

- **CUL-1096** (Low): Get ready's tiles route to the *active* pet's screens, not the
  appointment's pet. This predates the PR, and the re-pointed tile inherits it unwidened.
- **CUL-1097** (Low): the Pet-tab card's render condition has no test.
- **CUL-1082** note: CLAUDE.md C-36 and C-41 cite the deleted guard as their worked example.
  The closeout re-points them to `guards/designV2FlagOff.test.tsx` under the byte ratchet.
  This PR leaves CLAUDE.md untouched on purpose.

## What is left for the project

Step 7, the one A-Native build carrying #891, #892 and #893. It is the 1.2.0 cut
(CUL-559), which is also held by CUL-1093 and CUL-1090. Then step 8, the
closeout: CUL-963 + CUL-1082, the data-only migration deleting all three rows, the doc
records and the CLAUDE.md rows.
