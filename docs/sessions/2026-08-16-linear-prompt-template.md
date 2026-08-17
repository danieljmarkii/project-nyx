# Linear → Claude Code prompt template — research, verification, adoption

**Date:** 2026-08-16
**Issue:** CUL-528 · **Shipped via:** #666 (draft)
**Mode:** DISCOVERY → adoption (research → product-team verification → one committed `CLAUDE.md` convention)

## What this session did

The PM adopted Linear's **"copy as prompt"** flow (copy an issue from Linear, paste into Claude Code) and asked whether we could beat Linear's generic default template. This session researched the feature, verified the change with the product team, and adopted a Nyx-tuned template — homing the durable rules in `CLAUDE.md` and delivering the template itself for the PM to paste.

## What shipped

- **`CLAUDE.md` § "Starting from a Linear issue"** — the durable read-path home for the launch ritual (**orient → name the mode → close out**), the **BUILD vs DISCOVERY** split, and the **BUILD plan-gate**.
- **The Linear prompt template** — delivered to the PM to paste into Settings → Code & reviews (a *work-path* config a session never reads and one not settable via API, so it lives in Linear, not the repo). One residual PM action.
- **CUL-528** — filed + reconciled.

## The feature (as researched)

- The coding-tool prompt template lives in **Settings → Code & reviews** (per-workspace). The generated prompt = the template + `{{context}}` (issue description, comments, updates, linked references, images). **Only two placeholders exist:** `{{issue.identifier}}` and `{{context}}`.
- **"Copy as prompt"** is a clipboard action alongside the auto-launch deeplink — the PM's flow (paste into Claude Code on web, which runs on a fixed `claude/<slug>` branch).
- Docs are ambiguous on whether the custom template rides along with the *clipboard* action (vs. only the deeplink), so the template ships with a **30-second sentinel check** to verify before relying on it. If it fails, the fallback is `CLAUDE.md`-only (~80% of the value — the durable rules are already there).

## Design — thin router, not a rulebook

- `CLAUDE.md` auto-loads in every session, so the template covers **only** issue-launch specifics and defers every standing rule back to the manual. This is also the robustness argument: the rules survive even if the template mechanism doesn't reach the clipboard.
- **Mode split (the PM's key insight):** execution vs. research/discovery work want different deliverables. **BUILD** → code + a draft PR + `/wrap`; **DISCOVERY** → a recommendation/brief posted to the issue, nothing merged, don't build the thing under evaluation.
- **Plan-gate** is the one net-new behavior — the field's most consistently-cited game-changer (plan before code; ~1/3 → ~2/3 success on complex tasks per Anthropic's guidance), corroborated across Cursor's and practitioner write-ups.

## Product-team verification — qualified GO

- **Eng ✓** — defer the reviewer references to "the DoD's mandated passes" rather than enumerating subagents (drift-safety).
- **PO ✓** — mode detection **inference-primary**; labels are aspirational (every sampled Culprit issue has `labels: []`).
- **QA ✓** — it's a behavior nudge, not a gate; the gates stay CI + the `main` ruleset + the DoD.
- **Data ✓** — routes *into* `clinical-guardrails`/the adversarial pass, opens no new data path.
- **T&S ✓** — added: anything touching RLS / Storage / deletion / export is **never "mechanical"** → always plan + `rls-privacy-reviewer`.
- **Designer light ✓** · **Dr. Chen / Jordan / Sam N/A** (internal tooling, no clinical or user-facing surface).
- **Guardrails on the decision:** keep the template thin (the bloat rule — a large auto-loaded context ignores bloated instructions); no label-enforcement infra yet; it's a nudge, not a gate.

## Residual / PM action

- Run the sentinel check (`SENTINEL-TEST {{context}}` → "copy as prompt" → confirm the preamble lands in the clipboard), then paste the template into Settings → Code & reviews. Fall back to `CLAUDE.md`-only if it fails.
- (Later) settle real label names if/when labeling becomes a habit, so mode detection can lean on them instead of inference.
