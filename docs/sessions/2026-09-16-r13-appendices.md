# 2026-09-16 — R-13, the appendices pass (with R-3 as item 0 and R-4 folded in)

**Issues:** CUL-996 (R-13), CUL-977 (R-3), CUL-978 (R-4) — claimed together as session S3 of the
v15 cold-read remediation. Also closes CUL-643, CUL-851, CUL-852, CUL-292, CUL-497.
**Outcome:** shipped via #861. **Branch:** `claude/r13-appendix-build-4942fm`.
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
* **Item 1 shipped the honest direction** — R-15 brief 5 was unruled when it was built, so it
  took the fallback that issue names; the PM then ratified exactly that, mid-session (below), so
  it ships as the decision rather than a provisional. Recorded on CUL-643.
* **R-15 brief 7's (b) half is built here; (c) is not.** The ruling is the pair, so CUL-974 stays
  open until (c) lands on CUL-1033 — and this PR therefore carries **no attachment** to CUL-974,
  only a mention. An attachment is a commitment that merging the PR finishes the issue, which is
  how CUL-660 closed on related work with nothing built; the ruling comment is the sanctioned way
  to point at half-done work.
* **No guard file for R-4's negative-string class.** The blunt detector needs an exemption at
  **35 of 37** sites; an exemption applied thirty-five times is a scope error, not an exemption
  (C-33), and C-32 says a registry entry has to be earned. The one site closest to the same
  failure — page 1's medication negative, already correct — is pinned instead.

## Verification

753 deno tests in `generate-report` after two base merges (up from 651; 1,792 across all Edge
Functions), green under **UTC+14, UTC+12:45, UTC−10 and UTC** — R-3's local-day
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

## R-15 ruled mid-session, and it added work here

The PM ruled all seven R-15 (CUL-997) briefs by deferring to the team's recommendation, while
this PR was green and unmerged. Two consequences:

* **Brief 5 ratified what was already built.** Item 1's provisional becomes the ruling; option
  (a), a real per-meal table, is declined rather than deferred.
* **Brief 7 added an item to this PR.** Its recommendation is *(c) with (b)*, and (b) is routed
  to R-13 by R-15's own consequence line, so Appendix A now states a COUNT of the in-window
  observations logged as `other` — the eight-leaf allow-list drops them from every count and
  table while that preamble claims *"every symptom event in the window"*. A count and **only**
  a count: the notes are un-normalised owner text, promoting them is CUL-848's open question,
  and a test asserts they never reach the document. The clean fixture gained the two ear rows
  from CUL-974's measured case, for the same reason it gained pre-trial meals.

The other five rulings were carried to their home issues (CUL-847 D3/D5/D8, CUL-929, CUL-632)
and **brief 1 unblocked CUL-1001 (R-19) outright** — it was the only hard block in the set.

## The base moved twice under this branch, and the second merge is the lesson

Three sibling PRs landed on `main` while this one sat green: **#859** (R-17/R-18, the stylesheet
pass), then **#862** (R-14, the chart's stop marks) and **#863** (R-7, the vomit-colour
aggregate) together. All three touch `render.ts`, `report.ts` and the same two test files, so
this branch merged `main` twice rather than once.

**What auto-merged was not the risk.** Both merges resolved the way the passes' scoping
predicted — #859 moves only the `STYLE` constant, #862 and #863 append tests and add adjacent
predicates, this branch moves the appendix stack. Git got every textual call right. The
conflicts were three imports and two blocks of appended tests, all resolved by keeping both
sides.

**The conflict git could not see is the one that broke the build.** R-14 widened
`ConcurrentChange` with two new REQUIRED fields (`endBucketIndex`, `endIsDeclared`). This
branch's R-4 site-2 fixture constructs that type and predates them, so the merge was
**textually clean and failed type-checking** — a semantic conflict between their type change
and my new construction site, in a file neither pass edited at the same line. The generalisation
for any session merging into a shared module: *a clean merge is not a compiling merge*, and the
cheapest detector is the typechecker, not a re-read of the hunks. Run it before you trust the
resolution.

Filling it in was a judgement, not a mechanical patch. With `endInWindow: null` there is no end,
so `endBucketIndex` is null by that field's own contract, and `endIsDeclared` is **false** —
because "the record does not say" is what no end means, and their own doc comment says false is
not "still running". Their fixture one screen up uses `true` deliberately, to prove a stop is
not drawn when the end falls after the window; copying that value here would have made this
fixture assert something it does not mean.

**The ledger was the recurring conflict — three separate claims on one entry.** Each pass
re-fingerprinted `generate-report`, and after each merge *neither* recorded fingerprint
described the merged tree. The resolution is never to pick a side: recompute, write one reason
covering every pass that now rides the deploy, and union `ref` (thirteen issues by the end). Any
session landing in a held-deploy function should expect this and budget for it.

**Page counts survived both moves unchanged.** Measured against each new base in turn, this
branch's only page-count effect is `clean` at **A4, 9 → 10**; at Letter #859's 96-character
prose cap had already taken it to 10, so the two passes' extra sheets **overlap rather than
stack**. Worth stating because both PR bodies independently claim a 9 → 10 on `clean`, and a
reader summing them expects 11.

## An attachment is a commitment, and it nearly closed a half-done issue

While correcting the PR body after the R-15 ruling I wrote "Also closes CUL-974" — and found
CUL-974 already carrying a `#861` attachment titled *"the (b) half"*. Per the CUL-803
measurement in CLAUDE.md the attachment is what closes an issue on merge; the mention does
nothing. So on merge CUL-974 would have closed with the ruled pair half-built, the at-Send
disclosure unwritten, and CUL-1033 orphaned pointing at a closed parent — **the CUL-660 trap
verbatim**, one session after the manual recorded it.

The tell was cheap and I nearly missed it: the issue's own ruling comment said *"leaving this
issue open until (c) lands"* while the mechanism said otherwise. **A comment and a mechanism
disagreeing about the same issue is the same defect class this whole PR removes from the
report** — a document contradicting itself — and it is worth checking for at wrap, not only in
the code. The attachment was deleted, the closing verb removed from the body, and a mechanism
note left on CUL-974 so a future wrap does not "helpfully" re-add it.

## PM action items

* **CUL-1030** — pick how a cross-midnight range prints (three options and a recommendation on
  the issue).
* Nothing else is waiting. R-15 is closed.
