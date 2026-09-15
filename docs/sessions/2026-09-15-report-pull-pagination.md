# The vet report could not see its own truncation — CUL-975 R-1

**Date:** 2026-09-15

Shipped via #853.

## How this started

The owed `vet-report-cold-read` from the v15 deploy earlier the same day (`docs/sessions/2026-09-15-generate-report-deploy.md`, CUL-969) ran against the actual artifact the PM had generated for Nyx's appointment the next morning. It found something the previous session's cold read could not have: the report was titled **Jul 26 – Sep 15** and contained no event after **Sep 7**.

```
live events in the 180-day lookback ...... 1,057
  occurred_at <  2026-09-08T00:00:00Z .... 1,000   ← on the document
  occurred_at >= 2026-09-08T00:00:00Z ....    57   ← silently absent
```

Every pull in `generate-report` was bare — no `.order()`, no `.limit()`, no `.range()`. PostgREST caps an unbounded select at the project's `max-rows` (then 1,000), and with no `ORDER BY` Postgres returns rows in physical order, which on this append-only table is insertion order. So the cap kept the **oldest** thousand and discarded the **newest** fifty-seven.

A cough from the previous day printed as ten days old. A vomit from three days earlier printed as eight.

## The three properties that made it Urgent rather than a backlog row

**It failed toward reassurance.** "Coughing … most recent 10 days ago" reads as a resolving course. This is the direction the entire `clinical-guardrails` posture exists to forbid, on the one artifact a clinician acts on.

**It was unfalsifiable from the page.** Every number agreed with every other number, because they all derived from the same short set. Nothing contradicted anything, and no amount of careful reading recovers what the document never mentions. The cold read only caught it with the database open beside the report — which is worth noting as a fact about the *review*, not just the code: a cold read of a rendered artifact cannot find a defect whose only evidence is outside the artifact.

**It targeted the best users.** Truncation begins at log 1,001, so the most diligent owner — the reactive diet-trial owner who is the wedge — got the most wrong report. A lightly-used account is unaffected, which is why no fixture and no test account had ever shown it in the months it was live.

## The part that is really the lesson

**The file already knew.** `LOOK_PULL_CAP`'s comment documents the hazard by name — *"Below Supabase's default PostgREST `max-rows` (1000) ON PURPOSE"* — and the dose pull's comment recorded it as a **KNOWN LIMIT** *"shared with every pull here"*. The looks pull was then hardened with `count: 'exact'`, an explicit newest-first `.order()` and a `.limit()`, with a comment explaining why ordering newest-first makes truncation safe.

So the knowledge was present, correct, written down, and applied to one table out of eleven. The one it was applied to was the one that could not reach the cap for two and a half years; the ten left bare included the one that crosses it first.

That is a class of failure a prose comment structurally cannot hold. A comment records what a person knew at one site. It cannot enumerate the other sites, and it cannot notice when a new one is added. The guard this PR adds is the same knowledge in the one shape that generalises.

## What was built

### The reader

`fetchAll` in `index.ts` pages to the end of each result set. Two decisions in it carry the weight:

**It advances by the rows it RECEIVED, never by the page size.** This is what makes it correct at a server ceiling the deployed function cannot observe. If `max-rows` were ever below the page size, a fixed stride would ask for 0–499, be handed 200, advance to 500, and skip rows 200–499 forever. Advancing by the received count costs more round trips and loses nothing. It also dissolves the constraint the issue's plan was worried about — "`PAGE` must be at or below the server `max-rows`" — into a performance preference rather than a correctness requirement.

**Completeness is earned from `count: 'exact'`, never from a short page.** `rows.length < PAGE` is the inference the looks pull's own comment already warns against, and a lowered cap defeats it exactly. The count is taken on **page 0** — the same request that returned page 0's rows — so for any record that fits in one page (the common case) the count and the rows are one consistent snapshot and completeness is exact. A page ceiling and an absent count both read as **incomplete**: absent means unknown means incomplete, the `lookRowsComplete` rule.

### Three calls beyond the issue's plan

**1. The order key needed a unique tiebreaker, and it is not `occurred_at`.** The issue specified `.order('occurred_at', { ascending: false })`. `occurred_at` is not unique — this record logs ~7 events a day and meal one-taps land on the same second — and under a non-total sort Postgres may return tied rows in a different order per page, which repeats some and skips others at **every page seam**. Every table here has `id UUID PRIMARY KEY`, so every pull ends `, id DESC`, and `fetchAll` de-dupes by primary key.

