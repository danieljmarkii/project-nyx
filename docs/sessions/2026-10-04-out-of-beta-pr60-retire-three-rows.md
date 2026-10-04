# 2026-10-04 · Out of beta PR-60: retire the three dead `app_config` rows (CUL-963 + CUL-1082)

**Mode:** BUILD, dispatched (`/dispatch`, PR-60). **Branch:** `claude/out-of-beta-noticed-design-v2-history-v2-the-trial-screen-pr60-10042110`. **Outcome:** shipped via the PR on this branch, opened ready for review and **not merged**: the merge gate (1.2.0 installed, CUL-559) does not hold.

## What was built

- `supabase/migrations/084_retire_log_picker_event_types_vet_visits_flags.sql`: `DELETE FROM app_config WHERE key IN ('log_picker_v2','event_types_v2','vet_visits')`, data-only, with the Migration Safety Pre-flight in its header (destructive y, three config rows; rollback re-inserts `{"enabled": true}`; row count 3 → 0). **Not applied.** It applies at merge, by the PM's go.
- Tier-2 records the two issues list, under the CUL-960 / GA rulings:
  - picker spec: header GA'd, §2 FL-4 retirement record, §3 AC-CHIP stated as three states (CUL-760's wording);
  - taxonomy spec: header, D12 met, §12 retired, §13 W1 row GA'd;
  - beta-features §4.3.1: graduations three to five, with both lessons (a client-only pair with a host dependency GAs as one PR; a flag-off guard's async blind spot retires with the flag);
  - vet-visits spec v1.5: G0, §5.5, VV-0, VV-GA ⚠ markers and a §12 version row.
- CLAUDE.md: the picker, taxonomy and vet-visits Read-These rows say GA'd; net −141 bytes under the ratchet.
- STATUS.md: the taxonomy row loses its host-gate clause; the vet-visits row loses its flag clause and blocker list. The *Out of beta* project row is PR-50's and was left alone.
- `docs/dev-handoff-runbook.md`: the GA build (1.2.0, CUL-559) line. The installed line stays 1.1.0 (35): nothing in the repo records a later cut.

## Verified before writing

- #891 (CUL-962) and #893 (CUL-905) are on `main`.
- No reader of any key: none of the three is in `ALLOWLIST_FLAG_KEYS`; no client file names `log_picker_v2` or `event_types_v2`; every `vet_visits` hit in client and Edge code is the table. `_shared/engineFlags.ts` and `ask` read only their own keys.
- CUL-961 and CUL-962 are Done, so CUL-960 is named in the PR (CUL-963's own instruction).

## Checks

`npx tsc --noEmit` clean; `npx jest guards lib/functionHardening.test.ts lib/storagePolicies.test.ts` 48 suites / 818 tests green, `claudeMdBudget` and `edgeFunctionDeploy` included (no function closure touched); the pre-push full suite passed.

## Left for the merger

The merge gate and the Linear closeout checklist are in the outcome comments on CUL-963 and CUL-1082.
