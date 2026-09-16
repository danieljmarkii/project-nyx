# 2026-09-16 — R-13, the appendices pass (with R-3 as item 0 and R-4 folded in)

**Issues:** CUL-996 (R-13), CUL-977 (R-3), CUL-978 (R-4) — claimed together as session S3 of the
v15 cold-read remediation. Also closes CUL-643, CUL-851, CUL-852, CUL-292, CUL-497.
**Outcome:** shipped via #861 (draft). **Branch:** `claude/r13-appendix-build-4942fm`.
**Deploy:** `generate-report` re-fingerprinted, `status: pending` — merging does not deploy it.

## What was built

Eleven fixes in one contiguous region (`render.ts`'s appendix stack plus `report.ts`'s diet
assembly): R-3's LOGGED date, R-4's two self-contradicting negatives plus its class sweep, and
R-13's nine items. The full list is in the PR body; this record keeps what a later session
would not be able to reconstruct from the diff.

## Three things worth carrying forward

### 1. Every fixture was shaped like the case its bug could not show

`adversarial-reviewer` returned **FAIL with nine findings**, seven driven through the real
`assembleReport`. **None was caught by the branch's suite**, which was green at 683 when it ran,
and the reason was the same every time:

* every tie fixture was an **exhaustive** tie (`all×6 + refused×6`), which is the one tie shape
  that cannot reveal a summary dropping the untied ratings;
* every CUL-292 fixture gave each confounder a **non-empty** protein set, which is the one shape
  that cannot reveal a numerator and denominator drawn from different populations;
* no fixture **crossed midnight**, which is the one shape that reveals the residual
  logged-before-it-happened reading.

C-35 already says a fixture that cannot exist in production is green over nothing. This is its
neighbour and it is more insidious, because each of these fixtures is perfectly realistic: the
failure is that the *set* of them was uniformly benign. The question C-35 asks — *could production
produce this shape?* — all of them passed. The question that would have caught them is **"which
shape would this bug need, and is it in the suite?"**

The single worst consequence: a tie that did not exhaust the ratings printed *"split between ate
it all ×3 and ate most ×3"* over twelve meals and **dropped both refusals** — silently, in the
calm direction, because the breakdown orders best-to-worst and the tie resolves by count. That is
precisely the B-532 defect the predicate was written to kill, re-entered with two survivors
instead of one, and *worse* than what it replaced: "typically X" is grammatically a partial claim
and "split between A and B" is not.

### 2. A fix can re-create its own bug one column over

R-3's first cut took the year from `fmtLocalDayScoped`, which stamps against the **window's**
year. That helper's own header warns a conditional year is worse than none once two dates share a
sentence — and Appendix A's row has two, because the Date column is always bare. On a window
spanning New Year, which the 90-day fallback produces every winter, it printed a bare `Dec 15`
beside `Dec 17, 2025`, and the bare one inherits the window's 2026: **logged before it happened,
again**, re-introduced by the fix for it. Caught in self-review by reading the helper's header
rather than its signature, reproduced, then fixed so the year is decided once for the row's pair.

The generalisation: when a helper's doc comment states a precondition, check the *caller's*
surroundings against it, not just the call. The precondition here was about the sentence, and the
sentence was a table row.

### 3. Measure the structural hypothesis before filing it

The clean fixture gained a sheet (9 → 10 at both paper sizes). The obvious suspect was
`sectionTail` wrapping the whole of `medicationAppendix` — the exact pattern CUL-993 A.1 had just
fixed for the photos grid — and it would have made a tidy, plausible, wrong issue. Removing the
wrap still gave 10. Removing item 2's paragraph, item 3's row, R-4's reconciliation or item 4's
additions *individually* each still gave 10 as well. The growth is genuinely distributed across
required content, and the honest report is "this is what the content costs", not a layout bug.

C-38's lesson is a comment writing a cheque the code does not cash; this is the same discipline
applied to a *finding*. The five minutes of measurement is the difference between a filed issue
and filed noise.

## Decisions taken

* **Item 9 was built narrower than its brief, and the narrowing is the ruling.** *"When every row
  shares one tag, drop the per-row tag"* is unsafe as written, because a bare time reads as an
  exact one. True of a uniformly witnessed column, false of every other — a record logged entirely
  before B-010 is uniformly `unspecified`, and dropping its tags turns times nobody vouched for
  into witnessed minutes. Scoped to `seen`; a mixed column keeps every chip, because there the tag
  on a `seen` row is what makes the one `est` row visible by contrast.
* **Item 1 is provisional** — R-15 brief 5 unruled, so the fallback that issue names. Recorded on
  CUL-643.
* **R-15 brief 7 unruled, so its R-13 half was not built.** CUL-974 stays open per its own
  fallback row.
* **No guard file for R-4's negative-string class.** The blunt detector needs an exemption at
  **35 of 37** sites; an exemption applied thirty-five times is a scope error, not an exemption
  (C-33), and C-32 says a registry entry has to be earned. The one site closest to the same
  failure — page 1's medication negative, already correct — is pinned instead.

## Verification

698 deno tests (up from 651), green under **UTC+14, UTC+12:45, UTC−10 and UTC** — R-3's local-day
logic is why, and C-29 says prove it under a skewed clock rather than by re-running today.
`tsc --noEmit` clean. `npx jest` 8390/8390. Page counts diffed at A4 **and** Letter, with the
MediaBoxes checked distinct so the equal counts are a result rather than an ignored `@page` rule.

The clean fixture gained two weeks of pre-trial meals, because no fixture had any and CUL-851's
row would otherwise have been invisible to the cold read that follows the deploy. The whole
rendered diff from that change is **one line** — which is the verification, not a side effect:
every other figure is window-scoped, so a derivation reaching past the window start must change
nothing else.

## Filed, not fixed

* **CUL-1030** — an overnight-discovery window (`~20:00–09:00`, both bounds bare) still reads as
  logged before it happened; R-3's fix cannot fire because both instants share a local day.
  Different mechanism, and the repair is a design decision about the RANGE convention. Three
  options and a recommendation on the issue.
* **CUL-1031** — the unknown-protein count disappears when the tally is empty (pre-existing).

## PM action items

* **CUL-997 (R-15) brief 5** — rule Appendix E's shape; item 1 ships provisional until then.
* **CUL-1030** — pick how a cross-midnight range prints.
