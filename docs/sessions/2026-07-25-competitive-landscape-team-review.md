# Competitive landscape — product-team review & ideas session

**Date:** 2026-07-25

PM convened the product team and personas to review [`docs/culprit-competitive-landscape-2026-07.md`](../culprit-competitive-landscape-2026-07.md) (the same-day 11-agent, 106-competitor pass) and discuss ideas stemming from it. Docs-only session: no app code, no schema, no build-phase change. Deliverable: **`docs/competitive-landscape-team-review-2026-07.md`**, shipped via #TBD.

## What the session did

**1. Re-derived the load-bearing claims about *us* from source before opining** — the review's own thesis is that our docs had drifted in both directions, so a team read that trusted a summary of a summary would be worthless. Four claims confirmed (no `diet_trials` write path anywhere; no `share_token` minting; no notification dependency at all; no export implementation). One found **stale, in a way that sharpens rather than softens it** (below).

**2. Produced ten persona reads** with genuine dissent rather than agreement — Designer's standing notification dissent, Jordan rejecting reminders as the thing they need, Data Scientist reframing a feature gap as a correctness hazard, Dr. Chen refusing any vet-facing claim before a real vet reads the report, T&S conditioning three of the ideas.

**3. Generated eleven ideas**, of which six became backlog rows and five are scoping/sequencing/positioning inputs to existing rows (composing beat minting IDs).

**4. Surfaced four persona conflicts** in protocol format, all left for the PM, plus seven numbered PM decisions with the team's lean.

## The finding that mattered

The review's §3.2 / §7 #5 says "the engine **and the report** still key off `primary_protein` alone." That is now half-stale — and the residual is the worse half:

- **Vet report: fixed.** `generate-report` selects `proteins`, `ingredients_notes`, `ai_extraction_confidence` and gates every claim through `mayClaimCompleteProteinSet` — B-351 slice 5, #448, merged the *same day* the review was written, so its code audit read pre-slice-5 source. Fair.
- **Correlation engine: not fixed.** `generate-signal/index.ts:657` still selects only `primary_protein`, and `detection.ts:1785` builds one scalar protein per meal. So a "Duck & Chicken" meal enters the case-crossover as a **clean duck exposure** — the engine can fail to implicate chicken however many episodes follow it, and can attach a Bonferroni-corrected p-value to the wrong animal.

Two consequences the review does not carry. **(a)** This sits *inside* the asset the review calls category-unique, and on the surface the owner sees far more often than the report — Dr. Chen's read is that it can support an owner's belief that a trial is clean while the pet eats chicken daily, which is the reassurance-on-absence shape our own guardrails forbid. **(b)** B-351 slice 6 on today's data is a **no-op**: all 59 live rows still have `|proteins| ≤ 1`, so set-membership correlation over sets of size 1 is the engine we already have. **B-416 is a precondition of slice 6 mattering, not a follow-up to it.**

## The idea the team ranked first

The review names **food identity** as the moat passive hardware can never cross — a feeder measures grams and is blind to brand, protein and ingredients. It does not connect that to B-354: the catalog is **per-account**, so the moat is 59 rows and starts at zero for every new owner, and it bites hardest exactly at the wedge (day 1 of a prescription diet, peak friction, peak intent). The elimination-trial therapeutic-diet market is small and enumerable; seeding those SKUs as the **already-sanctioned** read-only curated layer (`canonical_food_items`, per-account requirements FR-9 / D5) is cheap, additive, and the only way the protein work pays off for a new account. → **B-451**, gated on PM decision D4 (a new globally-scoped table is a PM + Dir. of Eng ruling).

## Roadmap (added mid-session, at the PM's request)

PM asked whether the team had roadmap ideas coming out of the review. Added as **§9 of the deliverable** — the team's proposed *ordering*, which is our concrete answer to decision D1.

The framing observation: **the Build Sequence in CLAUDE.md ends at Step 10**, Steps 9 and 10 are substantially shipped, and there is no roadmap doc in this repo — the numbered sequence *was* the roadmap. The review landed exactly when the plan of record ran out.

The scheduling fact that shapes the proposal: **getting to the store is now almost entirely PM/operational work** (screenshots, listing copy, privacy label, demo account, build cut — submission-guide steps 1–7 and 9 are done or nearly, and what remains barely touches the codebase), while **everything the competitive review argues for is build work.** The two spines don't compete for the same resource, which is why they run concurrently rather than sequentially — and why the review's §12 conflict is less binary than it reads.

