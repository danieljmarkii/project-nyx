# Quick Win sweep: the Pet tab's visits gate pinned, a faster protein property test, doc drift, an engine replay that refuses nothing (and one pick cut)

**Date:** 2026-09-26 · **Branch:** `claude/dazzling-dirac-wgjof0` · shipped via #933 · five picks, four shipped, one cut; one commit each; one `code-reviewer` pass (ship-ready; its one finding, a stale Pattern 8 snippet, fixed on the branch) and one `adversarial-reviewer` pass at the wrap (it cut CUL-1098 and tightened Pattern 9)

| Issue | Outcome | Proof |
|---|---|---|
| CUL-1098 | **Cut before merge; now `Gate: privacy`.** Built and mutation-proven (`beba180`), then backed out: with Remove photo mid-upload the photo comes back on the next pull (the CUL-639 class), and the stop left it unread where `main` still reads it. Needs the compensating remote detach first | `adversarial-reviewer` traced the resurrection at file:line; the stop, not the read, was the regression |
| CUL-1097 | **Shipped.** New `profile.vetVisits.test.tsx` pins when the Pet tab draws the Vet visits card: not in flight, not on a failed read, not across a pet switch, not for a late read of the previous pet | Dropping the gate reds all four; a plain `loaded` flag reds the two switch cases |
| CUL-1156 | **Shipped.** The two Class-A corpus walks check in plain JS and assert once: ~1.6 s to ~50 ms | Removing the joint-fixpoint loop, and removing the boundary-punctuation strip, each red the identical case set in the old and new suites; failures name the raw inputs |
| CUL-1103 | **Shipped.** CLAUDE.md's fold row (every card folds except `intake_decline`); clinical-guardrails Patterns 7, 8, 9 point at code that exists, and Pattern 9 keeps its write-time rule with `analyze-vomit` named as the exception (CUL-534) | Each citation resolved at file:line by two reviewers; budget guard green (136,695 B of 136,728) |
| CUL-1276 | **Shipped.** The replay refuses an export that does not name the same single pet in both queries, exits 1 on zero reads or zero evenings, and CI type-checks `scripts/engine-replay/` | Typo export: pre-fix prints `mismatches: 0` and exits 0, fixed exits 1. Database returned `subjects: 0` for a nil pair. `deno check` zero downloads after CI's warm step. Each `subject.ts` check reds its test when removed |
| CUL-421 | **Left:** in review on #791 | Open draft PR, already noted by the 09-21 sweep |
| CUL-1116, CUL-1154 | **Left as Quick Wins**, re-verified | 1116 re-measured: same 25 files and 423 lines, but 19 importers now (was 14). Both over an hour |
| CUL-382 | **Left as a Quick Win**, re-verified | Shares `app/event/[id].tsx` with CUL-1098 and a join History also reads; after this PR |
| CUL-963, CUL-1082 | **Gated: device** | Installed build is still 1.1.0 (35); all three `app_config` rows present. 1082's C-36/C-41 item and CUL-984 note already resolved |
| CUL-1049 | **Comment:** the Deno install is simpler now (`DENO_CERT` preset, GitHub asset reachable) | Measured this session |
| CUL-639 | **Comments:** the Remove-photo-mid-upload sibling path, then a correction once CUL-1098 was cut | Traced through `lib/attachments.ts` |
| CUL-1295 | **Filed:** a replaced photo that uploads late can come back and displace its replacement (`Gate: privacy`) | Found by the `adversarial-reviewer`, reproduced with `node:sqlite` |
| CUL-1201 | **Comment:** a re-read writes `monitor` over owner-confirmed stool blood (the item 2 call) | `adversarial-reviewer` |
| CUL-1130 | **Comment:** a fidelity line that reads the count beside the zero | From CUL-1276 |
| CUL-1188, CUL-936, CUL-926, CUL-1157, CUL-957, CUL-1003 | **Left as they are**, still accurate | 1188 and 936 re-verified in `lib/sync.ts`; 926 waits on CUL-922 (#842); 957 and 1003 are the PM's device passes |

**Lesson:** a race fix is judged by where the race actually ends, not by the line it guards. The zero-row stop was right about the local row and wrong about the record: the photo it declined to read came back on the next sync. The mutation proof and the code review both passed it; only the adversarial pass followed the photo past the chain.
