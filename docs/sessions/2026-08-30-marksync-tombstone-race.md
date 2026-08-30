# markSynced can swallow a tombstone inside the Undo window (CUL-691)

**Date:** 2026-08-30

Shipped via **#761**. Three commits, no schema, no Edge Function. Filed **CUL-733**
for the half deliberately left open.

---

## The defect

`markSynced` (`lib/sync.ts`) flipped `synced = 1` on the strength of **an id alone**.
An id does not say *which version* of the row was sent, and on the last-write-wins
tables an owner can rewrite the row between the moment a push reads it and the moment
the response lands. The completion card's Undo lives 5000ms and is *designed* to be
used in exactly those seconds:

```
t=0.0  insertWeightCheck fires syncPendingEvents(); it reads the row at T0 and sends it.
t=2.0  Undo. softDeleteEvent stamps deleted_at + updated_at = T2, synced = 0.
t=2.1  the in-flight response lands and marks the row synced.
```

The tombstone is then flagged as pushed and was never sent. Nothing re-queues it (the
row reads `synced = 1`) and hydration will not correct it (local `updated_at` is newer,
so LWW keeps the local state). The server keeps a live row the owner removed,
permanently.

**Why it is not benign despite Undo firing its own push.** The first read of this
looked reassuring: `reverseLoggedEvent` calls `syncPendingEvents()` itself, so surely
the tombstone goes up a moment later. The window that makes it real is *between the
two* — that function awaits the local delete, awaits the snapshot reconcile, and the
new push then awaits `getSession()`, which can do a network token refresh. A response
landing anywhere in that stretch marks the row synced **before** the second push's
queue read runs, and that push then finds nothing to send.

## The fix

The mark is conditional on the row still carrying the `updated_at` that was actually
pushed:

```sql
UPDATE <table> SET synced = 1, sync_attempts = 0, sync_error = NULL
 WHERE id = ? AND updated_at IS ?
```

**The guard already existed, in one place.** `syncPendingVetDocuments` wrote it inline
for B-478 VF-6, and its comment said in as many words that `markSynced` *"matches on id
alone, which would defeat the guard"*. So this is CUL-641's shape again: a rule enforced
in one layer and skipped in the ones beside it. It now lives in the shared helper and
`vet_documents` is back on it.

Three mechanics worth keeping:

- **`markSynced` takes rows and is constrained to `LwwQueueTable`**, so a caller has
  nowhere to put an id without the version it belongs to. `LwwQueueTable` is derived by
  *excluding* the insert-only queues, so a queue added later is guarded **by default**
  rather than by memory. `markSyncedInsertOnly` carries the old unguarded sweep for the
  two attachment tables; the two unions make picking the wrong one a compile error in
  both directions (`TS2345` each way, `TS2741` for a row missing its version).
- **`IS`, not `=`.** A row-value `IN (VALUES …)` form would fit in one statement but
  compares with `=` semantics, so a legacy NULL `updated_at` could never match — and a
  row that can never be marked synced is re-pushed every cycle forever, which is the
  wedge B-398 exists to prevent. The per-row loop is the price of null-safety and is
  the shape `applyFailurePolicy` already used.
- **Atomicity granularity changed** and is now stated in place: 400-or-none became
  row-at-a-time. That is the better direction — partial progress survives a throw, and
  an unmarked row is simply re-pushed. Only the reverse (marked but unsent) is lossy,
  and neither shape can produce it.

## Why the vet report is the sharp end

`generate-report`'s events pull is `.is('deleted_at', null)`, so a tombstone that never
lands puts its **whole event** back into the clinical document. The CUL-641 worked
example is the sharp one: an owner types 124 for a 12.4 lb cat, taps Undo, and the
report prints 124 lb as the patient's current weight on the page-1 header. The
access-control pass judged the original harm statement accurate but **understated** —
it is not weight-specific (symptom counts, the episode timeline, doses all return), and
Appendix E embeds a deleted photographed incident's **photo bytes** into the PDF the
owner sends their vet.

## What the reviews found

All three passes ran. Two found real defects, and the pattern across them is worth
recording: **the logic was never broken; the enforcement was.**

### `code-reviewer` — ship-ready

Two nits and one informational, all applied: a comment claiming two call sites where
there are three, a needless generic on `markSynced`, and the unstated atomicity change
above. Also asked for `markedIds()` in the tests to fail loud rather than silently
under-assert if handed a chunked capture — done, and proved it fires.

### `rls-privacy-reviewer` — PASS on the boundary, two defects

It replayed both statements over the Undo sequence against real SQLite rather than
reading them, and confirmed the guard holds. It could not find a local write that
re-queues a row without moving `updated_at`, and confirmed hydration cannot move the
guard value under an in-flight push (all thirteen upserts carry `WHERE synced = 1`).

**1. The union could drift with zero signal — a defect in the durability of the fix.**
`InsertOnlyQueueTable` was a hand-written type union and nothing asserted its
membership. Moving `vet_documents` into it and pointing its writer at
`markSyncedInsertOnly` re-created the exact B-478 VF-6 bug **on the exact queue that
bug was found on**, with `tsc` clean and 6194 tests green. The guard was
one-directional: `markSynced` fails closed when the *registry* says a table is
unguarded, and was blind to the *union* claiming it — which is the direction that ships
an unguarded mark.

