# Competitive-landscape team review → the Category Play (swing-for-the-fences roadmap)

**Date:** 2026-07-26

The PM asked the product team to convene over `docs/culprit-competitive-landscape-2026-07.md` (review the findings, discuss ideas, recommend priorities) — then, on the first read-out, ruled the direction: **"swing for the fences."**

## What happened

1. **Ground-truth pass first.** The review (dated 2026-07-25) had already drifted in 24 hours, in our favor: B-417 PRs 1–3 shipped (#450/#453/#456 — `diet_trials` finally has a write path, the review's single most important finding is mid-close), CI shipped and gated (#440), password recovery PR 1 + verified SMTP landed (#444/#445), B-431 was filed for the anon-writable bucket, and B-351 Phase A completed the *report* half of multi-protein (#448). Still open from the review: B-397/B-248/B-431 security triad, the engine half of multi-protein (Phase B + B-416), reminders (gated on the B-288 open question), household sharing (gated on B-292's OQ2), the real-vet read (PM action open since 2026-07-02), and a possible stool-red-flag deploy discrepancy vs `generate-signal` v25 (flagged for verification).

2. **Full persona convening.** Each lens gave its read; the review's §12 conflict (differentiator-first vs table-stakes-first) was surfaced per protocol and *sharpened*, not resolved: B-417 is mid-stream (so the fork is really about the next concurrent track), and Ask's standing "next main project" ruling (2026-07-18) predates the landscape entirely — a third position neither review camp named.

3. **The PM chose ambition → the team produced `docs/culprit-category-play-2026-07.md`** (proposed, unratified): own the elimination-diet category end-to-end. Gate 0 (security/auth hygiene) + five swings — **1** finish the trial + true multi-protein engine (the only app that can actually run an elimination trial) · **2** household + confirmations as *contamination control and retention*, not table stakes · **3** the anti-portal: a one-shot, no-account vet response leg on the shared report (counter to CompanAIn buying the reader) · **4** real-vet R1/R2 → a published-validation program (B-614) · **5** claim the category publicly (ASO land-grab gated on B-615 volume data, independence positioning, pricing-shape reconciliation vs D-M5). Explicit not-list: hardware, Android-now, portal, chatbot, social, emerging-signals, paywalling anything in the trial loop.

## Decisions made

None ratified — the plan is a proposal by design. Its §6 checklist (D1–D9) names every PM ruling it needs: B-288, B-292 OQ2, the vet-loop Open Question, pricing shape vs D-M5, Ask re-sequencing, the review's §11 Tier-2 edits, the R1 email, and the B-416 Class-B sub-decision.

## Repo changes

- `docs/culprit-category-play-2026-07.md` — new (the proposal).
- `docs/backlog.md` — added **B-614** (published-validation program, Later) and **B-615** (ASO keyword-volume validation, Next). Protocol-sanctioned additions; no scope invented beyond them.
- `STATUS.md` — one pointer added at the top of Open PM Action Items to the §6 decision checklist.
- Session record: this file. Shipped via the session's draft PR (branch `claude/competitive-landscape-review-hatjh1`).

## Persona flags raised

- Designer's channel-trust dissent on B-288 restated (again) — recorded in the plan's §7, awaiting the D2 ruling.
- T&S named Swings 2/3 as the two largest access-surface expansions in the product's history; `rls-privacy-reviewer` is a merge gate on every PR in both, and B-041 (export) joins Gate 0's tail.
- Dr. Chen hard-gated Swing 5 (claims) behind Swing 4 (proof), and bounded Swing 3 to "a note in the record, never relayed medical advice."

## Known issues / deferred

- The stool-red-flag deploy discrepancy (review §3.2 vs STATUS's v25 claim) — needs a `list_edge_functions`/bundle read-back; folded into Gate 0.
- No app code, no schema, no build-phase change this session — docs and backlog only.
