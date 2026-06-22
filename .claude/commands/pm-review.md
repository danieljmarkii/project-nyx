---
description: Dispatch the pm-feature-review subagent — a fresh, un-anchored product walkthrough of a built feature (wedge / 7 principles / Pets > $ / voice), reported in the PM QA-note taxonomy. Pairs with the device pass; doesn't replace it.
---

# /pm-review — First-pass product review of a built feature

Get a fresh, un-anchored PRODUCT read of a feature *before or alongside* the on-device QA pass. It's the product sibling of the review subagents (`code-reviewer` for correctness, `adversarial-reviewer` for statistics, `rls-privacy-reviewer` for access) — it walks the feature's flows as the target owner and reports confusions, principle/voice gaps, missing follow-ups, and PM decisions in the same taxonomy you'd triage a QA pass with.

Use it when a feature (or a cluster of PRs) is built and you want the "would a real owner get this?" read surfaced from the code, not discovered by hand on the phone.

## Steps

1. **Scope the feature.** From `$ARGUMENTS`, identify the feature and its surfaces. If only a name is given, Glob/Grep for the screens + components + its `docs/nyx-*-requirements.md`. If PR numbers are given, gather their changed files. If the PM attached screenshots/renders, pass those through — the visual matters.

2. **Dispatch the `pm-feature-review` subagent**, handing it: the feature name, the surface files/PRs it should walk, any screenshots, and the relevant requirements doc. Let it run isolated — do **not** pre-explain what each screen "means"; the un-anchored read is the whole point.

3. **Relay its structured output** to the PM (the broken / works-but-confusing / design-gaps / missing / PM-decisions / backlog taxonomy + per-flow verdict). Don't re-litigate its findings; surface them.

4. **Offer to act on the tail:**
   - File the **📋 backlog candidates** into `docs/backlog.md` (per the Backlog Protocol — capture immediately, don't batch).
   - Add the **❓ PM decisions** to the Open Questions table.
   - Tee up the **🐞 broken** items for a fixes branch (or hand to `/code-review` for correctness depth).

## Rules

- This is a **static product review** — the subagent reads screens as a proxy for the rendered app; it cannot tap a device. Always frame its output as pairing with the human device pass, not replacing it, and surface any flow it marked INSUFFICIENT (needs a screenshot / device check).
- Product **scope** decisions (new features the review surfaces) are the PM's call — route them to Open Questions, never silently expand scope (same discipline as the backlog-groomer).
- Defer correctness depth to `/code-review` and clinical/statistical falsification to `adversarial-reviewer`; this command owns product coherence, not bug-hunting.

$ARGUMENTS
