# 2026-08-20 — The "App Store Launch" Linear project: consolidation, consultant pass, persona review, publication

**Branch/PR:** `claude/app-store-submission-readiness-bix9m0` — docs-only (this record + two tracker syncs); shipped via the session PR.
**Linear:** project **App Store Launch** (team Culprit) — https://linear.app/projectnyx/project/app-store-launch-57bc8d011b9d

## What this session was

The PM asked to move app-store-submission management out of "haphazard .md checklists" into a Linear project: (1) deep-review current state, (2) re-verify Apple's requirements as of now, (3) take an App Store submissions consultant's pass, then draft the project + tasks for review before publication. The PM added one process gate after reviewing the draft: **run the product-team personas over the plan before publishing.** Both the draft and the persona-reviewed revision were approved in chat; the PM said "Publish!" and the project is live.

## How it ran

1. **State review** — readiness register + submission guide + hardening audit + the 2026-08-09 store-side docs (listing copy, screenshot plan, privacy answers, age rating) + STATUS.md + live production checks (edge functions, `app_config` flags) + a very-thorough repo audit subagent. Headline: guide steps 1–7 done+verified; nearly all remaining *code* had shipped since the trackers were written (B-280 recovery ON, auth-debug probe deleted, demo seed #627 + notes #628, beta shelf + widget gates, sync durability); what remained was overwhelmingly PM device/dashboard gates + store-side entry + the build cut.
2. **Consultant pass** (research subagent, every claim checked against live Apple docs 2026-08-20). Material findings: **5.1.2(i)** (rev. 2025-11-13) requires explicit permission before user photos go to third-party AI — the one new hard blocker (analysis auto-fires on log today); the **DSA trader question** is unavoidable at first submission; the **age-rating questionnaire** gains mandatory social-media questions for new apps from Sept 2026; Accessibility Nutrition Labels are optional today (no live deadline); SIWA not required; one 6.9″ screenshot set suffices; Xcode-26 gate satisfied (SDK 57/EAS); submit as **1.2.0** (never reset); phased release doesn't exist for a first release → manual release; a "Beta features" shelf risks Guideline-2.2 pattern-matching → rename.
3. **Persona review, four isolated passes** (Dir. of Eng + QA · Trust & Safety · Designer + Jordan/Sam + Dr. Chen · Product Owner/Backlog Steward): **4/4 PUBLISH-AFTER-EDITS, zero holds.** The big edits:
   - **AI consent redesigned by three converging lenses:** consent = *mutable account state + append-only legal record* (`legal_acceptances` cannot represent decline — migration 032 is append-only by construction); placement moves to **onboarding** (the B-270 precedent: Principle 1 forbids decisions at moment of *event*, not setup) with a first-open ask for existing accounts and a pre-upload **backstop keyed on absent server-side state**; enforcement is **server-side** in `_shared/incident-analysis.ts` (a client gate either kills the deterministic escalation for decliners or leaks via detail-mount and the ask/A8 path); *decline gates only the Anthropic call, never the deterministic escalation* (pinned by a test mirroring `analyze-vomit/index.test.ts:67`); Settings toggle both directions in v1; the "analysis off" state is a status never a verdict.
   - **Critical path corrected:** it's the consent build **plus the CUL-54 chain** (R1's "do NOT cut" hold is a standing ruling; its sitting produces a real `lib/dietTrialCard.ts` PR) — both start day 1.
   - **Deploy currency widened:** the demo's benign vomit photo would exercise the pre-#671 reassuring-description path live in front of the reviewer → the analyze pair deploys first (A8 order), then `generate-report` (+B-743), reconciling the v13/v14/ledger-hold three-way disagreement on the record.
   - **Product Owner caught five mapping errors** before they hit the board: T16→adopt CUL-54 (not new; five Urgent/High clinical rows would've been stranded), T3→adopt CUL-219, T2→adopt CUL-70, T20→adopt CUL-113, T17 also adopts CUL-39; plus status corrections (CUL-50 stale In-Progress; CUL-126's "go-live flips" already shipped/superseded; CUL-265 = a second launch checklist to cancel-as-superseded).
   - Other keepers: frame 6 of the screenshot plan contradicted ruled DB-1 (→ plain cards; receipts at v1.1); the "Early access" rename has hidden sites (per-card "Beta" pill, a11y labels that would *speak* "beta"); D4 gained option (c) **US-only** (the ratified legal docs literally say US-only; EU-exclusion alone leaves UK/CA/AU under mismatched paperwork); new **D9** (the `nyx-pet-photos` public-bucket call at its cheapest moment — bucket empty); **D10** (consent scope: whole-Anthropic-boundary rec); **D11** (a genuine unresolved QA-vs-Eng conflict on the QA sitting's scope — escalated to the PM in Conflict-Protocol form).
4. **Publication** — everything below.

## What was published (2026-08-20)

**Project:** App Store Launch (In Progress, High, 🚀) — description carries the critical path, D1–D11 decision briefs, scope fence, provenance; 8 repo-doc resources linked (repo file wins on divergence).
**Milestones:** M1 New review blockers (code) → M2 Record green (QA + dashboards) → M3 Demo account + deploy currency → M4 Listing complete in ASC → M5 Build, verify, submit → M6 Review week + post-launch fence.

**New issues (11):**
| ID | Title (short) | M | Pri |
|---|---|---|---|
| CUL-552 | AI photo-analysis consent (5.1.2(i)) — state + server gate + toggle | M1 | Urgent |
| CUL-553 | Auth dashboard checks + prod test-user cleanup | M2 | Med |
| CUL-554 | AC-6 cross-account logout-wipe QA | M2 | Med |
| CUL-555 | Pet-photo upload verification (42501 OQ) | M2 | Med |
| CUL-556 | Consolidated pre-submission device QA sitting | M2 | Med |
| CUL-557 | Deploy currency for the review-visible function set + cold read | M3 | High |
| CUL-558 | ASC declarations: DSA/availability, age-rating delta, accessibility label | M4 | Med |
| CUL-559 | Cut the production build (1.2.0) + built-artifact verification | M5 | High |
| CUL-560 | Assemble the submission + submit | M5 | High |
| CUL-561 | Review-week ops: re-seed cadence + rejection playbook | M6 | Med |
| CUL-562 | Day-1 watchlist + the v1.1 plan | M6 | Med |

**Adopted (14, with adoption notes appended where scope narrowed):** CUL-188 (demo live seed, →High, M3) · CUL-66 (B-657, M2, +leaked-password protection, template line moved out) · CUL-161 (privacy label, M4) · CUL-173 (listing+screenshots, M4 — moved out of Signals v2) · CUL-200 (legal finalization, M4) · CUL-43 (confirm-link device pass, M2) · CUL-219 (auth email templates, M2) · CUL-70 ("Early access" rename = PR-4 slice, M1) · CUL-54 (the R1 sitting anchor, M5-gating but starts with M1; adjudicates CUL-57/59/60/61) · CUL-39 (closes via CUL-559 step 5, M5) · CUL-113 (B-016 D7-rescoped: ErrorBoundary+handlers now, Sentry v1.2.1, M6, →Med) · CUL-442 / CUL-465 / CUL-475 (M6).

**Status corrections:** CUL-458 → Done (residual-mapping comment) · CUL-471 → Done (comment resolves "Partial") · CUL-50 → Done (shipped #503; residual = CUL-59, on CUL-54's adjudication list) · CUL-126 → Todo/Low, description patched (go-live flips shipped/superseded; remainder = feedback backend only) · CUL-265 → Canceled as superseded (one launch checklist, not two).

**Dependency graph:** CUL-557 blocks CUL-188 and CUL-64 · CUL-188 blocks CUL-173 (pre-existing) · CUL-552 + CUL-54 block CUL-559 · CUL-559 blocks CUL-560.

**Decisions open (in the project description):** D1 subtitle · D2 §5.2 metering · D3 operator legal name/effective date · D4 availability (rec: US-only) · D5 accessibility label (rec: yes) · D6 R1 sitting vs explicit override · D7 crash visibility (rec: ErrorBoundary+handlers now) · D8 rename (PM-endorsed) · D9 pet-photos bucket posture (rec: flip private while empty) · D10 consent scope (rec: whole Anthropic boundary) · D11 QA-sitting scope (unresolved persona conflict).

## Repo edits this session (this PR)

- This session record.
- `docs/app-store-submission-guide.md`: tracker header now points live tracking at the Linear project (the CUL-265 one-checklist lesson applied to ourselves); step-11 row un-staled (#627/#628 shipped, account created).
- `STATUS.md` (minimise-the-diff): the `generate-report` deploy bullet corrected (live is v14, deployed 2026-07-30 evening — the bullet predated it; reconciliation + current-main redeploy now owned by CUL-557); the "16-step runway" action item now points at the Linear project.

## Notes for future sessions

- **Every issue carries a paste-ready kickoff prompt** (the PM's chosen workflow: paste per issue into Claude Code and execute). Confirm-lines for PM steps post back to the issue.
- The two long poles started today should be first: **CUL-552** (consent) and **CUL-54** (the sitting). D1 unblocks CUL-173's both halves.
- Deciding D9 before CUL-555/CUL-200, D7 before CUL-161, D10 inside CUL-552's kickoff.
- The scratch master used for review lived in the session scratchpad; the Linear issues are now the canonical task text.
