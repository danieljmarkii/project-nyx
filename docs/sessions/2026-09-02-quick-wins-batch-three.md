# Quick-wins batch #3 — five XS fixes in one stacked PR, verify-first

**Date:** 2026-09-02
**Shipped via:** #794 (draft) — CUL-753, CUL-506, CUL-625, CUL-710, CUL-167. Plus one new issue filed from the mutation ledger with no code: CUL-783.

## What this session was

The third run of the batch shape ratified this morning (`2026-09-02-quick-wins-batch-two.md`): sweep the `Quick Win` label, verify every candidate at file:line before claiming it, work sequentially on one branch, one commit per issue, one stacked PR naming every CUL id. The session prompt also carried five token rules from the post-mortem — check `git status` before the first commit, push once and end the turn, two Linear writes per issue, one foreground code-reviewer told what is already proven, one-line status while waiting — and this record notes where each held.

## The selection, and what verification changed

The prompt named three starters (CUL-753, CUL-506, CUL-625) and asked for two more from the label. Twelve issues were read; five were claimed. The label's ~60% staleness did not bite this time: none of the five had been shipped under another id, and no duplicates were found. What verification did change:

- **CUL-625 counted two copies; there are three.** The TL;DR said three, the Why named two (`EventRow`, `dayEvents`); `TodayZone.tsx:178` is the third. Corrected on the claim.
- **CUL-710 named the wrong third file.** The issue lists `TimeEditSheet.test.tsx`, whose `nearestResponder` does not require `accessible`; the verbatim third copy is `PastMedicationsSection.test.tsx`, added by CUL-318 after the issue was filed. `profile.test.tsx` has a fourth, looser walk (starts at `.parent`, accepts `accessibilityRole`). Both looser walks were left alone rather than silently changing what they assert; noted on the issue.
- **CUL-705 (hero photo failed-load state) was passed over**, not because it is big but because its own description names "the only genuinely open question" — whether the failure is named beside *Change photo*. A design decision fails the filter. Its file:line is also stale (`profile.tsx:910` is now `:1048`); left for whoever builds it.

## What shipped (one commit each)

1. **CUL-753 — rundown weight + meds tiles land on their cards.** `app/rundown.tsx` pushed the bare Pet tab for both; now `meds` goes through `profileFocusHref({ focus: 'medications' })` (the tile names no single med, so it takes the section fallback CUL-170 built) and `weight` is a third `ProfileFocus` value with an `onLayout` passthrough on `WeightTrendCard` and a `weightAnchorY` on the profile screen. The one design point, and the reviewer's first nit: the first cut gated the weight scroll on the same `focusContentSettled` as the other doors, but the weight card sits ABOVE the sections those loaders fill, so its top is final the moment it lays out and the gate only delayed an arrival that was already correct. Narrowed in the follow-up commit: the weight door waits on nothing but its own anchor, with a test that holds the trial read open and still expects the scroll. New `app/rundown.test.tsx` pins the tap-to-route mapping, the one thing that lived nowhere else and so shipped wrong.
2. **CUL-506 — the dead severity step pruned.** 124 lines out of `app/log.tsx`: the `'symptom'` step, `SEVERITY_CONFIG`, the `severity` state, ten style entries (the `divider` was used only there). The two write paths that read the state received `null` on every reachable path and now say so literally. `tests: N/A` — the screen has no jest harness; `tsc` is the proof.
3. **CUL-625 — one meal/treat row-label rule.** `mealRowLabel(foodType)` in `lib/food.ts`, which all three surfaces already imported and which sits outside the Edge Function closure (checked against the twelve closure files). The leftover decision the issue asked for: `'other'` and `null` read "Meal", the shipped behaviour on all three surfaces made deliberate. A source-scan test pins that the three files call it and never restate the literal.
4. **CUL-710 — the responder-walk helpers extracted** to `testUtils/tree.ts`, typed against a structural `TreeNode` that `ReactTestInstance` satisfies. The typed return surfaced four `possibly null` sites; three already asserted `not.toBeNull()` on the line above and took a `!`, the fourth gained the assertion.
5. **CUL-167 — `OwnerNameRow` reads the user from the store.** `useAuthStore((s) => s.user?.id ?? null)` replaces the mount-time `getSession()`; the effect keys on `[userId]`. A new two-test suite.

## Mutation ledger

Every new test was run red against its restored defect before being trusted; the tree came back byte-identical after each (git stash for tracked files, a scratchpad copy for the untracked helper).

