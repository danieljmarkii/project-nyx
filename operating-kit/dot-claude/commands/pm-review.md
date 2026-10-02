---
description: Dispatch the pm-feature-review subagent for a fresh, un-anchored product walkthrough of a built feature, reported in the PM's QA-note taxonomy. Pairs with the hands-on pass; never replaces it.
---

# /pm-review — First-pass product review of a built feature

## Steps
1. **Scope.** From `$ARGUMENTS`, find the feature's screens, components and requirements doc (Glob/Grep if only a name is given; the PR's changed files if PR numbers are given). Pass through any screenshots.
2. **Dispatch `pm-feature-review`** with the feature name, the files, the screenshots and the spec. **Do not pre-explain what each screen means.** The un-anchored read is the point.
3. **Relay its output** in its taxonomy. Do not re-litigate its findings.
4. **Offer to act on the tail:** file 📋 backlog candidates as issues now; put ❓ decisions to the PM as decision briefs; tee up 🐞 items for a fixes branch or `/code-review`.

## Rules
- Static review. Surface every flow it marked INSUFFICIENT; those go to the hands-on pass.
- Scope decisions it surfaces are the PM's. Never silently expand scope.

$ARGUMENTS
