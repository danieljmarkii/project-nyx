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
3. **The bad one — and I named the wrong version of it.** My first write-up said a second call crossing the cap writes `'capped'` over the first call's real read. The adversarial pass showed the ordering does not work for the pair this PR actually creates: the capped call is *fast* (no vision call) and the allowed one is *slow*, so the cap state lands tens of seconds **before** the real read and is then overwritten by it. The DB ends correct.

   The real worst case is worse, and it is the one to keep. The outer catch's failure write (`:974-987`) has **no** `existingRealAnalysis` guard — unlike every other write path in that function — and the client renders `status === 'failed'` (`VomitAnalysisSection.tsx:259`) *ahead of* the recommendation (`:325`). So call A writes `worth_a_call`, call B's independent vision run 529s, and B's `status: 'failed'` partial-upsert buries the escalation behind "Couldn't finish reading this one." The window is the gap between two model runs, not 300ms. Filed as **CUL-812** — it is a server-side defect in its own right, reachable by an owner's own "Try again" tap, not only by this race.

That is what made this worth doing properly rather than deduplicating loosely: a worse verdict displacing a better one, on the safety surface.

## What was built

A claim in `lib/analysis.ts` — `claimAnalysisChain` / `AnalysisChainClaim.settle` / `awaitAnalysisChain` — held in memory for the life of the process, keyed by event id. Whoever starts a chain owns that event's first read; anyone else awaits it. The log path claims **synchronously**, before its upload starts and before `insertSimpleEvent` resolves, so a screen routed straight to the record cannot mount into a gap ahead of it. `watchAnalysisRow` carries the result either way, and its fallback schedule now starts *after* the chain settles instead of during the upload, so a slow upload no longer eats the give-up budget.

Also claimed: the `app/event/[id].tsx` photo-add chain — the identical hazard on a section that re-mounts mid-upload.

## Two decisions, both about the safety floor

**In memory, not a `pending` row.** The issue offered both, and migration 013 originally described a client-written `pending` row (`013_event_ai_analysis.sql:67,162`). In-memory is right, but the reason I first wrote down was wrong, and review caught it: I cited the sections' stale-`'pending'` → re-trigger branch as the recovery a row would break. **That branch is dead code.** Nothing in the repo ever writes `status: 'pending'` — every write is the Edge Function's (completed / uncertain / capped / read_disabled / failed) and no client inserts the row; migration 013's "created by the client on log" describes a design that was never built. I had grepped exactly this earlier in the session and still wrote the wrong rationale into the comment.

The correct argument: the real recovery is `start()` finding **no row at all**, and a persisted claim becomes a trap precisely where it would earn its keep — an app killed mid-upload leaves a `'pending'` row no chain is coming back for, and nothing in the row distinguishes that from a live one. An in-memory claim dies with the process, so the recovery survives by construction.

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

## What the two mandated reviews changed

Both came back with real defects. Neither was a design question; both were fixed on this PR (`2eb95b5`).

**Adversarial — FAIL, and the break was the exact thing the design claimed to prevent.** `cancelled.current` sat between the wait and the trigger, so an owner who opened the record (the CUL-800 route), glanced at the photo and tapped back *during the wait* bailed before the invoke. If the chain then settled `false`, nothing ever read the incident — no descriptive read, no contextual escalation, so nothing on the record, nothing on Home's `incident_red_flag` lane, nothing in the vet report. Proven against the pre-change control: 0 invokes post-change vs 1 pre-change on the identical interleaving. The wait is long (a whole upload) and the settle-`false` causes are *correlated* with a long wait — the same bad link that stretches it is what fails the upload — so this was not a narrow race.

The fix: the invoke is a server-side side effect and must outlive the screen, so it is issued whether or not the section is still mounted; only the state writes and `beginWatch` stay guarded. Regression test in both sections, mutation-proven (M11: restoring the guard's old position turns both red).

**Code review — fix-before-merge on the photo-add path.** `app/event/[id].tsx` took a claim and then invoked *unconditionally*, so when another chain already owned the event it fired a second concurrent read — in exactly the case that call site exists for (adding a photo to a photoless incident whose section already triggered a read). The reviewer's suggested fix was to skip when a chain is live; that would have been wrong, and worth recording why: unlike the sections, this path exists **because the photo changed**, and a read of the previous state does not answer the new one. Skipping would silently drop the re-read. The fix is to **serialize** — wait for the live chain, then read anyway. That removes the concurrency (the photo read lands last and wins) while keeping the re-read, and it costs no extra cap unit, because a photoless read skips the gate entirely (`incident-analysis.ts:732`).

Two comments were also factually wrong and are corrected above. Neither review would have caught them from the code alone; they were caught because the comments *claimed* things a reviewer could check.

## Filed, not folded in

- **CUL-812** (High) — the unguarded `status: 'failed'` catch-write burying a live `worth_a_call`. A server-side defect in its own right.
- **CUL-813** — no route-level test coverage for `app/event/[id].tsx`'s photo-add chain. This is precisely why the second defect above survived a careful read: the mutation pass reached `lib/` and the two sections, and nothing was watching that screen.
- **CUL-814** — the unbounded `awaitAnalysisChain`. The wait's *length* is pre-existing (the section always awaited an upload + vision call before `beginWatch`), but a chain that never settles now leaves a permanent `Map` entry that poisons that event id for the whole session, where before each mount got its own read. The fix has a real trade-off — a ceiling short enough to help fires routinely on slow-but-healthy links and recreates the double-invoke — so it is a PM call with options, not a value I picked at the end of a long session.

## A second process note

The mutation that appeared to prove a guard dead had patched **one of two identical lines**: `invoked = !error;` appears once per trigger, the test under scrutiny exercised the other one. A single-occurrence replace on a symmetric pair reads exactly like a missing guard. Mutate every occurrence, or assert the count first.
