# Engines v3 PR-24: the per-incident read in tiers (discovery)

**Date:** 2026-09-28

Engines v3, Wave 4, PR-24 (CUL-1133 EN-3 + CUL-1134 EN-4; frames for CUL-819 and CUL-531). Discovery only, no code. Shipped via #967.

## What was produced

- **Mock round 1 on its own page:** `docs/culprit-incident-tiers-mockups.html`, published at https://claude.ai/artifact/Ug8BR3wCSgDVAgnZKmw3ao (separate from the Engines v3 mock that PR-20 republishes). It draws the tier-word map; the record for each tier (cat and dog); a surface-by-tier table plus Home band, History, gallery and spine frames; the spoken contract; the GA day (old words kept, a month split at the seam, installed builds unchanged); PMD-14 both ways; EN-5's question in four variants; CUL-819 (a)'s disclosure; CUL-531 three ways; EN-4's floor diagram; the sign-to-tier table (35 rows); and three decision briefs.
- **Spec v0.2:** `docs/nyx-incident-tiers-requirements.md`, the build contract for PR-25 to PR-28 and PR-30.

## Decisions proposed (none built)

- The tier is an additive column. Every writer dual-writes it; readers take the louder of the two columns; "earlier rule" comes from PR-10's rule-version stamp.
- Never-lower binds the call tiers only. A vomit with no photo read is `not_enough_to_say`, never `logged`.
- The report renders no tier. Copy as text carries dated facts only.
- EN-4's floor is a pure shared rule, stored server-side through a floor-only mode that makes no Storage, model or cap call. It drains from a durable local marker. The offline preview is a device claim the server must reproduce. There is one arrival per bout, and the 24 h re-run never re-sends a photo.
- Where two tables disagree, the louder row stands until harness proof, a PM ruling and the vet review (E-6).

## PM rulings (2026-09-28, "Defaults on K1, K2, K3")

- **K1, PMD-14 = A:** a photoless call now lands on its record; every call joins Home's band; a later raise is said on its log's completion. The incident spec's D2 and G3 are amended in place under ⚠ markers (v1.2). Unblocks PR-28 and PR-30.
- **K2 = drawn at render:** "part of a pattern" is never stored and shows only on `logged` reads in a live finding's evidence. This amends D1's stored fourth tier. PR-25's tier column has four values. Unblocks PR-25.
- **K3, CUL-531 = C:** the observation is scoped to the photos read. Builds in PR-27.

The mock was republished as one proposal: option B of K1 and options A and B of K3 left the page, and a ledger at the top maps the ruling to what moved.

## Review

- **adversarial-reviewer on v0.1: FAIL**, 13 findings. Six rows showed an owner something calmer than today with no "quieter" mark: the feline intake arm, species "other", the 30-min merge and found-pile counting, the missing stool rows, rescue writes that skip the tier, and a photoless vomit labelled calm. Never-lower also pinned calm reads against the partial-read collapse; the pattern chip relabelled history; the watch-for clauses promised tiers the rows don't give; the phone's claimed tier was trusted blindly; a preview could be announced twice; and "What to tell them" could carry the model's note. **All 13 were applied in v0.2** (spec §13). Held: an escalation over an escalation never steps down; the re-run makes no Storage or model call; the report renders no tier.
- Designer, `nyx-voice`, `clinical-guardrails` (Patterns 1, 2, 7, 8, 9, 10) applied by hand to every drawn string. The voice pass on the rewritten watch-for clauses is still owed a fresh read (C-28), which is due at PR-27.

## Follow-ups

- The contested rows (T3, T4, T5a, T5c, T6, T10, T10b, T13, T14, T17, T18, T22, T23) go to CUL-583 and CUL-1312 as one packet.
- EN-5's "A little" mapping and the answer's storage shape depend on CUL-1118 (D2).
- Tier-2 edits: incident screen D2/G3 written (K1 = A). Still awaiting approval: the vet report "no tier" line. clinical-guardrails Patterns 1–2 are rewritten in PR-26.
