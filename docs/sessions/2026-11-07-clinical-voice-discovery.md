# Clinical voice discovery: the ask inventory and mock round 1

**Date:** 2026-11-07 · **Issue:** CUL-2654 (sub-issue CUL-2665) · **Mode:** DISCOVERY · shipped via #1476

**What:** a copy inventory of every owner-facing vet ask (`docs/clinical-voice-inventory-2026-11.md`) and mock round 1 (`docs/culprit-clinical-voice-mockups.html`, https://claude.ai/artifact/XXdfoMvDd5pmY4eYkBuPfZ), applying the PM's 2026-11-07 ruling A: defer to the owner except a four-sign floor.

**Found:**
- The record's ask is keyed by tier, never by reason. "Call your vet today" covers a blood photo and a dog's second vomit alike, so the floor needs a reason-keyed words layer. No schema change is needed, because the reason is stored in the flag columns.
- "Call your vet now" fires only on the vomit count rows T1–T3, none of which is on the ruled floor (D2, a Dr. Chen / Designer conflict).
- There are six "cat not eating" predicates (D3).
- Collapse and breathing exist only on the door's printed list, which is already direct.
- The Home banner softens floor cases to "worth a look" (D4).
- Notifications carry no vet ask at all.
- The Signal is mostly deferential already. The directive register sits in the record, the EN-7 stool lines, the T-row read text, the consent vet line, the report send card and the diet trial decline line.

**Falsification (Data Scientist):** tried "If this isn't like Mochi, a call today is worth it". It fails for a chronic vomiter, whose baseline turns the call into a stand-down. So the deferential formula puts deference in the verb, never in a condition on the owner's sense of normal.

**Filed:**
- CUL-2663: the report send card says "Call your vet today" for any live flag.
- CUL-2664: the report misquotes the burden-soon ask.
- CUL-2665: the discovery sub-issue, so this PR does not close the parent.

**Deviation:** the launch prompt said to name CUL-2654 in the PR. CLAUDE.md's merge rule would then close the umbrella before the build exists, so the PR names the sub-issue instead.

**Next:** the PM rules D1–D4 and reacts to R-1 and R-2. Then the build is 4 rows (one over the issue's forecast of 3, flagged per D3 of CUL-1858). It runs beside App Store 1.2.0 and lands after the cut.
