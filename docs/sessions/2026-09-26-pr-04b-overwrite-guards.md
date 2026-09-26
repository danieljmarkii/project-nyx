# Engines v3 PR-04b: the per-incident read's overwrite guards

**Date:** 2026-09-26 · **Issues:** CUL-815, CUL-532, CUL-817, CUL-1201 (part 2) · **Mode:** BUILD · **Branch:** `claude/magical-shannon-p1c2r0` · **Shipped via #940** (draft, held until PR-04 and PR-01 merge)

**PM prompt:** "Kickoff step pr 04b of project Engines v3: the accountable engine." After the plan: "go (a), defaults on the other two."

## What was built

All in `supabase/functions/_shared/incident-analysis.ts`, the pipeline both `analyze-vomit` and `analyze-stool` run through.

- **CUL-817.** The step-3b read of the stored analysis row dropped its error, so an unreachable table read as "no row" and every never-clobber guard failed open. It now throws (`existingRowOrThrow`) before the cap gate spends a unit, and the catch re-reads and fails closed.
- **CUL-815.** A failed run threw away the contextual escalation it had computed before touching the photo, and any escalation it reached before a failed write-back. The catch now keeps it (`buildRescueRead`, `buildFailureWrite` mode `rescue`): `worth_a_call`, `status: 'failed'`, read fields only.
- **CUL-1201 part 2** (PM ruling: never lower a stored escalation automatically). Step 9 decides on a fresh read of the row through `resolveReanalysisWrite`. A stored `worth_a_call` is held over any calmer re-read, contextual ones included. The only write is the status, on a row the last run left `failed`.
- **CUL-532, refined.** A stored red flag the new read doesn't re-assert keeps the structured columns; a stored absence does not carry. The same rule now covers the capped branch (never overwrites an existing row's columns) and the failure write (error-only over a stored red flag). The issue's literal fix was rejected because it would widen CUL-1110 to every row.
- **Descriptors** gain `redFlagColumns` / `presentFlagsFromStructured`, parity-tested against generate-signal's `deriveIncidentFlags`.
- **`PipelineDeps`:** the pipeline's clients and model are injectable, and `_shared/incident-analysis.pipeline.test.ts` drives the real `runIncidentAnalysis` through a fake database and model (14 cases).
- **`.claude/skills/clinical-guardrails/SKILL.md`:** Patterns 5 and 7 carry the new rules.

## What changed between the plan and the build

1. **"Does deleting a duplicate count as the owner's act?"** The approved default was yes for a duplicate event. At build time both descriptors turned out to anchor their context windows to `Date.now()` (CUL-131), so a context also lapses when a day passes, and the write can't tell the two apart. Every contextual escalation is held. Recorded on CUL-1201.
2. **The owner-correction exception was removed.** The approved default let an edited row whose red-flag fields the owner cleared be lowered by a re-read. The adversarial pass broke it: `ai_raw_payload` is frozen at the read the owner edited, so a later re-escalation (a swapped photo with real blood) was lowered on the strength of the owner's correction of an earlier photo. The owner's path to lower a verdict now waits on a read-time stamp (CUL-1201 part 1) or an explicit owner act (CUL-1107 / CUL-409).

## Reviews

- **`code-reviewer`:** no correctness bugs. It independently reran the 17 mutation proofs. One cleanup was taken (the hold response echoed this run's flags). It also corrected my deploy note: `ask` only names the shared module in a comment, so a merge redeploys `analyze-vomit` and `analyze-stool` only.
- **`adversarial-reviewer`:** drove the real pipeline through a fake client, before and after, about 25 scenarios. Nothing lands lower or more reassuring than `main`. Four claims did not hold as first built, and each is now fixed or ruled:
  - The owner-correction exception lowered an uncorrected re-escalation. Removed.
  - The CUL-532 class survived on the capped branch and the failure write. Both fixed.
  - Holding contextual escalations makes a duplicate-log context permanent. This is a persona conflict, put to the PM below.
  - The source wiring guard passed 5 of 5 realistic broken rebases. Replaced by the behavior tests; 12 wiring mutations each turn one red.
  - Also fixed: a held `failed` row whose re-read was `uncertain` never settled.
  - Filed: CUL-1327 (the photo-list read drops its error). The race narrowed but not closed went on CUL-1321.

**DoD adversarial line:**
- A feline-intake 529 keeps the warning ✓
- A re-read after the context lapses holds the escalation ✓
- A stored-blood photo swap is held ✓
- A legacy monitor + fresh-red row keeps its blood through an unreadable re-read ✓
- A step-3b read error no longer clobbers an owner edit or spends a unit ✓
- The frozen-payload chain is held ✓
- The capped branch and the failure write keep a stored red flag ✓
- A decision on the stale row is caught by a behavior test ✓
- The step-9 race is narrowed to one round trip, not closed (CUL-1321).

## Open for the PM

**Persona conflict (defect 3 of the adversarial pass): should a contextual "Worth a call" be held until CUL-131 lands?**

> **Dr. Chen:** Hold it. The ruling is never to lower an escalation automatically. A context window that lapsed because two days passed is not the owner's act, and the write can't tell it from one the owner corrected. Over-escalating is the safe error (E-6: louder changes are adopted provisionally).
> **Designer / Sam:** It makes two existing context defects permanent. One vomit logged twice fires "thrown up more than once", and deleting the duplicate and re-running no longer clears it. Re-running a three-week-old read while the cat is tired today attaches today's lethargy, and it can never come off. A false sentence that won't go away is the nagging-engine failure Engines v3 exists to fix.
> **PM decision needed:** keep the hold (built) until CUL-131 anchors the windows to the incident, or let a contextual-only escalation be lowered by a re-read now and accept the clock-lapse lowering?

## Next

Rebase onto `main` after PR-04 (CUL-1203 part 2) and PR-01 (CUL-1277) merge. At the rebase:
- swap the `'worth_a_call'` literals to PR-01's `isEscalationVerdict`;
- extend the fake client for PR-04's pet-keyed writes;
- rerun the behavior tests and the adversarial pass.

Then mark #940 ready. CUL-1110 lands after this PR and inherits `resolveReanalysisWrite` as its seam.
