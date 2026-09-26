# Quick Win sweep: a removed photo is not read, the Pet tab's visits gate pinned, a faster protein property test, doc drift, an engine replay that refuses nothing

**Date:** 2026-09-26 · **Branch:** `claude/dazzling-dirac-wgjof0` · shipped via #933 · five picks, one commit each, one `code-reviewer` pass (ship-ready; its one finding, a stale Pattern 8 snippet, fixed on the branch)

| Issue | Outcome | Proof |
|---|---|---|
| CUL-1098 | **Shipped.** Event detail's photo-add chain stops when its `synced = 1` write matches no row (the photo was removed mid-upload): no per-incident re-read, claim settles false | New `photoAdd` case (zero rows on that write only) reds with the check removed and passes with it |
| CUL-1097 | **Shipped.** New `profile.vetVisits.test.tsx` pins when the Pet tab draws the Vet visits card: not in flight, not on a failed read, not across a pet switch, not for a late read of the previous pet | Dropping the gate reds all four; a plain `loaded` flag reds the two switch cases |
| CUL-1156 | **Shipped.** The two Class-A corpus walks check in plain JS and assert once: ~1.6 s to ~50 ms | Removing the joint-fixpoint loop, and removing the boundary-punctuation strip, each red the identical case set in the old and new suites; failures name the raw inputs |
| CUL-1103 | **Shipped.** CLAUDE.md's fold row (every card folds except `intake_decline`); clinical-guardrails Patterns 7, 8, 9 point at code that exists | Each citation resolved at file:line; budget guard green (136,695 B of 136,728) |
| CUL-1276 | **Shipped.** The replay refuses an export that does not name the same single pet in both queries, exits 1 on zero reads or zero evenings, and CI type-checks `scripts/engine-replay/` | Typo export: pre-fix prints `mismatches: 0` and exits 0, fixed exits 1. Database returned `subjects: 0` for a nil pair. `deno check` zero downloads after CI's warm step. Each `subject.ts` check reds its test when removed |
| CUL-421 | **Left:** in review on #791 | Open draft PR, already noted by the 09-21 sweep |
| CUL-1116, CUL-1154 | **Left as Quick Wins**, re-verified | 1116 re-measured: same 25 files and 423 lines, but 19 importers now (was 14). Both over an hour |
| CUL-382 | **Left as a Quick Win**, re-verified | Shares `app/event/[id].tsx` with CUL-1098 and a join History also reads; after this PR |
| CUL-963, CUL-1082 | **Gated: device** | Installed build is still 1.1.0 (35); all three `app_config` rows present. 1082's C-36/C-41 item and CUL-984 note already resolved |
| CUL-1049 | **Comment:** the Deno install is simpler now (`DENO_CERT` preset, GitHub asset reachable) | Measured this session |
| CUL-639 | **Comment:** a sibling path, Remove photo mid-upload, and CUL-1098's zero-row branch as its hook | Traced through `lib/attachments.ts` |
| CUL-1130 | **Comment:** a fidelity line that reads the count beside the zero | From CUL-1276 |
| CUL-1188, CUL-936, CUL-926, CUL-1157, CUL-957, CUL-1003 | **Left as they are**, still accurate | 1188 and 936 re-verified in `lib/sync.ts`; 926 waits on CUL-922 (#842); 957 and 1003 are the PM's device passes |