Fixed by making the set a runtime array the type derives from (a type asserts nothing a
test can read), with the two halves now checking each other in both directions:
`syncQueue.test.ts` holds the registry to the real schema, `sync.test.ts` holds the
union to the registry. Neither suite has to import what the other can see — and that
split is forced, not stylistic: `lib/syncQueue.ts` is deliberately outside the
supabase/expo import graph, so putting the assertion there fails the whole suite on
`lib/supabase`'s fail-fast.

**2. The failure half of the same response was unguarded**, and its strand is harder
than the one being fixed. `applyFailurePolicy` was keyed on `id` alone, so the terminal
arm writes `sync_error` onto the freshly-written tombstone — and the queue read is
`synced = 0 AND sync_error IS NULL`, so the row leaves **every** queue for the life of
the install. A wrong mark at least leaves the row visible. The rejected arm is reachable
today (`RLS_FILTERED_ERROR` is synthesised on any zero-row write) and silently un-did
the `sync_attempts = 0` that `softDeleteEvent` performs precisely because *"the budget
is per unsent change"*.

Both arms now carry the guard. The row threads through as `PushedRow`, with the two
wrappers **overloaded** so an LWW caller cannot omit the version and an insert-only
caller cannot invent one — and deliberately **no runtime default** behind the type, per
CLAUDE.md's CUL-708 rule: a default there would turn a forgotten field into `IS NULL`,
which matches nothing, which means the failure is never recorded and the row retries
forever without ever spending its budget.

### `adversarial-reviewer` — FAIL on enforcement, not on logic

The most valuable pass. It could not break the guard with data, but **three mutations
shipped green through the entire 6199-case suite**:

| Mutation | Consequence |
|---|---|
| `pushRows` binds `new Date().toISOString()` as the guard | **Total wedge** of every LWW queue |
| `pushRows` binds `r.created_at` (the copy-paste shape) | same |
| `softDeleteEvent` drops its `updated_at` stamp | CUL-691 re-opened in full |
| `vet_documents` mark reverts to unguarded | B-478 VF-6 back |

The wedge deserves emphasis: it is not a swallow. The guard never matches, so *nothing
on any LWW queue is ever marked synced* — every row re-pushed every cycle forever,
permanently occupying the `LIMIT 100` window, with `applyFailurePolicy` unreachable on a
success so nothing quarantines it either.

**The cause was a seam this session built.** The new `markSynced` tests execute their
SQL against real SQLite, which is why they discriminate. The eleven `pushRows` writers
were only checked through the mock, via `markedIds()` — which reads `params[0]`, the id,
and **discards the guard value entirely**. So nothing anywhere asserted that the value
`pushRows` binds is the value the row actually holds. The one line that gestured at it,
`expect(sql).toContain('updated_at IS ?')`, checks the statement's *shape* and was
satisfied by both wrong-bind mutations.

All four are now caught, each mutation-proved against the exact defect.

## Two things this session got wrong and corrected

**The `KNOWN LIMIT` comment was wrong about what the limit is.** It called the
same-millisecond collision the guard's only gap. The real precondition is *any*
re-queueing write that skips `updated_at` — empty today across all sixteen
`synced = 0` write sites, but empty **by convention**, which is exactly the shape
`syncQueue.test.ts` already refuses for the other half of the same write contract. It
is now scanned beside it, over a statement window rather than a line (`dietTrialSetup`
splits its SET list across lines). The dangerous shape is already in the tree and is
named in place: `adoptVetDocumentLocalUri` writes `vet_documents.local_uri` and
deliberately skips `updated_at`, safe **only** because `vetDocumentRowToRemote` omits
that column from the push payload — two facts in two files with nothing tying them.

**The CUL-733 write-up claimed "not made worse" too cleanly.** The outcome is not worse
— every interleaving that ends wrong now already ended wrong before. But the fix makes
the window **more reachable**: in the interleaving where the stale response lands before
`reverseLoggedEvent`'s push reads the queue, the old code sent *one* request (the second
push found `synced = 1` and sent nothing); this sends *two*, concurrently. It converts a
*certain* loss into a *probabilistic* one. The right trade, but not "no new exposure".
And the worst case is one step further than described: the `set_updated_at` trigger
stamps the server row `NOW()`, `shouldWriteRemoteRow` overwrites on remote-newer, and
hydration's `WHERE synced = 1` backstop now passes — so **the next hydrate erases the
local tombstone too and the deleted event reappears on the owner's device**. Both
corrections are in the issue, which was retitled accordingly.

## Scoped out, deliberately

**CUL-733** — `.upsert()` carries no server-side `updated_at` comparison, so two
concurrent pushes of the same row can be *applied* out of order. `syncPendingEvents()`
has no in-flight lock and is fired fire-and-forget from ~8 call sites. CLAUDE.md's
stated architecture is "last-write-wins on sync conflicts"; today the column records
*arrival* order and nothing can refuse an older write.

The PM ruled: file separately. The real fix is a server-side LWW comparison — a
migration, and a migration ships in its own PR. The client-side alternative (a
queue-behind promise chain per writer) was considered and not taken: it serialises more
than it needs to, and a hung request with no timeout would block every push behind it,
which is a new failure mode on the health-write path.

## A note on the guard-writing method

Every guard this session added was **mutation-proved one defect at a time**
(CUL-613/CUL-621), including — and this is the part that earned its keep — the guards
written *for* the review findings. Reading a test and agreeing with it is not the check.

One incidental confirmation of the same lesson: a review agent left a `tsc` probe in the
working tree asserting the unions reject each other's tables. It reported no errors, and
it proved nothing — `declare const db: never` makes TypeScript skip checking the
remaining arguments. Re-run with a real `db`, all four wrong-table calls error as
claimed. A green probe is not evidence.