Four horizons: **H0 Submit** (the three security items, password-recovery PR 2, the runway's remaining steps, plus a flagged judgment call — *promote crash reporting/B-016 out of Tier 4*, since the category's dominant negative-review theme is crashes and lost data, not missing features) · **H1 Make the wedge real** (B-417 PRs 1–7, then B-416 → B-351 slice 6, in that order because slice 6 over sets of size 1 is a no-op) · **H2 Make it survivable** (trial-scoped confirmations + co-signer, time-to-first-finding, report feedback — post-submit, before any acquisition spend) · **H3 Compound the moat** (B-451 curated diets, B-454 handoff, the vet-side question, B-455).

**The one re-sequencing the review actually forces:** I5/I9 and the review's §10 #9–#11 positioning items read like post-launch marketing, but **submission step 13 is listing copy, and listing copy is positioning** — so B-453 (the methods page) moves *into* H0 as the source text for the listing and the support page App Review visits anyway. With Dr. Chen's standing constraint: nothing we write may imply *vet-validated* until a real vet reads the report.

§9.8 records the roadmap's own weaknesses — nothing estimated, two concurrent tracks assumed, H2 gated on two decisions open for weeks (D2 since 2026-07-10; D5 unowned), and 0.3 taking a position the readiness register does not.

## Decisions made

None — every call this review surfaced is the PM's, and the review says so. Seven are tabled in §6 of the deliverable (sequencing; the standing notification question; the report-feedback shape; the curated-layer authorization; B-047/B-016 ownership; pricing shape; the Tier-2 edits).

The one thing the team resolved on its own authority was **what not to recommend** (§5): no vet portal, no hardware or hardware integration, no Android/tablet/web/localization, no labelled-image accuracy study, no re-deciding the tracked security items, and no re-opening of any B-417 ruling. Named explicitly so eleven ideas do not read as a licence to expand scope.

## Backlog

Six rows added (protocol: written in-session, not batched at wrap) — **B-451** curated therapeutic-diet layer · **B-452** report-usefulness feedback v0 (owner-relayed) · **B-453** publish the falsification record · **B-454** trial-plan handoff at week 0 · **B-455** install the competitors (the review's own debt #1) · **B-456** feeder-screenshot ingest (speculative, logged so it is not re-derived).

Deliberately no row for four ideas — trial-scoped confirmations (scopes B-288), trial-scoped household (scopes B-292), the B-416→slice-6 ordering (existing rows), time-to-first-finding as the metric that decides B-047's owner (an open PM item already), and the post-AI positioning line (costs nothing, belongs in listing copy).

**PO note, not repaired here:** rows B-432+ are physically appended below the `## Done` heading in `docs/backlog.md`. Grep-by-ID — how CLAUDE.md tells sessions to read that file — is unaffected, so it is cosmetic; restructuring 488 lines inside a review PR would be a conflict magnet for no functional gain. Routed to B-141.

## Tier-2 edits flagged, not written

The review's §11 list is endorsed with two corrections (split the multi-protein row per the finding above; mark the CI finding closed — B-390 shipped today) and one amendment: §11 #6 wants the doc-drift table added to `STATUS.md`, and the team declined that placement — `STATUS.md` is over its size budget and is the repo's most contested merge surface. The list stays in the parent review's §3.2 and should shrink as rows close rather than be maintained twice. Plus one addition: prune the file-level enumerations of the live access-control holes from both documents when B-397 / B-248 / B-431 close.

## DoD

- Acceptance criteria — **N/A**, no build step advanced.
- Types / lint / tests — **N/A**, docs-only diff (no `.ts`/`.tsx` touched).
- Diff vs. anti-pattern lists — clean; no Tier-2 doc edited, no `STATUS.md` line rewritten (deliberate, per v1.27's minimise-the-diff rule).
- Adversarial review — **N/A**; nothing clinically or statistically load-bearing was built. The statistical *finding* this session raised (the single-key exposure hazard) routes to B-351 slice 6, where `adversarial-reviewer` is already mandatory.
- Persona sign-off — Dir. of Eng ✓ (global-table constraint on B-451, sequencing) · Data Scientist ✓ (exposure-key hazard, collinearity trade) · Dr. Chen ✓ (real-vet gate, protein-clean gating) · Designer ✓ (notification dissent on record, Principle 6 on the report) · Jordan ✓ · Sam ✓ · QA ✓ (edge cases against each idea) · PO ✓ (row contract, backlog corrections) · T&S ✓ (conditions on B-451/B-452/B-453) · PM — seven decisions tabled.
- Future-self review — the deliverable is a dated review artifact (🧊 frozen convention): it is not version-bumped, and it should be pruned of the security enumerations once those close. Named in §8.