**2. Six of the eleven pulls have no `occurred_at` to order by.** It lives on the parent event — which is exactly why `weight_checks` and `medication_administrations` cannot be `.gte`-bounded today. Those order by `created_at DESC`, and each says in place that "newest-first" there means most recently *logged*, not most recent incident. Restating the `events` pull's safety claim over a different column would have been the false half of a true sentence.

**3. `vet_visits` and `diet_trials` were in scope, and are worse than four pulls that were on the list.** They sit in the *first* `Promise.all` and they are the scope cascade's rungs 1 and 2. A truncated `diet_trials` pull does not shorten a count — it **moves the report's window**.

### Step 4, and why the recommendation was refined

The issue recommended **(a) fail closed always**. Two measurements moved it to **(a′)**, which the PM ruled:

- After the ordering lands, every pull is newest-first, so a residual shortfall drops the **oldest** rows — the inverse of the defect. `complete: false` now means the page ceiling, a lowered `max-rows`, or a write landing mid-pull. That last one is structural: the count and the pages are taken at different instants and no ordering fixes it.
- `app/report.tsx:161` maps **every** error to one hardcoded line — *"Something went wrong preparing the report. Try again in a moment."* — with a retry button. The server's reason never reaches the owner. Bare (a) at the clinic door is a generic error and a retry that does not work, and changing that needs a client change in a new build.

So (a′): refuse (503 `record_incomplete`) only when the `events` pull is incomplete **and** its oldest pulled row is inside the window — every page-1 count would then be a query artifact, and there is no sentence that repairs that. Otherwise render with a page-1 `Partial record.` line naming which part of the record is partial.

This is not a novel invention. `noticed.ts:616`'s `windowTruncated` already makes exactly this distinction for the look pull (`!pullComplete && oldestPulledNum > startDayNum`) and degrades one clause rather than failing the document. (a′) is that rule applied to the rest of the block.

**The disclosure never claims the window is complete**, and that restraint is deliberate. "Off the old end" is only window-safe for the pulls the window filters; `medications` and `conditions` carry no date bound, so a truncated one of those can be missing something in-window. The sentence states what is true of every case — the rows read are the most recently recorded, and the counts are minimums — rather than a reassurance that holds for the common case and not the rest.

## Two things that nearly went green over nothing

**The acceptance fixture.** The first draft was 1,057 coughs an hour apart. Entries within three hours **chain into one bout**, so the whole record assembled into a single episode and no count on the page moved whether the reader paged or not — the test would have passed identically against the bare pull. It is now built on the record's real composition (~1,000 meals four hours apart, then the 57 newest vomits four hours apart), which is a shape production actually creates. C-35, encountered rather than remembered.

