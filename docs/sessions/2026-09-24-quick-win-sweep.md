# Quick Win sweep: Edge Function type-check, guards read code, two calendar bombs, shared capture headers

**Date:** 2026-09-24 · **Branch:** `claude/tender-lamport-rlkc6q` · shipped via #897 · five picks, one commit each, one `code-reviewer` pass (ship-ready; both findings fixed on the branch)

| Issue | Outcome | Proof |
|---|---|---|
| CUL-782 | **Shipped.** CI's Deno job type-checks every module under `supabase/functions/`; the warm step caches every module | Type error planted in `delete-account/index.ts`: old `deno test` step green (1830 passed), new step red (TS2322). Same for `ask/index.ts`. Clean tree green on a cold cache, 55 modules, no downloads, `deno.lock` unchanged |
| CUL-884 | **Shipped.** `symptomLists`, the membership walk and `completionCard` use `guards/blankComments.ts` | Old chain restored: exactly the new checks red (2/8, 2/48, 2/19). Old-vs-new blanker compared over every scanned file: no completion-card verdict or walk reading changes |
| CUL-885 | **Shipped.** The confidence guard's scan and its structural checks read code only | Against the pre-fix guard: only the new test reds on the clean tree; the original comment incident reds it three ways; a real assignment deleted and restated in a comment slips past the old structural check and reds the new one |
| CUL-832 | **Shipped.** Two bombs defused (`signalScreen` 2026-11-14, `WeightCard` 2027-01-01); weekly `Clock skew` workflow at +30/+180/+400 | Committed harness reds exactly the old fixtures (6 tests) at +180/+400 and passes all three skews after the fix. Full suite green at all three skews and in three CI timezones at +0/+400. Canary reds on five broken shims |
| CUL-399 | **Shipped.** Both capture screens use `components/ui/Header`; a guard forbids a local `Header`; a render test presses Close | Old screens: the guard names both files and both render tests red. Dropping `leading="close"` reds the render test; a stray `const Header` reds the guard |
| CUL-816 | **Duplicate** of CUL-827 | CUL-827's 09-05 comment asks for the same rollback at the same line; still true at `VomitAnalysisSection.tsx:226` |
| CUL-827, CUL-143, CUL-1093, CUL-938, CUL-470, CUL-492 | **Gated: clinical** | Each re-verified at file:line; the unlock is named on each issue |
| CUL-1033, CUL-720, CUL-771, CUL-990 | **Gated: design** | The mock, wording or scoping call is named on each issue |
| CUL-541, CUL-1013 | **Gated: deploy** | Deploy credentials, or a `generate-report` deploy |
| CUL-881, CUL-1057 | **Gated: privacy** | Same test file; one session with the `rls-privacy-reviewer` |
| CUL-700, CUL-510 | **Waiting on PM** | Decision brief on CUL-700; CUL-510's 09-13 brief routed |
| CUL-1106 | **Labelled Quick Win** | Verified at `guards/homeWrites.test.ts:83` and `:136` |
| CUL-697 | **Comment:** the six blankers still chaining, and a note to sequence it after CUL-1116 | Line refs in the comment |
| CUL-1075, CUL-421, CUL-937, CUL-1097, CUL-1103 | **Left as they are** | 1075 has an engineering decision and asks for its own session; 421 is in review on #791; the other three verified still true and still quick wins |
| CUL-1116 | **Filed:** the shared blanker desyncs on a quote in a regex literal or JSX text (25 files) | Found by CUL-884's old-vs-new comparison; the measuring script is on the issue |

**Lesson:** a replacement and a canary both deserve a measurement, not a reading. Diffing the shared blanker against the chain it replaced found the chain hiding keys and the blanker's own desync. The first clock-skew canary read a marker its own subject set, and passed with the shim unloaded until a mutation took the shim out.
