# The weight-snapshot retry's two limits, and a return shape that overclaimed (CUL-699)

**Date:** 2026-08-30

Shipped via **#770** (draft). Follow-up to CUL-641 (#734).
No schema, no Edge Function, neither held deploy involved — and `lib/sync.ts` / `lib/weight.ts`
are outside every Edge closure (`grep -rho '\.\./\.\./\.\./lib/[a-zA-Z]*\.ts' supabase/functions`),
so no deploy fingerprint moved.

---

## What this was

The third `adversarial-reviewer` pass on CUL-641 returned **PASS** on the gate mechanism —
it verified `.eq('weight_kg', …)` against a real PG16 instance — and left three residuals,
none merge-blocking. All three are about what the shipped code **says about itself**, not
what it does. Nothing an owner can see changed this session.

The through-line worth keeping: **two of the three are a stated limit that under-scopes its
own trigger, and one is a return shape that asserts more than the function can know.** Both
are the same failure — a claim wider than its evidence — arriving in a comment rather than in
copy. The repo has a rule for the copy version (`clinical-guardrails`, CUL-575); it did not
have one for the comment version, and a comment is what the next reviewer reads *instead of*
re-deriving.

---

## 1. "An offline undo" was the obvious trigger, not the only one

`lib/sync.ts`'s KNOWN LIMIT block scoped the un-restorable-displaced-value case to *"an
offline undo of a first-ever weigh-in."* It is reachable **online**.

`reverseLoggedEvent` calls `reconcileWeightSnapshotAfterDelete` and **then**
`syncPendingEvents()`, which reaches the tombstone loop. So every Undo of a weigh-in puts
**two writes on the wire carrying the same `.eq('weight_kg', …)` filter and different
values** — the client's `restore.restoreToKg`, and the retry's `latest ?? null`. They
disagree on exactly one set: no reading remains **and** a restore was supplied, which is the
mis-typed first-ever weigh-in CUL-641 was filed about.

Normally the client wins and the retry matches zero rows, because by then the snapshot is no
longer the deleted reading's value. But the client write is fire-and-forget behind a
`console.warn`, so **any** failure to land hands the outcome to the retry — and a 401 in the
token-expiry window is reachable online, since the `getSession()` the retry sits behind is
what refreshes. Direction is safe either way (blank, never a wrong number), and still better
than the pre-CUL-641 behaviour, which left the mis-typed number standing forever.

Corrected in place. CUL-694 remains the real fix: a stored displaced value makes both writers
agree, so the race stops having a disagreement to resolve.

**CUL-694's own description carried the same mis-scoping** (it quotes the limit) and was
patched. `docs/sessions/2026-08-28-weight-snapshot-delete-reconcile.md` carries it too and
was deliberately **not** edited — session records are append-only; this file is the correction.

---

## 2. "No reading remains" is a claim about this device

Both `reconcileSnapshotAfterWeightTombstone` and the client helper read the latest remaining
reading from the **local mirror** via `LATEST_WEIGHT_KG_QUERY`. `hydrateFromCloud` runs
`events` and then, eleven steps later, `weight_checks`, and `fetchAllRows` returning null
skips that table until the next foreground. So on a reinstall or a second device, *"no reading
remains"* can mean *"this device has not pulled them yet"* — log a weigh-in in that window and
remove it, and the gate legitimately matches (this device **did** set the snapshot) while
`pets.weight_kg` is cleared over a record the server knows is not empty.

That is **CUL-575's rule arriving in the sync layer**: a read that has not answered is never
an empty record. The three-state shape has no UI to live in down here, which is exactly why it
is easy to miss.