| Test | Mutation | Result |
|---|---|---|
| profileFocus "accepts the three sections" | `ProfileFocus` restored to two values | red |
| profileFocus "names the weight card for the rundown tile" | same | **green** — a shape pin, not a guard (`profileFocusHref` never validated the focus); recorded as such |
| profile.focus "lands on the weight card" + "fires once" | same | red ×2 |
| rundown "weight tile" + "meds tile" | `rundown.tsx` restored to the bare push | red ×2 |
| WeightTrendCard "forwards onLayout to the card itself" | passthrough removed | red |
| food "is the only place the word is spelled" | the three call sites restored to their ternaries | red |
| food "reads Treat…" + dayEvents ×2 | helper answers "Meal" always | red ×3 |
| food "decides the leftovers" | helper decides `other`/null as "Treat" | red |
| profile.focus "does not wait on the sections below it" (follow-up) | gate restored to the broad one | red |
| OwnerNameRow "reads the signed-in user from the store" | row restored to the `getSession` read | red (on the assertion; a first draft of the mock tripped the TDZ instead and was rewritten to live inside the factory so the red is the right red) |
| OwnerNameRow "settles without a read when nobody is signed in" | same | green — a behaviour pin |
| SimpleEventConfirm floor test; PastMedications orphan test | shared `owningTouchable` returns the node itself | red ×2 |
| TimeConfidenceField identity tests | same | **node OOM**, not a clean red: a failed `toBe` on two `ReactTestInstance`s makes jest pretty-print the whole circular tree. Pre-existing property of those assertions; red either way; filed as CUL-783 |

Full suite 302 suites / 6441 tests green; `tsc --noEmit` clean; the pre-push hook re-ran both.

## DoD

- AC: N/A — backlog quick wins beside Step 9; no build-step criteria apply.
- Anti-patterns: none introduced (theme tokens only; no raw `Text` added; no `disabled` as chrome; the helper lives outside the Edge closure and `guards/edgeFunctionDeploy` is green).
- `tsc` clean; jest 302/6441 green; no schema; no secrets.
- Persona sign-off: Engineer ✓ (one commit per issue with the diff matching the message; the CUL-506 `tests: N/A` exemption is the Engineer's) — Designer ✓ (CUL-753: the consult-room surface lands where the tile said; CUL-625: "Treat"/"Meal" copy unchanged) — Data Scientist N/A (no data-model or correlation logic touched) — Dr. Chen N/A — Product Owner ✓ (two issue descriptions corrected on claim; one new issue filed with file:line evidence). Adversarial review: N/A — nothing in the batch touches detection, escalation, an AI read, or the vet report's content.
- code-reviewer: **ship-ready, all five clusters.** It re-verified the per-commit split (no cross-commit contamination), the Edge closure, the CUL-506 unreachability (`Step` is file-local; `hasSeverity` false everywhere; the dropped `severity` key is behaviour-identical to `insertSimpleEvent`'s `?? null`), and the CUL-167 cold-start ordering (`app/_layout.tsx` populates the store before any authenticated route renders). Two nits and one cleanup note, all taken in a follow-up commit before the docs push: (1) the weight door's gate, above; (2) an orphaned `// ── Severity ──` header left in the styles; (3) `EVENT_TYPES.meal.label` and `mealRowLabel` now spell "Meal" from two literals, so the helper's comment names the other and a taxonomy rename visits both. It also noted, unprompted, a pre-existing sign-out edge on `OwnerNameRow` (a stale name could flash if the store's user flips to null before navigation unmounts the screen); neither the old nor the new code handles it, it is unreachable in the real sign-out flow, and it was left alone.
- Future-self: `testUtils/tree.ts` is the only new location (a root-level test-utility directory, sibling to `guards/`); yes, still wanted in 12 months, and CUL-783's readable-failure helper has an obvious home in it.

## Process notes — the token rules, applied

- **`git status` before the first commit**: clean (the last batch's mis-attributed hunk cannot recur from pre-staging).
- **Push once, then end the turn**: the first push carried the five commits and the pre-push hook's full suite; the draft PR was opened from it. The reviewer's three follow-ups and this record ride in a second push, as one code commit kept separate so each issue commit still matches its message (moot after the squash) plus the docs commit, which is the exception the wrap rule already allows. The container restarted between the push and the PR; the push had completed, so nothing was lost.
- **Two Linear writes per issue**: a claim (comment + In Progress) and an outcome comment. No In Review step.
- **One foreground code-reviewer, told what is done**: launched once after the push with the mutation ledger in its prompt and the `cp -r` rule.
- **Verification is still the win**: three of the five issues had a wrong or stale premise detail (a missing third copy, a wrong third file, a moved line), none of which changed the fix but all of which would have cost the build session a wrong turn.
