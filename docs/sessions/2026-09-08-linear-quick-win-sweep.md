# Quick-win sweep — the FAB's wrong-pet foods, a hero that blinks, and three guards that were not guarding

**Date:** 2026-09-08

Shipped via **#812**. Twelve `Quick Win` candidates read in full, five built, one cut mid-claim, six written up and left where they were.

---

## What shipped

| Issue | The defect |
|---|---|
| **CUL-723** | The FAB menu's recent-food rows belonged to the pet you had just switched *away from*, under the new pet's name, and each one writes a meal in a single press. |
| **CUL-302** | Returning to a record — back from Edit — blanked a remote-only photo for the width of two `getSignedUrl` round-trips. |
| **CUL-833** | A fourth private copy of the `owningTouchable` walk, missed by CUL-710's sweep because its signature differed. |
| **CUL-714** | Nothing stopped a guard writing its detector fixture into the tree the guards scan — the residual CUL-712 left open. |
| **CUL-716** | Every test in the switcher suite waited on the archived-pets row, so a cold cache reported a phantom red on an assertion about Modals. |

Five commits, one per issue, disjoint files, plus a sixth carrying the review round.

## The one that was cut, and why it matters more than the ones that shipped

**CUL-806** — "Home Trend feeding line renders ↑/↓ over meal-logging days" — reads like a mechanical de-arrow, and is not. It was claimed and then released without a line of code.

`lib/symptomEpisodes.guard.test.ts:190` scopes the B-067 no-direction guard to `SymptomChart` **deliberately**, and says why in the source:

> `FeedingChart` in the same file still renders "↑ from N days last week" … Whether that is a parallel bypass is **CUL-568's call, not this PR's**, so this guard must not quietly pre-empt it.

CUL-568 is High priority, its question 2 is exactly the one CUL-806 answers by assumption, and its TL;DR says **"You and the vet need to rule on which of those three."** Shipping CUL-806's stated fix would have ruled a High-priority open question by accident, from a Low-priority issue whose body never mentions that anything is holding the call — and it would have left the worse half standing anyway, since `Every day this week` renders in the good-news accent over days a meal was *logged*, so a cat refusing every bowl still gets a green week.

The general form, which is the reason this is the session's headline rather than a footnote: **the gate on an issue is not always in the issue.** It was in a guard's comment, one file away from the code the issue names. Reading the issue and verifying its file:line — both of which this sweep did — was not enough; the thing that caught it was reading the *neighbouring* guard before editing the file it protects.

## Two guards that were green for the wrong reason

CUL-714 is a guard that fails the build when a guard writes a fixture into a scanned tree. It accumulated **three** defects before it was correct, and every one of them read fine:

1. **Line numbers slid.** Collapsing block comments to a single space shifted every line below them, so the exemption window read ten unrelated lines. **Its exemption test passed anyway** — that fixture happened to contain no block comments, so the two numbering schemes agreed by luck.
2. **It flagged its own test data.** A guard's detector fixtures *are* the anti-pattern, held in a template literal. Under the first draft's rule, no guard could ever prove its detector without tripping this one.
3. **It swallowed real violations** (found by `code-reviewer`). Chained `.replace()` passes each read delimiters another pass owns: a `//` inside an earlier string ate the rest of the line, and an apostrophe inside a double-quoted string paired with the next stray `'` and blanked everything between. Neither needs an adversary — a URL in a message string, a contraction in the next one. Both reported **0 violations where 1 was due**.

All three were found by *running* the guard: two against the real tree, one against constructed inputs. None would have been found by review. That is C-18's own rule landing on the guard written to enforce C-18, and it is why the fix went into CLAUDE.md rather than staying a code comment.

## The review round

`code-reviewer` returned two findings. Both were reproduced by execution before being acted on, and one of them was a genuine defect in work already committed this session.