Documented at both read sites rather than fixed, because the exposure predates the CUL-641 diff
and `app/log.tsx`'s write path shares the same read — a fix belongs in one predicate across all
three. Filed as **CUL-745** with the shape (a non-deleted `weight_check` event with no child
means the mirror cannot answer, so write nothing — the same discrimination the function already
makes for the *deleted* reading's child, applied to the second read).

### The "consider" the issue asked for, answered: no

> *consider whether the CUL-293 reconcile should also run after `hydrateWeightChecks`*

**No — it heals this narrow case and re-opens a wider one.** `reconcilePetWeightSnapshot` is
ungated **by design** (a reading that lands *should* re-point, same as the write path). Running
it after every pull would re-point every pet's snapshot on every hydration cycle and **destroy
an owner-typed Edit-profile weight newer than the latest reading** — precisely the defect
CUL-641's gate exists to prevent, re-introduced one layer out. A gated variant ("only when the
server snapshot is NULL") needs a server read per pet per cycle and still cannot tell a
deliberately-empty snapshot from this defect.

Written into the header so it is not re-derived, and into CUL-745 so it is not re-proposed.

---

## 3. The return value said "is" where it meant "intends to be"

`reconcileWeightSnapshotAfterDelete` returned `{ petId, snapshotKg }` for any weight check with
a child — **including when both gates refuse and nothing is written anywhere**. Every caller
discards it, so no live defect; the shape simply read as *"this is what the snapshot now is"*,
which is false in the refused case.

The issue offered two fixes. **Only one is implementable, and saying why is the point:**

- *Return `null` when both gates refuse* — **not available.** Gate 2's verdict is a row count
  on a write the function deliberately never awaits (an Undo tap must not wait on a network
  round trip to show its removal line). "Did anything change?" is not knowable by the time it
  answers. Returning `null` on **gate 1's** refusal alone would be the opposite false claim:
  the gates are independent by construction, and a refused store patch says nothing about the
  server write beside it.
- *Rename the field* — taken. `snapshotKg` → **`intendedSnapshotKg`**, with the reasoning in
  the header. The name is now the disclosure.

`app/edit-event.tsx:464` reads `snapshotKg` off **`updateWeightCheck`** — a different function,
untouched.

---

## Verification

**Mutation-proved, per the CUL-613 rule** (a guard that has only ever been green has not been
tested). The new test — *"returns the INTENDED value even when both gates refuse"* — was run
against a mutation implementing the rejected option (`return null` when the local gate refuses):

```
✕ returns the INTENDED value even when both gates refuse — never a report of what landed
Tests: 1 failed, 49 passed, 50 total
```

**Exactly one** test red-lighted, and it was the new one — which is also the finding: no
existing test covered the refused-case return shape, which is how the overclaim shipped past a
well-covered function. Source restored; 50/50 green, then **6218/6218 across 285 suites**,
`tsc --noEmit` clean.

---

## Not taken

- **Fixing residual 2 here.** It is a three-path change to a safety-adjacent write on an issue
  labelled Quick Win, and CUL-694 absorbs most of it for free. Documented + filed instead.
- **Deleting the return value entirely** (the strongest anti-overclaim fix, since every caller
  discards it). It forecloses a future caller that legitimately wants the intent for a local
  patch, and costs more churn than the rename in `undoLog.test.ts` / `guards/reversePath.test.ts`.
- **Editing `docs/sessions/2026-08-28-…`** to correct the limit at its source. Session records
  are append-only by convention; correcting one destroys the record of what was believed when.

---

## Documentation

**`CLAUDE.md` § Code Conventions** gained one entry — *a value returned before its write has
landed is an INTENT, and its name must say so.* It is there rather than only here because the
reason generalises past this function: the codebase is full of deliberately fire-and-forget
best-effort writes, and every one of them has a return value that cannot know whether it took.
It is filed as the sibling of CUL-708's *silence is a claim* — there the caller had to answer
because the field described a value the call always writes; here the function must not answer
more than its own write can confirm.

`STATUS.md` untouched — no track started or ended, no standing hold moved, no phase change,
no pointer went stale. Neither held deploy (CUL-19, CUL-557) is involved.

`origin/main` moved twice during the session (#769 accent-on-light AA, #771 CUL-533) and was
merged into this branch before the final push; no conflicts, and the full suite re-run green at
**6237/6237 across 287 suites** on the merged tree.
