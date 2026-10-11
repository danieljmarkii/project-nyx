# AI consent PR 2 — the server-side consent gate

**Date:** 2026-10-11
**One thing:** T5 L1 — Edge Functions: the consent check lives on the server because the server makes its own AI calls · check: pending

Shipped via #1187 ([CUL-1810](https://linear.app/projectnyx/issue/CUL-1810), PR 2 of 3 under [CUL-552](https://linear.app/projectnyx/issue/CUL-552)). Branch `claude/gallant-meitner-70p26f`.

## What shipped

Every Anthropic call the server makes now asks the owner's `ai_consent` row first (migration 100, applied earlier the same day), through `service_role`, keyed on the uid `auth.getUser()` verified. Only `granted === true` is a yes; a missing row, a read error or a throw is a no.

- `_shared/aiConsent.ts`: the one reader.
- **Photo reads** (`_shared/incident-analysis.ts`, so analyze-vomit, analyze-stool and Ask's A8 reads):
  - A `consent_declined` gate state, decided before the flag and the counter: no unit, no download, no model call.
  - It takes the flag-off branch: a contextual flag still writes `worth_a_call`; otherwise the row is `read_disabled`.
  - It fails closed when the caller is not the pet's owner.
- **Signal:** phrasing needs the flag AND consent, so a decline means templates and never a blank. The phrasing functions' `= true` defaults are now required parameters (C-37's default rule).
- **Ask:** a deterministic `consent_off` deflection before any unit, record read or model call, led by the engine's live safety finding. It reuses the `unsupported` outcome so shipped builds render it, and it carries no chips, because a chip re-asks.
- **Both extractors:** the existing `feature_disabled` body.
- `_shared/aiConsent.guard.test.ts`: discovers every function file naming the endpoint, the key or the two mandatory headers, and requires each to be registered and to read consent for `user.id`.
- **Holds:** all six changed functions are held in `deploy-manifest.json` until PR 3's client is live. No account has a row yet, so deploying now would switch off every AI feature with no way to say yes.

## Decisions

- **PM:** "Go" on the plan, taken as yes to both recommendations: the deploy hold, and gating the extractors in this PR.
- **Team calls, logged on CUL-1810:**
  - `consent_off` has no chips.
  - The caller ≠ owner fail-closed.
  - The wider guard regex.

## Reviews

- **adversarial-reviewer, pass 1: FAIL.** The gated branch wrote `visual_flags: []` and a context-only sentence over a stored read. An owner who withdrew after a read showing blood therefore lost "blood" from the card, though the verdict stayed `worth_a_call`.
  - Fixed by `storedPhotoFinding()`, shared with the floor-only writer that already did this right.
  - Pass 2: PASS. Its five wording residuals all err loud and are filed as [CUL-1822](https://linear.app/projectnyx/issue/CUL-1822). Its two untested branches (the context-flag merge, `modelEscalated`) are now pinned.
- **rls-privacy-reviewer: PASS.** Both hardening items were taken:
  - The `ownerId !== user.id` fail-closed.
  - The `anthropic-version` / `x-api-key` discovery, after it proved by mutation that a URL built from pieces escaped the guard.
- **Mutation proofs:** 21 mutations across the gate, each red on behaviour. Two first runs went red only on a type error and were re-run type-clean.

## Residuals, recorded on CUL-552 as conditions for lifting the hold

- **Declined needs a client frame.** `VomitAnalysisSection` / `StoolAnalysisSection` render nothing for `read_disabled`. With the gate live, every declined owner's photographed incident with no context flag would lose the watch-for and when-to-call guidance a photo-less log shows. PR 3 must give that state a frame.
- **Old builds.** Owners on pre-PR-3 builds can't say yes once the hold lifts. That fails closed and is compliant, and the lift PR says so.
- **Households.** B-292 needs a PM ruling: "owner AND caller, a no from either wins".

## Numbers

- Deno: 2,691 → 2,729 tests, all green; `deno check` clean.
- Jest guards: 1,222 green.
- CI on #1187: five of five green.
