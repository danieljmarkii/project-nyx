# Trial protein capture (B-704) PR 5 — the vet-report render

**Date:** 2026-08-05
**Shipped via:** #598 (draft) · branch `claude/b704-trial-protein-report-tf9zgc`
**Track:** B-704 (trial protein capture) · Step 9 vet report · rides the standing **B-494 `generate-report` redeploy** (not redeployed here)

---

## What shipped

The final PR of the trial-protein track's read path: the owner's stored protein now reaches the vet report.

- **Identity (§7.4).** The trial block leads with **"Elimination diet trial — {Protein}"** and a provenance word — *owner-confirmed protein* / *read from the trial diet's label* / *recorded on day N* (when `target_protein_set_at` falls after day 1). No protein resolves → the food-label-led fallback.
- **Attribution.** Threaded the owner's stored `diet_trials.target_protein` (+ `target_protein_set_at`) through `index.ts` → `report.ts`, resolved through the shared `trialTargetProtein()` predicate so antigen naming survives thin food data.
- **Target-vs-label mismatch → a `protein_mismatch` safety flag** (see the redesign below).
- **TG-5 re-asserted against the report builder** — a new `report.test.ts` case snapshots every count / denominator / coverage figure the trial surfaces, edits the target, and re-snapshots byte-identical while the naming moves.
- New shared predicate `trialProteinLabelMismatch()` in `lib/trialProtein.ts` (the §5.3 one-predicate discipline), unit-tested in the jest suite.

Files: `supabase/functions/generate-report/{index,report,render}.ts` + their tests; `lib/trialProtein.ts` + test. 14 new deno cases + 6 new jest cases.

## The decision that mattered — the mismatch reshaping (both gates)

The first cut followed §7.4 literally: the mismatch rendered as a trial-block **disclosure line**, and exposure attribution was **stored-first** (the stored protein drove the `offTrial` markings). Both review gates, independently, found that wrong on the wrong-primary case — the exact case this feature exists to surface:

