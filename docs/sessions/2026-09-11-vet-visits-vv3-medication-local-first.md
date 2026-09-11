# Vet visits VV-3 — the medication write goes local-first

**Date:** 2026-09-11

Shipped via **#834** (CUL-901). Two commits: the change, and the fix for the defect the change introduced.

---

## What shipped

`lib/medicationSetup.ts` — `startRegimen` / `updateRegimen` / `endRegimen` — in the `startDietTrial` shape: a local row at `synced = 0`, the id returned, a fire-and-forget `syncPendingMedications()`. `AddMedicationModal` and `handleEndRegimen` call it; the remote-first inserts and the offline *"Could not save"* are gone. `startDietTrial` gains an optional `vetVisitId` written inside its existing transaction's INSERT, and `StartTrialModal.onStarted` returns the trial id VV-4 needs.

The push queue for `medications` had existed since B-117. Nothing was missing but a writer that used it — which is worth saying plainly, because it means this was never a hard problem, just an unfinished one that everybody walked past.

## Two forks, ruled before coding

**All three write paths, not only the create.** The issue scoped VV-3 to `startRegimen`. Reading the modal first showed that shipping only that would have *introduced* a defect: a course that exists locally but has not pushed is invisible to a server-side `.eq('id', …)`, and the edit branch used `.maybeSingle()`, which answers a zero-row match with `null` and no error. The modal would have closed on a correction that went nowhere. PM ruled all three.

**`vet_visit_id` rides `StartRegimenInput`, not `RegimenWritePayload`.** The issue named the payload. But `lib/medications.ts` is *directly* in `generate-report`'s shipping closure (`grep -rho '\.\./\.\./\.\./lib/[a-zA-Z]*\.ts' supabase/functions` — it is in the list), so editing it reds `guards/edgeFunctionDeploy.test.ts` and owes the ledger a `hold` entry on the already-held CUL-19 chain, for a field no Edge Function reads. C-26 says move the code, never bump the ledger. It is also the truer home: `buildRegimenPayload` maps FORM fields; a visit link is provenance the caller supplies. The green `Edge Functions (deno test)` check on both commits is that call paying off.

Generalisable: **check the Edge-Function import closure before editing any `lib/` module, not after the guard goes red.** The cost of getting it wrong is not a failing test, it is a rider on a deploy that has been held since July.

## The defect this session shipped, and then fixed

Both mandatory reviews ran and converged independently on the same finding. `code-reviewer`: *fix-before-merge*. `rls-privacy-reviewer`: *FAIL*.

Moving the write local-first did not **cure** the `.maybeSingle()` silence the first commit's own spec amendment claimed it cured. It **relocated** it — from PostgREST's zero rows to SQLite's. `UPDATE medications … WHERE id = ?` against a row the local mirror does not hold returns `{ changes: 0 }` and resolves: no throw, no row, no queue entry, no banner. The code being deleted had checked for exactly this (`if (!data || data.length === 0) throw …`); the replacement was unconditional, and `onUpdated` then fired regardless, repainting the card with a correction that existed nowhere.

It is reachable, and the path is worth writing down because it is not exotic. The Pet-tab card offering Edit and End reads **Supabase**, while these writes go to the **local mirror**, whose only other writer is `hydrateMedications` — which runs on mount / foreground / reconnect, never on tab focus. Two phones on one household account is enough: device A adds a course, device B has the app open, sees it from the server, taps End, and silently ends nothing — while `generate-report`, `ask` and `generate-signal` all go on reading `status = 'active'`. An owner who believes she stopped a steroid, and a vet report that still lists it.

The fix is a zero-row check before the hydration tick and the flush (a tick over an absent row repaints the card as though the write landed; a flush finding an empty queue is what makes the failure look like success). It is **not a new rule** — all four of `lib/db.ts`'s by-id local updates already carry it, with the same reason spelled out in a comment. The guard existed; this write path just did not inherit it.

### Why the tests could not see it

Two compounding fixture faults, and both are the same lesson from different ends.

1. **The `getDb` mock did not return the run result.** `expo-sqlite`'s `runAsync` resolves `{ changes, lastInsertRowId }`; the mock resolved `undefined`. A stand-in narrower than the API it replaces makes the caller's use of the dropped half untestable — so no test *could* have caught a missing `changes` check, however well written.
2. **Every test seeded its row first.** The "target absent from the mirror" branch — the one harbouring the bug — had no fixture at all. This is C-35 verbatim, one session after C-35 was written down: a suite green over a shape it never builds.

Both fixed. Removing the guard now reds three tests.

## What held

Each of these is an executed attack, not an inspection — the `rls-privacy-reviewer` replayed the verbatim policies and triggers from migrations 001 / 020 / 066 / 067 against a local PG16:

