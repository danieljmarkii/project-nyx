# One push per queue at a time — the arrival-order half of the in-flight window (CUL-622)

**Date:** 2026-08-30

Shipped via **#768**. No schema, no Edge Function, no migration.

## What the issue asked for, and why that wasn't the work

CUL-622 was filed on 2026-08-23 against `markSynced`: it marked rows synced on the strength of an id alone, so a push response landing after an edit could flag a row whose newer version had never been sent. Its stated fix was *"mark synced with `AND updated_at = ?` against the value that was actually pushed"*.

**That shipped yesterday**, as CUL-691 (#761), under a different framing — the completion card's *Undo* rather than its *Change time*, a tombstone rather than a correction, the same guard. `markSynced` and `applyFailurePolicy` both key on the pushed version now, and `syncQueue.test.ts` scans the invariant they rest on.

So the session opened on a duplicate. What made it not one is the sentence CUL-622 spends a single line on:

> The variant where #1's request simply lands after #2's has the same terminal state.

That half was open, and tracing it made it worse than the issue described.

## The defect as it actually stood

Nothing serialized the per-queue pushes. Every write path fires one and forgets it — `lib/simpleEvent.ts`, `lib/meals.ts`, `lib/weight.ts`, `lib/medicationDose.ts`, `lib/undoLog.ts`, all three completion cards — and `syncCycleInFlight` guards only the *full cycle* (`syncNow`, `flushPendingForSignOut`), never these. Its own comment already knew why that mattered: *"The alternative (running two concurrent pushes over the same queue) trades a redundant prompt for double-sent rows."* The rule was enforced in one layer and skipped in the ones beside it, which is CUL-641's and CUL-691's shape a third time.

So the ordinary completion-card flow put two versions of one row on the wire together:

- `t=0` — `insertSimpleEvent` writes the event and fires `syncPendingEvents()`; push A sends `updated_at = T0`.
- `t=2` — the owner taps **Change time** on a card that lives 5000ms and is designed to be used in exactly those seconds. `updateEvent` stamps `T2`, sets `synced = 0`, fires `syncPendingEvents()`.
- `t=2.1` — push B sends `T2` while A is still in the air.

Whichever request Postgres applies **last** decides what the server keeps, and nothing about issue order decides arrival order — A is still in flight precisely because the network is being slow to it. If A lands last, every guard downstream reads clean: B's mark is legitimate (the local row really is `T2`, which is really what B sent), so the row goes `synced = 1` and nothing re-queues it.

**The second half is what turns this from a server that lags into a correction the owner loses.** `set_updated_at()` (migration 001) is `BEFORE UPDATE … NEW.updated_at = NOW()`, so A's conflict-update re-stamps the stale server row with the *server's* clock — later than the local corrected row's `T2`. Hydration's LWW is `remoteT > localT` over rows at `synced = 1`, which is exactly the state above. **The next `hydrateFromCloud` writes the pre-correction time back over the correction on the device.** The phone and the vet report converge, on the number the owner corrected.

`lib/hydration.ts`'s header names a server-time-LWW failure mode as an *accepted v1 design* (requirements §5.2 FR-5). It does not cover this. That ruling is about two devices editing one row while offline, where the app genuinely cannot know which edit came first; here it is one device, one owner, one correction, and the send order was entirely ours to decide.

## The PM decision

Presented as a brief with three options — close as duplicate and file the residual; fix it client-side; fix it server-side with a monotonic `updated_at` trigger. **PM ruled for the client-side fix** (option A), leaving the server-side half on its own issue because it revises a ratified design and is a migration across eleven tables.

## What shipped

`serializeQueuePush(queue, drain)` in `lib/sync.ts` — one active drain per queue table, keyed off the same `QueueTable` union the push registry uses. All twelve `syncPending*` drains are wrapped; their bodies are unchanged.

- A caller arriving mid-run gets a **trailing** run, not the active one. The active run may already have read the queue before that caller's write, so handing it back would resolve without ever sending the row it was called for.
- **One** trailing run is enough — it reads the queue when it starts, so it subsumes every caller that arrived while the active run worked — and its slot is released the moment it **starts**, not when it finishes.
- `ensureEventAttachmentsSynced` is deliberately not wrapped: it is not a queue drain (it targets one event by id), and `event_attachments` is one of the two `INSERT_ONLY_QUEUE_TABLES`, whose rows cannot change under a push at all.

## The objection this had to answer

CUL-691 **considered serialising and refused it**, for a reason recorded on CUL-733: *"a hung request with no timeout would block every push behind it, which is a new failure mode on the health-write path."*

That is correct — supabase-js sets no request timeout, so an unbounded wait would let one stalled upsert hold its queue for the life of the process, and the correction the owner just made would never go up at all. Worse than the race it replaces.

So the wait is **bounded**. Past `QUEUE_PUSH_WAIT_CEILING_MS` (15s) a trailing run goes anyway. What makes that safe is where it degrades **to**: a queue stalled past the ceiling falls back to exactly the concurrent behaviour it had before this change — the old failure mode, not a new one — while the window this exists for (a card that lives 5000ms, an edit landing a second or two after the insert's push) sits well inside the bound. *Judge a lock on a write path by where it degrades to.*

Dropping the waiting run instead was rejected for CUL-733's own reason: on this path the waiting write is a tombstone or a corrected symptom time, and a drop leaves it waiting for the next foreground.

The other half of the same argument is the per-**table** key. One global lock closes CUL-622 just as well and makes every write path wait behind an unrelated queue's network round trip; the scope is pinned by a test rather than by intention (mutating it to a single key hangs that test).

## The mistake the tests caught

The first draft of the ceiling did nothing, and read as the tidier version of the code.

The trailing run originally recursed through `serializeQueuePush`. On the ordinary path that is correct — by the time the wait ends, the settled run has cleared the slot, so the recursive call takes the "no active run" branch and starts. **Past the ceiling it is a no-op**: the slot is still held by the run that never settled, so the recursive call takes the *same* branch and schedules another wait — a chain that only ever ends when the hung request does, which is precisely the unbounded wait the ceiling exists to refuse.

It was written, reviewed by eye, and believed. The ceiling test failed on its first run and named it. The fix is an explicit `startDrain` that claims the slot unconditionally, and the identity check in its `.finally` stops being defensive and becomes load-bearing: past the ceiling a newer run owns the slot while the older one is still outstanding, so the stale run's completion must not clear it.

*A guard written for a mechanism is the only thing that finds the mechanism quietly doing nothing.* CUL-613's rule — prove it by mutation, not by inspection — paid for itself inside one session, against code its own author had just written to be correct.

## What the reviews changed

Both passes ran on `c9f6393`. `code-reviewer`: **fix-before-merge**. `adversarial-reviewer`: **PASS on correctness for every live path, FAIL on the test block's discrimination.**

The correctness pass is worth recording because it checked the premise rather than taking it: it verified `set_updated_at` → `shouldWriteRemoteRow` → the `synced = 1` backstop end to end and confirmed the stale server row does win and that CUL-691's guard does not rescue it. It marked one thing **INSUFFICIENT** and was right to: nobody here can confirm that two supabase-js upserts issued 2s apart genuinely reorder at Postgres without a live HTTP/2 capture. Every *consequence* of reordering is verified; the reordering itself is inferred.

Four things came back, and three of them are now closed in the diff.

**1. Two one-token mutations reintroduced real concurrency defects and left all six original tests green** — found independently by both reviewers.

- `return drain()` instead of `startDrain(...)` in the trailing branch: the trailing run stops claiming the slot, so the next caller pushes beside it. The whole defect, restored.
- a bare `queuePushInFlight.delete(queue)` instead of the identity check: after a ceiling fire, the stale run's settlement clears the *live* run's slot.

Both are edits in the direction a future reader would call a tidy-up, and the second is the line the in-place comment explicitly calls load-bearing. **The counting lesson is the sharp part:** the existing release test asserted *queue reads*, which are 3 either way, so it could not see a caller that failed to wait. Only the **upsert count at the moment the next caller arrives** discriminates. *A test that counts the work done cannot see a caller that failed to wait.*

**2. A latent handoff gap, reproduced on unmutated source.** The active run's `.finally` clears the in-flight slot several microtask jobs before the trailing run starts. A caller landing in that window saw both maps empty, started its own drain, and the pending trailing run then started beside it — `a.then(() => syncPendingEvents())` produced three upserts where the serializer permits two. Microtask-only, so no tap or timer can land in it, and no call site does it today (every `.then` chain in the app crosses queues). One ordinary-looking future line re-opens it, so it is closed rather than noted: **check the trailing slot before the in-flight slot.** A pending trailing run has by construction not read the queue, so joining it is always safe.

**3. The ceiling was justified against the wrong quantity.** The comment argued 15s from the completion card's 5000ms life — which measures the *owner's* window, not the *drain's* duration. On three queues the drain routinely exceeds it: `drainEventAttachmentsQueue` and `drainVetDocumentsQueue` each walk up to 20 compress-then-upload round trips, and `pushRows`' isolation pass fires up to 100 sequential single-row requests after a batch refusal. So the ceiling is the ordinary path there, not the fallback, and those queues spend the rest of the run unserialized. Costless on `event_attachments` (insert-only, no version); **materially thinner on `vet_documents`**, an LWW queue where a rename or soft delete mid-upload is exactly this defect. Still never worse than pre-fix, so it ships — but the header now says *strong on the row queues, partial on the object queues* instead of claiming safety everywhere.

**4. Named, not closed: the read side now waits on pushes it is not making.** `flushPendingForSignOut` walks 12 queues behind a spinner with no timeout of its own, and `flushBeforeReport` and the `analyze-*` triggers each await a queue. Waiting on a run that is genuinely working is correct — it is the same work — so the real cost is one ceiling per *hung* queue, not per queue. No safety consequence (the per-incident read is escalate-only; delay never reassures).

3 and 4 have the same root and the same fix, which is out of this PR's scope: **bound the request rather than the wait.** supabase-js sets no timeout, so nothing today can. Filed as **CUL-743** and referenced from the code.

## Tests

Nine, in `lib/sync.test.ts`, each confirmed red against a mutation of the code it protects, one defect at a time. The last three exist because the reviews proved the first six did not cover them — the honest reading of that is that "mutation-proved" was true of the tests that were written, and the gap was in **which defects were enumerated**, not in the proving:

| Mutation | Red |
|---|---|
| no serializer at all (the pre-fix tree) | the defect test, coalescing, the ceiling |
| trailing slot released when the run *finishes* | the release test |
| join the active run instead of scheduling a trailing one | all four mechanism tests |
| no `.catch` before chaining (a failed run cancels the follow-up) | the failed-run test |
| one global lock instead of one per queue | the cross-queue test (hangs) |
| recurse instead of `startDrain` (the ceiling becomes a no-op) | the ceiling test |
| the ceiling timer never resolves | the ceiling test |
| trailing run does not claim the slot (`return drain()`) | the claimed-not-borrowed test |
| bare `delete` instead of the identity check | the stale-run test |
| check in-flight before trailing | the handoff-gap test |

The harness releases every deferred in `afterEach`, because the serializer's state is module-level: a test that fails mid-flight would otherwise leave its queue slot held and cascade red through every later test in the block, naming the wrong defect. That was observed, not anticipated.

The ceiling test fires the callback the code actually armed rather than advancing jest's clock — the RN preset installs its own timer implementation, and `jest.advanceTimersByTime` does not reach this one. A ceiling test that silently never fires would pass against an unbounded wait, which is the exact defect it exists to refuse.

## Filed

- **CUL-741** — filed for the server-side monotonic guard before reading CUL-733's body, then **cancelled as a duplicate of CUL-733**, which already carries both halves (it was filed out of CUL-691 the same morning). Recorded here because the lesson is small and repeatable: read the sibling issue's body before filing its follow-up, especially when the sibling shipped hours earlier.
- **CUL-733** stays open for its server-side half.
