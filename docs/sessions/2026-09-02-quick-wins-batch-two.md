# Quick-wins batch #2 — five XS fixes in one stacked PR, verify-first

**Date:** 2026-09-02
**Shipped via:** #792 (draft) — CUL-659, CUL-711, CUL-703, CUL-709, CUL-505, CUL-318, CUL-501. Plus four Linear reconciliations with no code: CUL-136 → Done (already shipped by CUL-170), CUL-537 → duplicate of CUL-536, CUL-225 → duplicate of CUL-703, and a verified-premise note on CUL-620.

## What this session was

The PM asked whether the one-issue-per-session workflow could be batched: sweep the `Quick Win` label, pick three to five independent items that need no PM input, and ship them from one session. The answer was that this repo had already run the experiment three times — the Aug 1 planning doc (#529) that fanned out into sibling sessions, the Aug 4 fourteen-item stacked PR (#586), and the Aug 20 verify-then-act pass (#685/#686) that found five of the top eight issues already implemented — so the shape was chosen from the record rather than invented: **one session, verify every candidate against the code first, work sequentially, one commit per issue, one stacked PR naming every CUL id.** The PM ratified that shape and asked for a sanity check on whether five was too many. It was not; the count was never the risk (see *Process notes*).

## The selection, and what verification changed

Of 98 open `Quick Win` issues, twelve were read closely. Selection filter, carried over from #529: no open PM decision, plumbing already built, at most one review gate, disjoint files. Three of the twelve fell out on verification rather than on effort:

- **CUL-136** (trial strip lands at the top of the Pet tab) was already fixed — `TrialStrip.tsx:40` uses the CUL-170 anchor and `TrialStrip.test.tsx` pins it. Closed Done with the evidence. The Aug 20 finding that this label runs ~60% stale is still true.
- **CUL-536 / CUL-537** are the same issue filed an hour apart (CUL-537's own TL;DR says so). CUL-537 closed as the duplicate.
- **CUL-225 / CUL-703** describe the same two lines; CUL-703 is the post-CUL-606 statement (drop the keys, never read-and-preserve). CUL-225 closed as the duplicate when CUL-703 shipped.

And one was excluded because its premise was wrong, not its size: **CUL-620** says the tab bar's `accessibilityRole="button"` → `"tab"` is a one-word fix. It is not. `RCTViewManager.m:105` maps `tab` to `UIAccessibilityTraitNone`, so the item would lose "button" on iOS and gain the word "tab" only through `accessibilityValue`; the "N of 4" positioning comes from `UIAccessibilityTraitTabBar` on the *container* (`tabbar`). That needs a device pass, which fails the filter. Noted on the issue with the file:line evidence rather than built — the CLAUDE.md "verify the surface does the thing at file:line before building on it" habit, applied to a one-liner.

## What shipped (one commit each)

1. **CUL-659 + CUL-711 — the last two `?? activePet?.name` rungs** (`NamedCompletionCard.tsx`, the combo-confirm sheet in `app/log.tsx`) go through `resolveRecordPetName`. Beyond the two one-liners, the CUL-574 class now has a guard: `guards/recordPetName.test.ts` scans for the fallback *shape* (`??` coalescing into `activePet?.name`, on one line or split across two), spares direct reads of the active pet on active-pet-scoped surfaces, spares the shape in prose, and takes a `// record-pet-ok: <reason>` exemption within two lines above the site. Fixture self-tests live under `createFixtureRoot` (CUL-712). **Run against the pre-fix tree first: exactly the two sites, by name.** That is the whole justification for writing a guard for a two-line fix — CUL-574 fixed six sites and three more were then found by grep over three weeks; a class found by grep four times is held by a scan, not by the fifth grep.
2. **CUL-703 + CUL-709 — completion-card `savePicker`.** The explicit `severity: null, notes: null` are gone from both cards (updateEvent clears an explicit null and preserves an omitted key, so the first meal/dose path that writes a note would have had it erased by a time edit, with nothing failing). `pickerOpen: boolean` became `pickerFor: string | null`, the eventId the sheet was opened for, so Save refuses and closes when `present()` swapped the payload in place — the same guard `undo` / `patchTrialFlag` / `patchDoubleDose` already carry, one layer out. Unreachable today (the sheet is a full-screen Modal); the guard is for the first non-interactive presenter. Decision taken in-session: on a mismatch the sheet **closes silently** — the draft describes a row no longer on screen, the card stands and now shows the new record, and a message would narrate a race the owner cannot perceive. The `momentStore` `undo` comment's "only unguarded action" claim is corrected.
3. **CUL-505 — `handleBack` clears the photo and note.** Four state resets added to the existing reset block. A Vomit photo rode into the next Lethargy log after Back; photos carry the clinical weight on that row, so this was the highest-value item in the batch despite being the smallest diff. `tests: N/A` — `app/log.tsx` has no jest harness; the manual QA script carries it.
4. **CUL-318 — Past medications rows tap through** to `/medication/[id]`. The `item:unspecified` orphan stays a plain `accessible` View, never a disabled touchable (CUL-682), and the chevron is drawn only where there is somewhere to go. New five-test suite asserts tappability by walking up to the responder host (CUL-579), not by `fireEvent.press`.
5. **CUL-501 — orphaned `store/attachmentStore.ts` deleted** with its test, plus the stale spec tree line and the stale `app/log.tsx` comment.

## Mutation ledger

Every new test was proven by mutation before being trusted (the CUL-613/CUL-621 rule), and every mutation was applied to a backup-restored copy so the tree came back byte-identical:

| Test | Mutation | Result |
|---|---|---|
| `guards/recordPetName` live scan | run on the pre-fix tree | red: `app/log.tsx:624`, `NamedCompletionCard.tsx:267` |
| Named card "falls to the anonymous form" | rung restored | red |
| Meal + Med "writes nothing when another log replaced the card" | swap guard deleted | red ×2 |
| Meal + Med "never restates notes or severity" | `notes: null` put back | red ×2 |
| Past meds "plain row, never a dimmed control" | orphan made a `disabled` TouchableOpacity | red |
| Past meds "opens that medication" | `onPress` removed | red |
| Past meds "chevron only where there is somewhere to go" | chevron drawn on the orphan | red |

Full suite 300 suites / 6429 tests green; `tsc --noEmit` clean; the pre-push hook re-ran both. `lib/medicationHistory.ts` is inside the `generate-report` closure and was deliberately not touched; `lib/pastMedications.ts` (comment edit only) is not in any closure, and `guards/edgeFunctionDeploy.test.ts` is green.

## DoD

- AC: N/A — backlog quick wins beside Step 9; no build-step criteria apply.
- Anti-patterns: none introduced (theme tokens only; `ThemedText` untouched; no raw `disabled` on an inert row; the record-pet rule now guarded rather than remembered).
- `tsc` clean; jest 300/6429 green; no schema; no secrets.
- Persona sign-off: Engineer ✓ (one guard per class, mutation-proven; the CUL-505 `tests: N/A` exemption is the Engineer's) — Designer ✓ (CUL-318 affordance-present-iff-control-exists; chevron + button role; no invented a11y label) — Data Scientist ✓ (CUL-709 protects `occurred_at`, the correlation engine's key; CUL-703 protects `notes` from a time edit) — Dr. Chen N/A (no clinical/statistical logic changed) — Product Owner ✓ (four Linear reconciliations with evidence). Adversarial review: N/A — nothing in the batch touches detection, escalation, an AI read, or the vet report's content.
- code-reviewer: **SHIP, all five clusters.** It re-verified `tsc` and the full suite itself and ran its own mutations on a scratch copy (rung restored, nulls restored, swap guard deleted, orphan made tappable, `onPress` neutered) — every one red. Two findings, both acted on before merge: **(1)** the `attachmentStore` deletion had been staged before the first commit was cut, so it rode in commit 1 while commit 5's message claimed it — the branch was re-cut so every commit's diff matches its message (a squash would have hidden it; the per-issue shape was the point); **(2)** the stale-save guard explained the race but not why it closes silently — the reason is now in the meal card beside the guard. One nit taken as well: the guard's exemption window was three lines, narrower than the sibling scanners' ten; widened to ten and pinned both ways (a marker at the head of a four-line chain spares; one eleven lines up does not).
- Future-self: the guard is the only new pattern, and it is the fourth of its exact kind (`reversePath`, `haptics`, `completionCard`, `accentOnLight`); yes, still wanted in 12 months.

## Process notes — is the batch workflow good?

Yes, and five was not too many. What the three prior runs and this one agree on:

- **The count is not the risk; the verification is the win.** The expensive part of a quick win here is orientation and ceremony (the ~85 KB manual, the claim ritual, the wrap), not the diff. Batching amortises that once. Verify-first is what makes it safe: three of twelve candidates today, five of eight on Aug 20, were not real work.
- **Where batches go wrong is an item that stops being small.** CUL-746 and CUL-69 each took four to five falsification rounds. The filter that protects against that is *no clinical/statistical logic, no RLS/Storage/deletion, no Edge Function closure* — every item then needs only the code-reviewer gate. The stop rule (an item past an hour or surfacing a decision gets cut and commented) never fired today, but it is the rule that keeps a batch a batch.
- **One stacked PR, one commit per issue** is the right default for XS items on a session pinned to one branch. The Aug 1 shape (one triage session → sibling sessions, one PR each) is the better one when items are S or M sized or need different reviewers. The per-issue commits cost one hunk-splitting script for the shared file (`app/log.tsx` carried three clusters); worth it for review, moot after the squash.
- **Container restarts cost this session one background task**: the first code-reviewer launch. The full-suite run survived on disk and the second reviewer launch completed. Pushing the five commits before the review finished was the right call for an ephemeral container; the review's two findings then cost one re-cut and one force-push of a branch nobody else had checked out.
- **Grooming is a by-product, not a separate task**: four Linear reconciliations fell out of reading twelve issues carefully. A batch session should expect to close as many issues without code as with it.