- User B queues a regimen carrying user A's `pet_id`, pushed through `pushRows` → `42501`. `medications_owner` has `with_check IS NULL`, so Postgres reuses `USING` as the INSERT `WITH CHECK` — the reuse 067's header calls load-bearing is real. Classified `rejected`; never lands.
- Id-collision hijack (upsert onto A's existing medication id) → `42501`; the `ON CONFLICT DO UPDATE` arm cannot see A's row.
- Cross-pet **and** cross-account `vet_visit_id`, on `medications` and `diet_trials` → `23514` from 067's trigger, with the message byte-identical across both causes and naming only `NEW.*` values (the C-31 check, run rather than assumed).
- `updateRegimen` used to move a row between pets → held by type and by statement: `pet_id` is in neither the SET list nor `RegimenWritePayload`.
- An unsynced regimen surviving sign-out onto the next account → wiped; `medications` is in `LOCAL_WIPE_TABLES` and `clearLocalData` deletes unconditionally.

Caveat kept honest: that replay is a local PG16 of the verbatim policy text, not the live project — this session had no Supabase MCP. Re-running attacks against `aigchluqluzuhtbfllgh` inside a rolled-back transaction is the 067-header technique and would confirm live parity.

## Guards

Three registrations, each proven by mutation rather than by reading:

- **`guards/homeWrites.test.ts`** — the three helpers join `WRITE_CALLS`, `lib/medicationSetup.ts` gets a `WRITE_PATH` entry. A planted `startRegimen` in `MedStrip.tsx` reds with the third-write-class message. Registered the PR the helper ships (C-32), before VV-4 gives it a second caller.
- **`lib/dietTrialDayMath.guard.test.ts`** — `lib/medicationSetup.ts` joins `DATE_COLUMN_SURFACES`, because `ended_at`'s day key now reaches the row through it. C-16's rule in its general form: extracting a write out of a scanned file owes the scan an entry for what came out. A planted `toISOString().split('T')[0]` reds.
- **`guards/visitReaders.test.ts`** — **caught both new writers unprompted**, before it occurred to this session to register them. That is VV-1's guard doing precisely its job, one session after it shipped.

Registering the last one surfaced something worth recording: `ALLOWED` is `Record<string, string>` — file → reason — so it excuses a **file**, not a **kind**, even though the guard already computes the kind and prints it in the failure. The new entries would therefore also cover a later `SELECT … FROM vet_visits` in those files, which is the exact thing they are excused for not doing. The first draft of the entry's comment claimed the opposite (*"if either ever grows a SELECT … the entry stops covering it"*) — a comment writing a cheque the code does not cash, which is 045's diagnosis and C-38's rule. It now states the blind spot instead, and names CUL-937.

## Residuals

| Issue | What |
|---|---|
| **CUL-938** *(High, rewritten)* | The Pet-tab card's remote read. Wider than first filed: both loaders re-run on every focus and overwrite state unconditionally on a **successful** read, so any focus cycle whose remote read beats the queued push erases an already-rendered course, and an ended course returns as active. It is also what makes the zero-row case reachable — fixing that read closes both. |
| **CUL-944** *(High, `Waiting on PM`)* | A quarantined row renders in the app (local reads) while the vet report omits it (server read) — the app and the document a vet acts on disagreeing about a pet's medications. And the banner says to retry "from History", where 7 of the 15 quarantinable tables have never appeared. Pre-existing; `medications` became reachable here, because before this PR nothing wrote that table locally at `synced = 0`. Carries a decision brief. |
| **CUL-945** *(High, blocking VV-4)* | A wrong `vet_visit_id` is refused with a **terminal** `23514`, so the first push quarantines and what is lost is the whole prescription, not the link — with no client path to clear it. Latent (no caller passes one yet); VV-4 is the first. Written at the call site where VV-4's author will read it. |
| **CUL-937** *(Low)* | Kind-scope the `visitReaders` allow-set. |

## Also worth keeping

The new modal suite carries a `beforeAll` warm-up with its own timeout, and the reason is measured: the first render of that tree costs ~5.5 s on an empty jest cache and ~0.1 s after, because jest-expo transforms React Native's lazily-`require`d internals *during render* rather than at import. CI always runs cold, so whichever test rendered first would have blown the 5 s default and gone red on a change it had nothing to do with. Paying it in a hook keeps every test on the default bound — `jest.setTimeout` for the file would have hidden a genuine hang instead. Reproduced with `npx jest --clearCache` both ways before and after.

`components/profile/AddMedicationModal.test.tsx` did not exist before this session. That absence is the whole story of the bug this PR fixes: the modal's offline behaviour was never asserted anywhere, so nothing went red as the app grew local-first around it. The new suite reds 4/6 against the pre-VV-3 modal.