- **`adversarial-reviewer` → FAIL (round 1).** Stored-first markings produced **two contradictory protein baselines on one page**: the antigen *counts* are closed-world on the food list (`sanctionedProteinsOn`, TG-1-locked to the trial food's own primary = duck), but the `*` *markings* I threaded used the stored target (rabbit). One Appendix C row read *"carries nothing the trial diet does not"* beside *"Duck\* — other than the trial protein (Rabbit)"* — the "same page, two renderers, one fact, they disagree" class the report is built to avoid. The statistical spine (TG-1/TG-2/TG-5, day-math, no fabrication) **held under every attack**; the defect was render coherence.
- **`vet-report-cold-read` → NOT READY (mismatch report; the clean report was CLINIC-READY).** The exposure surfaces a vet actually scans ("N not matched" tile, "Chicken ×3", Appendix C) were byte-identical to a clean report and un-caveated — a 60-second scan read "nearly clean" and missed that if rabbit is the true antigen, the cat ate duck at all 11 logged meals. And the mismatch was absent from the safety band the legend advertises ("prescribed diet going uneaten"), which the ratified **B-494 rule** forbids (a report that teaches the reader to scan a zone may not leave it silent on trouble the record knows about).

**The fix — one baseline, owner value demoted to naming + a flag:**

1. The exposure baseline (`trialProteinTarget`) is now **derived-first** (the trial food's own primary), stored value only as the thin-food fallback. So markings, footnote, counts, and identity all measure against **one** protein — coherent by construction. §7.4's "survives thin food data" intent is preserved: on a thin food (derived null) the stored value rescues the naming, and there is no count to contradict (the antigen arm is dark there).
2. The owner's stored protein no longer re-bases any marking. It drives the identity provenance only when it *equals* the baseline ("owner-confirmed"; else "read from the trial diet's label"), and a new **`protein_mismatch` SafetyFlag** when it disagrees with the food's primary.
3. The flag **sits in the safety band** (ordered after the physical-sign flags, before chronicity — B-494 asks for presence in the scanned zone, not the top slot), stating the consequence plainly: *"if {recorded} is the intended antigen, every feeding of the trial diet is itself off-target and the elimination cannot be confirmed from this record."* The antigen-exposure row (and, after the adversarial re-review, the Appendix-D antigen line) carry an inline baseline caveat.

**Re-review — both gates green:**

- **`adversarial-reviewer` → PASS.** Re-ran the original repro (mismatch + off-diet duck treat): the duck-jerky Appendix C row now renders "Duck" with no star beside "carries nothing the trial diet does not"; the footnote names Duck. One derived-first baseline across identity/markings/footnote/counts; the chicken-on-duck edge names "Duck" not "Chicken"; thin-food + stored rabbit still rescues naming (§7.4 intact); TG-5 pins numbers *and* markings byte-identical across a target edit. Coherence resolved, no new break. Two safe-direction residuals named (Appendix-D caveat — closed this session; kin-fire on exact-key mismatch — intentional, safe direction).
- **`vet-report-cold-read` → CLINIC-READY on both artifacts.** The mismatch flipped from NOT READY: the flag leads the band, the vet registers the discrepancy before any exposure number, the false-reassurance trap is closed, the exposure section is coherent on one baseline. Clean report unchanged. Three non-blocking NITs, all error-safe.

## Falsification attempts that held (DoD adversarial line)

Biostatistician/Adversarial (two rounds): tried a permit-shaped stored target ('chicken' = a live confounder's protein), junk, null, and a full rabbit/duck mismatch → counts/coverage/antigen tally byte-identical, the engine (`lib/dietTrial.ts`) never reads `target_protein`, never permits; a thin trial food → attribution survives and never fabricates a protein not on the food; `confirmedDay` before-start / tz-straddle / garbage → guarded to null, no negative or day-1 disclosure; the coherence repro (duck treat) → "Duck" unstarred, no self-contradiction. **PASS.**

Dr. Chen (cold read, two rounds, rendered artifacts): mismatch report flips to CLINIC-READY — the mismatch leads the band with an explicit "elimination cannot be confirmed" consequence, exposure coherent on one (Duck) baseline, counts caveated, false-reassurance trap closed; clean report unchanged.

## Residuals / follow-ups

- **§7.4 Tier-2 amendment — flagged for PM ratification (not written).** §7.4 specified a "disclosure line" + "stored-first" attribution; the gates showed both produced a false-reassurance / self-contradictory artifact. This PR promotes the mismatch to a safety flag (per B-494) and makes attribution derived-first-with-stored-fallback. Shipped provisionally under the blocking-issue rule; PM action item filed.
- **B-706** — the At-a-glance "N not matched" tile lacks the mismatch marker (cold-read NIT; safe-direction, mitigated by the leading flag).
- **B-707** — page-1 "nothing more can be said" prose slightly undersells Appendix C's front-of-pack protein ID (cold-read NIT; errs safe).
- **B-705** (derived-arm source-gate unification) stays **open** — not gate-required, and it risks the report's derived-value property test (primaries like `green tripe` / `egg whites` whose `proteinSourceBase` may be null), so deferred; the derived arm stays on plain `canonicalizeProtein` as in PR 2.
- **Adversarial residual (no row):** the mismatch predicate uses exact canonical-key equality, so a taxonomic-kin owner value ('poultry' vs food 'chicken') fires the flag — the documented safe direction (surface for vet confirmation), not a bug.
- **Cold-read NIT 3 (PD-vs-Dry product-name drift)** looked like a report data-hygiene issue but is largely a *fixture artifact* of the throwaway generator (trial food named "…PD (Duck)", logged meals defaulted to "…(Dry)"). Not filed as a product row; verify on real data if it recurs.

## Personas / gates that reviewed

Data Scientist / Biostatistician (adversarial, ×2 — the never-permits + coherence spine) · Veterinarian, Dr. Chen (cold read, ×2 — the rendered artifact) · Engineer (the derived-first baseline + the SafetyFlag machinery) · Sr. QA (TG-5 report-builder re-assertion + the coherence tests). PRs 3–4 (client surfaces) remain and are independent of this PR.