**The guard's own chain window.** `guards/reportPullPagination.test.ts` extracted each query's text as a fixed 2,000-character slice from `.from(`. That read past the dose pull into the regimen pull beside it in the same `Promise.all`, so deleting `count: 'exact'` from the dose query left the guard **green on the neighbour's copy**. Measured, on this file, by the mutation pass. The window is now bounded at the next `.from('`.

This is C-4 — *slice the object under test* — inside a guard whose entire subject is a number derived from a query's edge. Worth recording that the guard needed the mutation pass as badly as the code did, and that only one of the four mutations found it.

Also worth recording: one mutation in the first pass **silently failed to apply** (a `perl` anchor that matched nothing) and the guard reported green. A mutation that does not change the source is not a proof, so a mutation run now checks the file actually changed before reading the verdict.

## What the two reviews found, and why the adversarial one was the one that mattered

Both mandated reviews ran on the first commit. Between them they returned one **fix-before-merge** and one **FAIL**, and the headline finding was the same defect.

**`fetchAll` could return `complete: true` with a live row missing.** One concurrent soft-delete plus one concurrent insert below the cursor, on a multi-page pull: the delete shifts the offset space up and skips a row, the insert restores the number the delete took away, and `rows.length >= total` certifies the pull. Reproduced on the shipped reader — 1,057 rows, delete at rank 200, insert at rank 800 — losing an event at newest-first index 500, about 85 days back and **inside** a 90-day window, with `incompletePulls` empty so no disclosure rendered at all.

That is CUL-975's own failure class, at a smaller scale, inside the fix for it. **A number that can be made whole by a different row is not a proof that no row is missing.** The fix is one row of deliberate page overlap plus a continuity check: every page after the first starts one offset back, and the row it starts on must be one already seen. Completeness now rests on three independent facts instead of one.

Worth being precise about the other half, because I checked it rather than accepting it: `code-reviewer` reported the **insert-alone** case as the same bug, on the evidence that the inserted row is absent while `complete` is true. That one is not a defect. Driven against the real reader for a head insert, a mid-list backdated insert, and two backdated inserts inside the final partial window, **no row that existed when the count was taken is ever missing** — the absent row is one created after the read began, on a document that is a snapshot as of the request, behind a client that flushes its queues first. The empirical observation was right and the diagnosis was wrong, and the two are separable only by running it.

Three further findings, each the same shape — **inverting the truncation direction moved a number nobody re-checked**:

- **`eventsSinceIso` still carried the floor the query ASKED for.** That used to equal the floor it reached, because truncation kept the oldest rows. `report.ts` derives `countIsFloor` from it, so a truncated pull could print a trial-crop symptom count as a *total* over days it never read. Now `reachedLookbackIso`, a pure predicate with its own test.
- **The trailing probe can 416.** PostgREST answers `PGRST103` when a `.range()` lower bound passes the end, which a mid-pull delete produces; `rowsOrThrow` made that fatal, so the benign race the (a′) ruling chose to *render through* became a hard 500 and no report at all.
- **The disclosure copy was false in the one case `events` can reach it.** "Anything missing is older than what is shown" describes an old-end drop; a seam skip lands mid-record with 556 older rows still on the page. And `events` orders by when an incident *occurred*, not when it was recorded, so a backdated row logged minutes ago is among the first to go.

The copy also had the wrong *frame*. For `feeding_arrangements`, `medications`, `conditions` and `diet_trials` a shortfall is not an under-count — it is a **missing confounder**, and a missing confounder makes a finding read *more* confident (a dropped shared-bowl arrangement un-caps a correlation's tier). "Treat counts as minimums" is a counting frame on a non-counting harm, so the sentence now names both directions.

**The generalisation.** Every one of these survived my own adversarial read, the mutation pass, and a full guard suite — because they are failures of the *premise*, not of the code. A completeness check has to be falsified by someone who did not design it. That is what the DoD's adversarial line is for, and this is the clearest return it has produced.

**One rendered change to expect at the cold read**, flagged so it is not read as a regression: adding `ORDER BY` flips `input.events` from insertion order to `occurred_at DESC`, and Appendix A's *type-block* order follows group-insertion order. Which type-block leads changes; rows within each block were already ascending and still are. Every other consumer sorts internally or takes a min/max.

## Definition of Done

- [x] Acceptance criteria from CUL-975's description and its one comment, listed in the PR against the issue's own DoD
- [x] Diff scanned against the anti-pattern lists — none introduced
- [x] `tsc --noEmit` clean; lint clean
- [x] **Tests**: 8,296 jest + 1,604 deno green. The acceptance fixture was run RED against a restored bare pull; the guard was proven by three mutations on the real tree
- [x] No new secret
- [x] Persona sign-off — below
- [x] **Adversarial review.** `Biostatistician: ported fetchAll into a PostgREST-modelling harness — insert-at-head race de-dupes losslessly ✓, lone delete across a seam reports incomplete ✓, the newest 500 rows unreachable by any race ✓, windowStartFloorMs bound + MIN over rows correct ✓, all 11 order/de-dupe keys verified unique against the migrations ✓; but ONE delete plus ONE backdated insert mid-pull returned complete:true with an in-window row silently missing (1,057-row repro) ✗, and the disclosure sentence was false in the only case the events pull reaches it ✗.` Both fixed and re-proven: the compensated race now reports incomplete (mutation-proven — dropping either half of the overlap reds it), and the copy no longer makes a claim about where the loss sits.
- [x] Future-self review: `fetchAll` is a new pattern in this file. In twelve months I would still want it, and specifically the advance-by-received stride, because it is the part that stays correct when someone changes a project setting nobody in the repo can see. The risk to name: it is offset paging, which is racy across pages by construction; if a heavier account ever makes multi-page pulls routine, keyset pagination on `(occurred_at, id)` is the upgrade, and the known-limit note in `fetchAll`'s header is where that starts.
- [x] Dev Handoff — backend-only; the verification is the post-deploy report check
- [x] PM Action Items — below
- [x] Next Session Kickoff — in the wrap

## PM Action Items

- **CUL-975** — deploy `generate-report` from the Codespace (`scripts/deploy-edge.sh generate-report --deploy`), batching with R-2 (CUL-976) if it has landed. Then regenerate Nyx's report and check page 1 against the database: cough 21, vomiting 10, itching 3, sneezing 7, lethargy 1, and a Sep 14 row in Appendix A. Then re-run `vet-report-cold-read`.
