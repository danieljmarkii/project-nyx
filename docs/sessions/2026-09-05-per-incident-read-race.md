# Per-incident read: one read per photo — the analysis-chain claim (CUL-801)

**Date:** 2026-09-05

Shipped via [#803](https://github.com/danieljmarkii/project-nyx/pull/803) (draft). BUILD mode, single issue, no schema, no redeploy.

## The defect

Two independent paths trigger a per-incident AI read for the same event:

- the **log path** — `lib/simpleEvent.ts` `attachPhotoBestEffort`, an async chain of compress → `uploadPhoto` → `event_attachments` upsert → mark synced → `analyze-vomit` / `analyze-stool`;
- the **incident screen's mount** — `VomitAnalysisSection` / `StoolAnalysisSection` `start()`, which triggers unconditionally whenever it finds no resolved row.

Nothing routes an owner to that screen today, so an immediate detail-open is rare. **CUL-800's route makes it every photographed incident**, which is why this had to land before CUL-802.

## Correcting the issue's diagnosis

CUL-801 described the mount trigger reaching the Edge Function "with no storage object yet". Verified at file:line, that is not the common path: `triggerVomitAnalysis` awaits `ensureEventAttachmentsSynced` (`lib/sync.ts:1442-1478`), which does its **own** compress + upload, and `uploadPhoto` uses `upsert: true` (`lib/storage.ts:257`) — so both chains write the same object and neither 409s. The mount call waits for its own upload.

The sharp defect is the **double-invoke** and what it costs:

1. **Cost.** `recordUsage` increments per call whenever the event has a photo (`_shared/incident-analysis.ts` step 4, ~line 729). The free daily cap of 10 is really **5 photographed incidents a day**.
2. **Churn.** Two write-backs, last-writer-wins, over two *independent* model runs (`:940-960`). The card can change under an owner already reading it.
3. **The bad one.** If the *second* call is what crosses the cap, it takes the gated branch while the first call's read has not landed — `existingRealAnalysis` is still `false` there (`:718-722`) — so a `'capped'` state is written **over a good read of a photo that did land**.

That third case is the one that made this worth doing properly rather than deduplicating loosely: it is a worse verdict displacing a better one, on the safety surface.

## What was built

A claim in `lib/analysis.ts` — `claimAnalysisChain` / `AnalysisChainClaim.settle` / `awaitAnalysisChain` — held in memory for the life of the process, keyed by event id. Whoever starts a chain owns that event's first read; anyone else awaits it. The log path claims **synchronously**, before its upload starts and before `insertSimpleEvent` resolves, so a screen routed straight to the record cannot mount into a gap ahead of it. `watchAnalysisRow` carries the result either way, and its fallback schedule now starts *after* the chain settles instead of during the upload, so a slow upload no longer eats the give-up budget.

Also claimed: the `app/event/[id].tsx` photo-add chain — the identical hazard on a section that re-mounts mid-upload.

## Two decisions, both about the safety floor

**In memory, not a `pending` row.** The issue offered both, and migration 013 originally described a client-written `pending` row (`013_event_ai_analysis.sql:67,162`). That option is wrong here: both sections already treat a stale `'pending'` as "re-trigger", and that branch is the **only** recovery for an app killed mid-upload. A row would gate nothing unless that branch were deleted too. An in-memory claim dies with the process, so the recovery survives by construction — the claim can only suppress a trigger while the runtime that owes the read is still alive to make it.

**Await, not skip-if-claimed.** A chain can settle without ever invoking: the upload threw, or the attachment upsert errored. Skipping would then leave the incident with **no descriptive read and no deterministic contextual escalation** — the one outcome this must never produce (the escalation floor computes before the vision call and survives the cap, but only if the function is invoked at all). Every non-invoking exit settles `false`, and `false` means "trigger your own".

## What the mutation pass caught

Nine mutations were run against the new tests. Six turned them red immediately. **Three findings came out of the ones that did not:**

- **Three assertions proved nothing.** They called `awaitAnalysisChain(id)` *after* the chain had settled — which returns `Promise.resolve(false)` because the key is freed, so they passed against any implementation, including one that settles the opposite value. Rewritten to hold the waiter while the chain is still live. This is the same shape as the `.*`-in-a-guard lesson (CUL-746): an assertion that cannot fail is not an assertion.
- **The identity check in `settle()` is unreachable.** The per-claim `settled` flag short-circuits before the comparison, so nothing in the API can exercise it. Kept as wiring (the §C-15 "keep a defect-guard wiring even when the gate makes it unreachable" rule, CUL-678/CUL-680) but the comment and the test now say so plainly instead of pretending to cover it.
- **A mutation that patches one of two identical lines proves half of what it claims.** `invoked = !error;` appears twice — once per trigger — and the first pass replaced only the first occurrence while the test under scrutiny exercised the second. It read as "the guard is dead" when the guard was fine and the mutation was.

## Process note worth keeping

The mutation harness reverted source with `git checkout -- <file>`, which discarded the session's real edits along with the mutation in three files. **Mutating a file you have uncommitted work in must restore from a content snapshot, never from git.** Committing before the mutation pass would also have worked, and is the cheaper habit.

## Stated residual

The claim covers a chain while it is *running*, not after it. A caller arriving once a chain settled gets `false` and decides for itself — `start()`'s own row read covers that, because the Edge Function writes its row *before* it responds. The residual is a section completing its read inside the milliseconds between that DB write and the response landing; it degrades to exactly the pre-CUL-801 behaviour (one extra call), never worse. Documented in `lib/analysis.ts` and pinned by a test rather than bought off with a settled-chain cache, which would then need its own rule against swallowing a legitimate retry after the watch gives up.

Noted and **not** folded in: `ensureEventAttachmentsSynced` upserts the attachment row even when its own upload threw (`lib/sync.ts:1461-1471`), so a row-without-object is reachable independently of this race. Different condition; the function's `photoUnreadable` degrade already handles it honestly.