**CUL-302's first gate was incomplete.** Holding a signed URL across a refocus is sound only while the photo behind it is the same photo — which the comment claimed and the id-only gate did not enforce. `app/edit-event.tsx` has its own replace flow writing a new `storage_path` and detaching the prior; on a screen that never unmounted, the held URL survived that, and the screen rendered a photo no longer attached to the record. **Worse than the defect the issue was filed for**: a blank hero is the screen saying nothing, this is the screen saying something false, on the surface whose stated job is "show it to a vet" (G5).

One correction to the review's own account, verified rather than accepted: a replace made **on this device** was already safe, because that path calls `persistCapture` and the local file beats any stale remote URL. The reachable path is cross-device or an evicted cache. Narrower than reported; identical fix; the premise was wrong either way.

The gate is now the `storage_path`, settled once the attachment is read, with the event id keeping its up-front clear. Two gates, because "is this a different record" and "is this a different photo" are answerable at different moments.

## A test label corrected by its own run

CUL-723's two new tests were both written up as reding pre-fix. Only one did. The second passes against the pre-fix tree — the stale list is non-empty, so the empty copy never renders — and what it actually discriminates is the *alternative* fix (`setRecentFoods([])`), proven by mutating this fix into that one. The describe block now records which is which.

`FAB.test.tsx` already documents making this same mistake twice, in both directions, in its CUL-717 block. Three occurrences in one file is a habit, not an accident: **a test's direction is established by running it, never by intending it.**

## Proof discipline, per issue

- **CUL-723** — test 1 reds pre-fix (pet B's fetch held open so the assertion lands inside the gap); test 2 reds against the clear-on-flip variant.
- **CUL-302** — the guard reds pre-fix with `Received: null` (the blank hero); the regression guard passes both ways; the review-round test reds against the id-only gate shipped earlier in this same stack.
- **CUL-833** — one mutation, both directions: breaking the shared walk reds the migrated file on 3 tests *readably* (`null` / `undefined`, no OOM) and leaves the pre-migration file green on all 36. That green is the defect, stated as an observation.
- **CUL-714** — seven detector cases on fixtures written through `createFixtureRoot`, plus the live scan proven by dropping a real violation into a real guard file, plus two regression tests red against the multi-pass scanner.
- **CUL-716** — proven by decoupling rather than by cold-cache luck: with the archived count made never to land, pre-fix reds six tests and post-fix three, and those three are exactly the ones that assert the row.

## Findings recorded, not fixed

- **A green mutant can mean a weak mutant.** The first CUL-833 mutation returned `n.parent` instead of the responder host and changed nothing, because RTL keeps the composite `TouchableOpacity` above its host View carrying the same `style` and `hitSlop`. Every assertion in the file stays sound; but "the walk stopped one level high" is not a failure any file using these helpers can catch. Worth knowing before writing the next assertion of that shape.
- **CUL-716 did not reproduce here.** The suite passes cold on this machine, before and after, with the first test at ~4.1 s against a 1 s `waitFor` window versus the ~5.9 s that failed on the reporting machine. The mechanism reproduces; the failure is luck either way, which is the argument for removing the coupling rather than raising a timeout.
- **CUL-716's open question is closed.** `const settled =` and module-scope `waitFor`-on-one-string helpers exist nowhere else in the repo, so no sibling suite shares the habit and no follow-up issue is needed.

## The label is the problem

Four of the twelve candidates are labelled `Quick Win` and are not quick: CUL-806 (gated on a PM + vet ruling), CUL-705 and CUL-766 (open decisions in the body, past the first paragraph), CUL-620 (a prior sweep already verified it is not the one-word change the title implies, and needs a VoiceOver pass). Two independent sweeps have now read CUL-620 and stopped in the same place.

Each got a disposition comment so a third sweep does not re-derive it, and **CUL-834** carries the re-labelling decision to the PM. The title is what draws a sweep; the gate is in the body or in a neighbouring file.

## What did not change

No schema, no Edge Function, no migration, no secret, nothing on the CUL-19 or CUL-557 holds. No build step advances or regresses. `STATUS.md` untouched — no track started or ended, no hold changed, no phase moved, no pointer went stale. CLAUDE.md § C-18 gained the CUL-714 enforcement rule and its two scanner constraints.
