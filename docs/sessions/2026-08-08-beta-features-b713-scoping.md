# Beta features — the B-713 §4.3 Phase-2 scoping pass (D7–D9)

**Date:** 2026-08-08
**PR:** shipped via this session's PR (draft — docs-only, no app code, no schema)
**Track:** Beta features program (B-712); guardrails (B-713)
**Type:** Product decision (delegated by the PM). Resolves the §4.3 scoping pass that gated Phase 2 (PR 3).

## The ask

Resolve the three §4.3 residuals before Phase 2: the **graduation/kill policy** (per-beta owner + expiry), the **measurement/consent plan**, and the **scale mechanism** (hand-edited allowlist → premium check or a `beta_members` table). Record the outcomes as decisions; this unblocks PR 3. The PM delegated the calls to the team.

## The through-line

All three rulings say the same thing: **do not build ahead of the current scale.** The program today is *one client-only beta and a hand-picked dogfood cohort* (the PM's account). Each ruling installs a real-but-lightweight rule now and defers the heavyweight infrastructure to the concrete trigger that will actually need it — with that infrastructure's guardrails written down so the trigger doesn't ship it unexamined. The team converged; no persona conflict (the same convergence as the 2026-08-06 pre-mortem).

No user-facing surface changes, so no mock is owed (the PR-3 beta page keeps its round-1 mock; the registry's `owner`/`reviewBy` are internal metadata).

## Decisions (recorded as spec D7/D8/D9; §4.3.1–.3)

### D7 — Graduation / kill policy (B-713 #3; folds in #6)
Every beta is a typed row in a **`BETA_REGISTRY`** (`lib/betaFeatures.ts`, built in PR 3 — it is the shelf's metadata anyway, so the policy adds *fields*, not a structure): `key` / `title` / `blurb` / `owner` / `addedDate` / `reviewBy` / `serverCost`. Three terminal states — **graduate** (explicit GA call, FR-FLAG-5; leaves the shelf), **kill** (remove code + flag + row), **extend** (new `reviewBy`). **`reviewBy` is a review-by date, not an auto-disable** — it forces a decision, never surprises the cohort (auto-kill optimises tidiness over the owner's experience). Audited at the **periodic retro (new check #5)**, reusing an existing ritual. **Grandfather (#6):** a tester who had a beta never loses it to a later premium gate (Pets > $).

### D8 — Measurement + consent (B-713 #4; resolves OPEN-3)
**v1 measurement is qualitative** — reuse Settings → Support "Share feedback" (this *is* OPEN-3's resolution). You don't instrument a dozen dogfooders; you talk to them. Two signals are already server-visible **for free**: the allowlist *is* the known cohort, and `ai_usage` *is* a server-cost beta's usage trail (the widget spends no server resource, so it has none — the concrete reason its measurement is deferred). **No telemetry pipeline and no new consent surface in v1** — the local opt-in already *is* the consent, and nothing is transmitted. Keep opt-in **local** (D4 stands): mirroring it server-side for a metric re-introduces the health-data-adjacent boundary + consent question we're avoiding, and risks **bundling** "join" with "we measure you" (never one gate). Quantitative telemetry is a **rider on the scale decision (D9)** — cohort membership becomes server-visible as a property of the scale infra (`entitlements`/`beta_members`), so a separate pipeline is premature+redundant. When it lands it inherits the standing bar verbatim (B-375/B-016/B-047): a **separate** consent, **data-minimised to non-health events**, **owner-deletable**, in the **B-039** cascade.

Ground truth that shaped this: **there is no analytics pipeline today** (B-016/B-047 both Open), and the app's posture is data-minimisation (Ask persists no question text; photos transform-only). Beta telemetry is a T&S decision, not plumbing.

### D9 — Scale mechanism (B-713 #5)
The hand-edited `app_config` allowlist is **correct now** and has a **hard ceiling that is a privacy limit**: `fetchAppConfig` selects every `app_config` row for every signed-in client, so the *entire* allowlist array — every tester's UUID — is downloaded and cached on every user's device (why B-402 wipes that cache on sign-out). Bounded at a dozen dogfooders; an unbounded membership-leak at hundreds of "customers." So:
- **Now (≤ ~25 UUIDs):** keep the allowlist. Soft trip-wire ~25 internal testers, checked by the D7 retro audit.
- **Primary scale path = the premium check (`entitlements`)** — this *is* the already-ratified **D1 Gate-1 swap** (`isPremium OR uid ∈ allowlist`). Customers scale in **by being Premium** (per-account, RLS-scoped, no global-array leak); the allowlist shrinks back to internal testers. Matches the PM's own part-4 framing ("customers, *maybe premium*") and needs **no new beta-specific infra** beyond Track-3, already planned.
- **Conditional fallback = `beta_members` table + join flow** — the `entitlements` RLS shape for betas (per-account row, per-uid resolution, join surface). **Built only if a non-premium cohort > the ceiling is ever needed (a free open beta), never speculatively.** `rls-privacy-reviewer` mandatory (new access path).

**Why not build `beta_members` now** (the tempting over-build): it solves customer-scale-non-premium, a problem the program doesn't have, at the cost of a migration + RLS + a join UI + a privacy review, for one client-only beta and a nameable cohort. The premium path already covers the customer case the PM described.

## What this unblocks / bounds for PR 3

- **Build the `BETA_REGISTRY`** (owner/reviewBy/serverCost) as the shelf's source of truth; page maps over eligible entries; add the `serverCost` → server-gate test (documents D6 for beta #2).
- **Feedback = reuse Support**; no telemetry, no consent surface.
- **Scale = allowlist as-is**; no `beta_members`, no premium wiring (Gate-1 swap stays one line for Track-3).

## Files touched (docs only)
- `docs/nyx-beta-features-requirements.md` → **v1.1**: §0 adds D7/D8/D9 + resolves OPEN-3; §4.3 rewritten from "deferred" to "resolved" with §4.3.1–.3; §5 PR 3 gains the registry + feedback bullets; §6 PR-3 kickoff + §8 #5 updated.
- `docs/backlog.md` → B-713 **Resolved**; new **B-722** (`beta_members`), **B-723** (telemetry+T&S), **B-724** (grandfather).
- `STATUS.md` → Beta track: scoping resolved, PR 3 unblocked.

## Persona lenses
Product Owner (guardrails → decided, deferred builds re-filed as rows, not lost), Engineer (registry as the checkable source of truth; allowlist ceiling is a real privacy limit, grounded in B-402), Data Scientist (qualitative is the right tool at n≈dozen; measurement rides scale infra), Trust & Safety (opt-in ≠ telemetry consent; never bundle; the standing B-375 bar for any future logging), PM/wedge (none of this competes with the submission; premium path matches the stated part-4 vision).

## Residuals / next
- **Tier-2 edit flagged (not written unilaterally):** `personas.md` Periodic Process Retro — add **check #5, the beta-shelf audit**. Awaiting PM approval.
- OPEN-1 (name) and OPEN-2 ("N on") remain PR-4 copy calls (unchanged — not part of §4.3).
- **Next:** PR 3 (`app/settings/beta.tsx` + `BETA_REGISTRY` + opt-in), per the updated §5 / §6 kickoff.
