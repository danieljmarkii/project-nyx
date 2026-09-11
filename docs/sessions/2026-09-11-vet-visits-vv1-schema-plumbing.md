# Vet visits VV-1 — `vet_appointments`, the three visit links, the local-first plumbing, `guards/visitReaders`

**Date:** 2026-09-11
**Issue:** CUL-899 (Vet visits — the appointment companion, milestone A — dark + substrate)
**Outcome:** shipped via #832
**Mode:** BUILD

---

## What shipped

**Migration 066 — the substrate.** `vet_appointments` (the booked, not-yet-happened visit) per spec §5.1, plus `vet_visits.deleted_at` and the two provenance links `medications.vet_visit_id` / `diet_trials.vet_visit_id`. RLS default-deny, per-pet owner scope, **three verbs and no DELETE** (044's precedent — this table carries `deleted_at`, so a delete is an UPDATE, and account deletion runs the cascade under the service role). Structural `CHECK`s on `questions` (array-typed; 64 KB).

**Migration 067 — the parent half.** Written after the `rls-privacy-reviewer` pass; see below.

**The local mirror and the push.** `vet_appointments` in `BASE_SCHEMA_SQL`, `LOCAL_WIPE_TABLES` (children first), `SYNC_QUEUES`; a `serializeQueuePush` drain and an LWW hydrate step after `vet_visits`; the enumerated `vet_visits` push gaining `deleted_at`; the two link mappers and their hydration columns; three `COLUMN_UPGRADES` rows.

**The reader sweep** (`deleted_at IS NULL`) on `lib/rundown.ts` `readLastVisitDate`, `lib/vetDocumentDetail.ts` `VET_VISIT_OPTIONS_QUERY`, and `generate-report`'s scope-cascade pull — the last landing on `main` **inert**, riding CUL-19 as a third rider.

**`guards/visitReaders.test.ts`** — the allow-set that keeps visit data out of every count, coverage line, Patterns panel and engine input.

**Tier-2 doc edit** to `docs/nyx-vet-report-requirements.md` §6 (PM confirmation requested in the PR body).

---

## Why a second table, and why that is the whole point (G3)

`vet_visits` means *"a visit that happened"*, and three shipped readers depend on that without saying so: `readLastVisitDate` is a bare unbounded `MAX(visited_at)`, the Vet Files link picker is unbounded reverse-chron, and `generate-report` keys the report window's first rung off `visited_at`. Each *could* be taught to exclude future rows; none of them *would* be, at the moment someone adds the fourth reader. Two tables makes a booking unwritable into the table whose rows mean "happened".

---

## Three decisions taken on the fly

**The appointment's link is spelled `vet_visit_id`, not §5.1's `visit_id`.** A one-line deviation, taken deliberately and recorded in the migration header. The sibling links are all `vet_visit_id`, and — the real reason — the new guard's column detector keys on that string, so a fourth spelling would be a hole in the boundary opened by the same PR that builds it. It also lets one trigger function serve all three tables, so C-31's message rule is written once.

**Two corrections to the issue's reader list**, from reading the files rather than the issue:

- `readSinceVisitChanges` **reads no visit row** — it takes `visitedAt` as a parameter and queries `meals`/`medications`. The sweep lands on `readLastVisitDate` only.
- "hydration" gains the **column**, not the filter. Filtering `deleted_at IS NULL` on the pull would mean a tombstone is indistinguishable from a row that was never pulled, and two devices would disagree forever — the LWW argument `vet_documents`' own header already makes. **Hydration carries; the readers filter.**

---

## What the checks caught that reading did not

**The advisor, within a minute of applying 066.** The new `SECURITY DEFINER` function shipped without its `REVOKE`, landing on `/rest/v1/rpc/…` reachable with the anon key. Migration **047** closed exactly this for the whole family and wrote *"revoking EXECUTE is not optional here, it is part of the fix"*; **045 shipped the same omission before it**. This is the third instance of one missing line, in a migration whose header cites 045 as its pattern. Closed as a second migration record (066 was already applied — the 045 rule that a recorded migration keeps saying what was run), recorded in the header rather than quietly corrected, and filed as **CUL-935** because a written warning in the file you are copying from demonstrably does not prevent it.

**The guard's own staleness assertion, before its first green run.** `lib/hydration.ts` was in the allow-set; it holds both table names as bare strings in `LOCAL_WIPE_TABLES` plus a comment, and neither is a read. C-32 working exactly as written: an allow-set fills with files someone *considered* unless each entry pays for itself. It happened twice more later (see below).

**The test suite, on the base DDL.** `vet_visits.deleted_at` and both links went into `COLUMN_UPGRADES` only, so anything building from the DDL constants got a schema the device does not have — two `vetDocumentDetail` tests went red on `no such column`. All three now sit in `CREATE TABLE` **and** `COLUMN_UPGRADES`, per the `source_filename` precedent.

---

## The reviews

Both mandatory reviews returned findings. `rls-privacy-reviewer` returned **FAIL**.

### The finding that mattered — the invariant was enforced on the CHILD only

066 guarded every write carrying `vet_visit_id` and left `vet_visits.pet_id` freely mutable. One RLS-legal statement falsified the invariant its own `COMMENT ON FUNCTION` asserts. **Reproduced against the live schema** inside a rolled-back transaction, not taken on trust:

```sql
UPDATE vet_visits SET pet_id = <the owner's other pet> WHERE id = V;   -- accepted, 1 row
```

Three linked rows then named a visit belonging to a different pet. And worse than the bleed: because the guard re-validated on *every* write, those rows became permanently un-writable — an ordinary `UPDATE medications SET notes = …` raised `23514`, which is a **terminal** sync error, so the client quarantines with no retry. The owner would lose the ability to edit her own medication forever.

This is **045's diagnosis word for word**, on the half 066 did not import: *"044 asserts an invariant that the database does not actually enforce — and 044's COMMENT ON FUNCTION states that invariant, so the comment was writing a cheque the code did not cash."*

Migration 067 closes both halves independently — `pet_id` immutable (no violation is writable) and the link guard narrowed to `IS DISTINCT FROM OLD` on both the reference and the row's own pet (a row somehow in that state stays EDITABLE). Writable-but-violating is repairable; bricked is not. Immutable rather than cascading because a visit that happened to one pet did not happen to another — the honest repair for a mis-filed visit is delete-and-re-log.

Verified after, by execution: the parent move refuses, 0 rows violate, the ordinary edit is accepted, an edit to the visit's own notes is accepted, the PostgREST upsert re-sending the same `pet_id` is accepted, and moving the *child* while linked refuses.

Severity stated honestly: **within-account, not cross-tenant** — the cross-tenant boundary held under every attack tried. Not reachable from the shipped UI. Fixed because it is free at 0 rows and expensive after VV-6.

### The guard had two holes, both demonstrated

**A dynamic `.from(variable)` was invisible.** `const T = 'vet_visits'; sb.from(T)` planted in an engine file scored zero. Not hypothetical — `pushRows`/`fetchAllRows` are written in exactly that shape. Closed with a third detector kind and its own registry, keyed on the table name's *provenance*. Measured first: six files, all sync/deletion fabric.

**The non-vacuity floor was itself partial, and the first fix did not work.** Planting a violation in `components/` and dropping `'components'` from `SCAN_DIRS` left the suite green. Iterating `SCAN_DIRS` and asserting each entry is walked is *also* green under that mutation — un-declaring a directory removes it from the loop. **A floor derived from the thing it checks cannot catch that thing being removed.** The expected set is now derived from the repository. Re-proven by the same mutation.

The dynamic registry then rejected two more entries I had written (`lib/syncQueue.ts`, whose `.from(t)` is inside a comment; `lib/attachments.ts`, a Storage bucket) — the second and third rejection in one file.

### Two corrections to the reviewers, verified against source

- The reported transitive-consumer evasion imports `readLastVisitDate`, which is **not exported** — it does not compile. The *class* is real (C-11) and is written into the guard's footer with the rule for VV-2; the demonstration was not.
- The reviewer falsified **047's own warning** in passing: a per-verb policy split alone does **not** fail open (Postgres reuses `USING` when `WITH CHECK` is omitted), nor does `WITH CHECK (true)` alone. It needs `WITH CHECK (true)` **and** a non-pet-scoped SELECT policy. Two conditions, not one. Recorded in 067's header, and the dependency confirmed live: `medications_owner` and `diet_trials_owner` both have `with_check IS NULL`.

### And one disclosure 066 owed

The `SECURITY DEFINER` flip creates a cross-account **membership oracle** by error class — `42501` means the visit belongs to that pet, `23514` means it does not. Under `SECURITY INVOKER` both return `23514`, so the flip is what creates it. 047 disclosed exactly this class for `medication_administrations` and said why it must be *recorded* rather than dismissed. 066's C-31 note answered only the narrower question (the message text, which is genuinely byte-identical). Now in 067's header. Gated behind two unguessable UUIDs; not a practical exposure, but real and new.

### From `code-reviewer`

- **A mutation-proven gap**: `LOCAL_WIPE_TABLES` gained `vet_appointments` before `vet_visits` with a comment claiming the ordering, and no test pinned it — swapping the lines left all 45 tests green. This is the **third** time that half has been missed on this list (the `looks` entry's own comment records the second). Assertion added, mutation-proven, and the rule written beside it.
- The `questions` 64 KB bound is **reachable** — measured at twelve spec-shaped questions of ~5.2 KB, a paste rather than a marathon, and the "~4x the product cap" it rested on is a cap no shipped code enforces. `parseQuestionsForPush` now bounds below the server CHECK, so the terminal `23514` is unreachable rather than improbable.
- A comment of mine claiming "every other LWW hydrate in this file" omits `created_at` was **false** — three write it, two of them edited by this PR. Corrected; the inconsistency is **CUL-936**.
- Two `COMMENT` overclaims in 066 ("every reader gained `deleted_at IS NULL`" — not true of the deliberately-exempt `lib/db.ts`) corrected in 067, because a `COMMENT` is queryable schema state and migration headers are the permanent record.

---

## AC 12, executed

Run against the live project inside a rolled-back transaction (post-probe counts identical to pre-probe; zero leftovers). Cross-account read / update / delete on `vet_appointments` → uniform not-found; `INSERT` under another owner's pet → `42501`; all three links refuse a foreign visit; the refusal for "another account's visit" and "no such visit" is **byte-identical** apart from the UUID the caller supplied. Cascade: deleting the pet left **0** appointments and **0** visits.

---

## Residuals

- **CUL-935** — a mechanical guard for the `SECURITY DEFINER` + missing-`REVOKE` omission (third instance).
- **CUL-936** — three hydrate paths write `created_at=excluded.created_at`; four do not.
- Four guard evasions remain open by design, documented in the guard's footer with what would close each: string concatenation, a schema-qualified raw read, an `rpc()`, and the transitive-consumer class.
- `lib/vetDocumentLibrary.ts` holds a `vet_visit_id` link and never joins `vet_visits`, so a document filed under a visit later soft-deleted keeps a link the picker can no longer name. Nothing writes `deleted_at` until VV-6 — a VV-6 question.
- Pre-existing and **not** this PR's: `authenticated` holds `TRUNCATE` schema-wide (no PostgREST verb maps to it), and 066 widens `TRUNCATE vet_visits CASCADE`'s reach to `medications` + `diet_trials`.

---

## Convention added

**C-38** — a guard on the CHILD is not the invariant, and a floor derived from the thing it checks cannot catch that thing's removal. CLAUDE.md carries the rule; `docs/engineering-lessons.md` §C-38 carries the account.
