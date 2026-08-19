# CUL-542 — `analyze-stool` `unsure` foreign-material visibility (CUL-240 sibling parity)

**Date:** 2026-08-19
**Shipped via #682** (draft) · branch `claude/cul-542-stool-analysis-vomit-ljtpe6`

## The issue

CUL-542 is the `analyze-stool` sibling of **CUL-240 / B-042** (shipped same day via #681). CUL-240 fixed a visibility asymmetry on the vomit n=1 read: `StoolAnalysisSection`'s vomit counterpart rendered the "Foreign material" observation row only when `foreign_material_present === 'yes'`, so an `'unsure'` read carrying a described fragment in `foreign_material_note` was hidden from the owner entirely. `StoolAnalysisSection.buildObservations()` had the **identical** `=== 'yes'`-only gate (`:462`), and CUL-240 explicitly filed this ticket as the "generalizes to sibling analyzers" follow-up.

## The one thing that changed shape: zero live rows

CUL-240 was justified by **8 live `unsure`+note rows** the vomit fix immediately un-hid. The issue asked to *"confirm the stool `event_ai_analysis` rows actually carry `foreign_material_present='unsure'` + notes before shipping."* A privacy-safe aggregate over production found:

- **Zero stool analysis rows exist at all.** All **102** `event_ai_analysis` rows are `vomit`; `analyze-stool` (deployed ACTIVE v2) has produced no reads yet — it is newer and lower-volume, exactly as the issue anticipated.

So unlike vomit, there is **no live data this retroactively un-hides**. Presented the finding as a decision brief (ship the forward-looking parity now vs. hold until stool has live `unsure`+note rows). **PM ruled: ship as forward-looking parity** — close the identical latent gap now, so the first `unsure`+note stool read surfaces instead of being silently dropped, rather than leaving a known-identical bug latent for a future session to rediscover when data arrives.

## What shipped

Client-only, `components/event/StoolAnalysisSection.tsx` (`buildObservations`): on `foreign_material_present === 'unsure'` **with a non-empty note**, render the "Foreign material" row showing the **deterministic** literal `Possible — not identified` — never the model's raw note. The escalation floor, recommendation, and n=1 read are untouched (the card stays `monitor`); present-direction, never reassures. A bare `unsure` (no note) stays hidden; `no`+note is excluded (the condition keys on `presence === 'unsure'`). The `yes` path is byte-for-byte unchanged (refactored only to share the trimmed `foreignNote` const).

This mirrors the **round-2 (corrected) vomit design** directly — the deterministic label, not the raw note — so the Pattern-10 free-text-leak hazard that failed CUL-240's round-1 adversarial pass never existed in this change. `foreign_material_note` is the least-guarded model free-text field (no schema constraint, ungated at parse, no post-floor gate), so its **presence** is the trigger while its **content** is never interpolated onto the `monitor` card (`clinical-guardrails` Pattern 10 / B-060 / CUL-152).

### Where stool is *safer* than vomit was

CUL-240's round-2 review flagged a pre-existing vomit residual (→ **CUL-534**): vomit's parser (`analyze-vomit/index.ts:225`) trusts the model's `visual_flags` array and does **not** derive `suspected_foreign_material` from `foreign_material_present === 'yes'`, so a self-contradictory `yes`+`monitor` model row could leak the note on the unchanged `yes` path. **On stool this is already closed**: the stool parser (`analyze-stool/index.ts:281-282`) *derives* the flag from the enum (`if (foreignPresent === 'yes') visualFlags.push('suspected_foreign_material')` — B-340, 2026-07-13), so a `yes` foreign read structurally forces `worth_a_call`. The stool `yes` path is therefore more robustly Pattern-10-compliant than vomit's; no CUL-534 equivalent is needed here.

### No Edge Function change

None needed. CUL-240 already corrected the stale write-side comment on `analyze-stool` (the one that claimed `foreign_material_note` is populated only on `yes`) as a comment-only edit — it already documents the ungated-note behavior and literally names CUL-542 as the render follow-up. This PR is purely the client render + tests.

## Tests

Five render branches in `StoolAnalysisSection.test.tsx` (mirroring the vomit suite): `unsure`+fragment surfaces the deterministic label (and the **raw note never appears**), still `monitor` · a **diagnostic/reassuring `unsure` note never reaches the card** (the Pattern-10 counterexample, pinned) · bare `unsure` hidden · `no`+note excluded · `yes` unchanged (shows the model note on its `worth_a_call` card). Plus a **whitespace-only-note** branch (a `+1` hardening over strict vomit parity — the code-reviewer NIT — pinning that `.trim()` gates on real content, not mere presence). 17/17 in the file; full suite 5324/5324; `tsc --noEmit` clean. (Deno suites unaffected — no Edge Function change.)

## Persona / review sign-off

- **Dr. Chen / Data Scientist (`clinical-guardrails` self-review):** Pattern 1 (absence renders nothing, never a "no foreign material" claim) ✓ · Pattern 2 (floor untouched, server-side) ✓ · Pattern 9 (derives from the owner-editable enum, not the cached `visual_flags`/read; present-only) ✓ · Pattern 10 (raw note content never on the `monitor` card; presence-triggered deterministic label) ✓. Falsification tried: an `unsure` note reading *"looks like a piece of bone… usually passes on its own"* — held; the deterministic label renders and `bone`/`raw diet`/`usually passes on its own` are asserted absent. Started from the round-2-corrected vomit design, so no round-1-class leak was ever present.
- **code-reviewer:** **ship-ready** — no BUG or ANTI-PATTERN findings. Independently verified all five invariants and re-derived the Pattern-10 guarantee *structurally* at the source (traced `analyze-stool/index.ts:279-283` → `_shared/incident-analysis.ts` `applyEscalationFloor` `visualFlags.length > 0` check runs before the photo/appears checks → `foreign_material_present === 'yes'` reaching the client is guaranteed `worth_a_call`; also checked `shouldCollapsePartialRead` can't null it). Confirmed the comment's "stool derives, vomit doesn't (CUL-534)" claim does not overclaim. Two non-blocking items, both handled: **(NIT)** whitespace-only-note test gap → added this session (17/17); **(CLEANUP)** the branch is now near-duplicated across the two sibling components → filed **CUL-544** (shared-`lib/` extraction, `lib/vomitContents.ts`/CUL-226 precedent).
- **Designer / nyx-voice:** `Possible — not identified` — plain, present-direction, no `!`, honest about uncertainty; identical to the shipped vomit label for cross-surface consistency.

## Notes

- **No STATUS.md change** — client-only, no deploy, orthogonal to the tracked phases.
- **No PM action item** — client-only, no migration/secret/deploy. Tested via Runtime B (Metro + tunnel).
- **Forward-looking caveat, recorded honestly:** the fix has no on-device effect until `analyze-stool` produces its first `unsure`+note read. The 5 tests are the proof it behaves correctly when that row arrives.
