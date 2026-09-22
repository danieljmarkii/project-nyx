# Out of beta, step 1: the log sheet and more event types for every account

**Date:** 2026-09-22 · **Issues:** CUL-961 (the flip, no PR), CUL-962 (the removal) · shipped via #__PR__
**Project:** Out of beta — the log sheet, more event types, vet visits (P-CUL-16), milestone 1

---

## What this was

Step 1 of the *Out of beta* run order: GA-1 (the `app_config` flip) and GA-2 (the client
removal) for `log_picker_v2` and `event_types_v2`, in one BUILD session. The PM gave the
"go" on the flip at session start; the device sittings (CUL-663, CUL-729) were waived
2026-09-22, so the "blocked by CUL-663" relation on both issues is stale, not a gate. The
PM also handed four corrections to CUL-962's 2026-09-13 description (registry 6 → 4 because
`design_v2` landed on 2026-09-20; no CUL-19 "accepted gap" paragraph, superseded by the
2026-09-14 ruling; the file:line references had drifted; and the `check_in` trap). They were
patched into the issue before the build. The plan went to the PM first and was ruled "go",
with the one net-new test (below) as the recommended option.

## What shipped

**CUL-961 — the flip (no PR).** Via the Supabase MCP, on the PM's "go":

| key | before | after |
|---|---|---|
| `log_picker_v2` | `{"enabled": false, "allowlist": ["<PM uid>"]}` | `{"enabled": true}` |
| `event_types_v2` | `{"enabled": false, "allowlist": ["<PM uid>"]}` | `{"enabled": true}` |

A two-row `UPDATE … RETURNING` returned exactly two rows. The same read-back confirmed
`widget_enabled`, `daily_look`, `vet_visits` and `design_v2` untouched. The rows stay;
CUL-963 deletes them once the GA build is installed. CUL-961 → Done with the before/after
posted on it.

**CUL-962 — the removal (one PR, a pure deletion plus one test).** 20 files: the 19 the grep
named, plus the picker's snapshot.

- **Registry / keys.** Both keys out of `ALLOWLIST_FLAG_KEYS` / `ALLOWLIST_FLAGS_UNSET`;
  `BETA_REGISTRY` 6 → 4; both shelf presentation cases and their icons gone. The retired
  keys are named in comments by title and B-number, never by key string, so the closing
  grep stays empty. A persisted opt-in self-cleans (`parseBetaOptIns` keeps only known keys).
- **Un-gating.** The FAB's More events always opens the sheet (the `/log` fallback is gone);
  the sheet and `/log` render one grid, the W1 family grid (`expandedPickerGroups`). The flat
  grid, `PICKER_GROUPS`, the `grouped` / `expanded` props and the `'stool-type'` Normal/Loose
  sub-step went, with its styles and the `EventIcon` import it was the last user of. The
  hooks are deleted outright; no `&& optedIn` residue anywhere.
- **`v2Only`** is gone from the entry shape and all 13 entries.
- **The `check_in` trap.** Noticed's exclusion (`if (key === 'check_in') return false;` in
  `expandedPickerGroups`) stays. The three comments that justified it through `v2Only` were
  rewritten to the reason that survives: the entry shape has no `hidden` field, so the one
  grid's derivation excludes the key by name. The "no Noticed tile" describe survives
  against the one grid. **Mutation-proven:** deleting that line reds three no-tile tests
  and the snapshot. The completeness guard stays green under that mutation, correctly: it
  asserts every label is PRESENT, not that nothing extra is.
- **The snapshot.** The flat and three-group snapshots were deleted; the surviving grid
  snapshot was regenerated and its body **diffed byte-identical** to the old
  `flag-on + expanded` snapshot. The grid every account now meets is exactly what the
  opted-in cohort saw.
- **One net-new test** (PM-ruled, recommended option): `FAB — More events` pins that the row
  opens the sheet and pushes nothing. The closing grep finds flag keys, not a
  `router.push('/log')`, so nothing else would notice the fallback coming back.
  Mutation-proven: reintroducing the push reds it.
- **Re-pointed tests keep their subject.** The B-747 shelf-OR, the "N on" count, the
  CUL-224 honesty note, self-gating and the GA'd-flag cases moved from the retired keys to
  `daily_look` / `vet_visits`, so none went vacuous. One assertion inside Noticed's shelf
  test, `queryByText('More event types')`, could no longer fail once the card was gone; it
  now checks `Vet visits`.

## Verification

- `tsc --noEmit` clean.
- Full `jest --ci`: __JEST__.
- The closing grep (`log_picker_v2|event_types_v2|v2Only|pickerV2|taxonomyV2|PICKER_GROUPS`,
  `.ts`/`.tsx`, outside `supabase/migrations/`) returns nothing.
- No guard file, nothing under `supabase/`, and not `app/edit-event.tsx` (#846) in the
  diff. `symptomLists`, `completionCard`, `haptics`, `geistRollout`, `recordPetName`,
  `homeWrites` and `edgeFunctionDeploy` are green and untouched.
- `code-reviewer`: __REVIEW__.
- Adversarial review: **N/A.** No detection, threshold or escalation logic changes; gating
  removed around shipped, tested capture code.

## Persona sign-off

Engineer ✓ (one seam per file, no residual gate, hooks deleted) · Designer ✓ (the grid every
account now meets is the confirmed round-3 W1 frame, snapshot-identical) · QA ✓ (the
acceptance criteria below; the `check_in` mutation proof) · Data N/A · Dr. Chen N/A ·
T&S N/A (no new data surface; the wipe list is unchanged).

## Acceptance criteria (CUL-962, with the 2026-09-22 corrections)

- ✓ The closing grep returns nothing.
- ✓ FAB → More events opens the sheet (pinned by the new test); the grid is the seven-family
  grid with Cough / Sneeze under Breathing, and Stool is the split tile (picker suite); a
  bare `/log` renders the same grid full-screen (`app/log.tsx` renders `EventTypePicker`,
  which is now the one grid). The on-device look is the PM's, in the handoff.
- ✓ Settings → Beta features: the registry is 4. An owner sees widget / Noticed / Vet visits,
  because `design_v2`'s allowlist is empty and the shelf filters by eligibility. A persisted
  opt-in for a retired key self-cleans.
- ✓ `tsc` clean; full `jest --ci` green; the wipe list unchanged.
- ✓ The PR references CUL-960 + CUL-962, never CUL-663 (CUL-761's trap), carries no CUL-19
  gap paragraph (correction 2), quotes the flip's before/after, and names the runtime.

## Runtime

JS only: no native module, no `app.json` / plugin change. It reaches the phone through the
**GA build**, which is project step 7 (A-Native, carrying steps 1, 5 and 6), and CUL-962
must be in the 1.2.0 cut (CUL-559). Runtime B (Metro + tunnel) is the per-push check.

## What's next

- **Step 5, CUL-503 + CUL-504** (one door, one confirm) is unblocked the moment this merges.
  It is strictly less code now: the bare `/log` doors and the FAB's typed pushes are the only
  remaining routes into the full-screen picker.
- **Step 6, CUL-905** (vet visits: the flip + the removal) also waits on this merge; it
  shares `lib/appConfig.ts`, `lib/betaFeatures.ts` and `app/settings/beta.tsx`.
- **Step 8, CUL-963** deletes both `app_config` rows once the GA build is on the PM's phone.
