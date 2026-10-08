# Engines v3 PR-27h: a change on the events side takes back the leave to wait (migration 089)

**Date:** 2026-10-08
**One thing:** D3 L1 — Reading a test: a green test only proves something if the thing it checks could have failed · check: pending

Dispatched build of CUL-1671, shipped via #1120. **089 and 090.** The dispatcher applied 089 to production from its first draft (3e2d1de), before the confidence fix and the incident-insert ruling landed. The PM then ruled the split: 089's file goes back to the applied bytes (sha 3080b978), and both changes move to **090**, which waits on the PM's `apply 090`. The probe on 088+089 (what production runs) fails exactly the 4 new cases; with 090 on top, 48/48 pass. The guard judges the replay's last definitions, and it reds with 090 removed. It also finishes CUL-1676, which the PM folded in mid-session. The plan was posted and the PM typed "go". After the reviews, the PM typed "yes to 1, keep 2". The PR is left open for the PM: 090 is unapplied, and a dispatched child neither applies nor merges a migration.

**What shipped.**
- One INVOKER function, `take_back_may_wait_on_record_change()`. It is pinned, EXECUTE is revoked from clients, and it raises no message of its own.
- It runs on four AFTER triggers: an events insert, an events move, a meals insert and a meals re-rate. Each one lowers `may_wait` TRUE → NULL on every TRUE of the same pet inside the server predicate's window. "Same pet" means either the analysis pet or the event pet.
- The touch points:
  - **lethargy:** anchor ≤ L + 96 h, no lower bound;
  - **a new or moved vomit or stool:** ±144 h;
  - **a cat's rated meal:** [M − 72 h, M + 240 h], or every TRUE when M is within the last week;
  - **self:** the moved event's own TRUE.
- A move means a change of time, confidence, pet or type, or an un-delete.
- Every role fires.
- `guards/mayWaitRecordChange.test.ts` derives every interval from the TS constants and the watched columns from `readMayWaitRecord`. It also pins the predicate lines each window answers.

**Proof.**
- A scratch Postgres 16 probe ran 48 cases. 089 passes all 48. On 088 alone, the 27 lowering cases fail and the 21 keep cases pass. Each earlier draft fails exactly the cases its fix later added.
- 25 behavioural mutants and 23 guard mutants were all killed but one. That one, a dropped `REVOKE … FROM authenticated`, exposed a gap in the existing `functionHardening` replay, filed as CUL-1678.
- tsc is clean, and 1166 guard and hardening tests pass.

**What broke on the way.**
- **The probe went green over nothing, twice.** First, a seed inserted a rated meal after the TRUE row, so the seed's own meals trigger had already lowered the TRUE before the write under test ran. Later, the new incident-insert trigger did the same to every seed that added a neighbour vomit. A non-vacuity check now asserts each lowering case's row still reads TRUE after the seed, and seeding runs with triggers off. That check caught the second round at once.
- **The adversarial pass broke the first draft.** Restating a "Found it" vomit as "Saw it" at the same time can make the floor's T1 or T2 call-now, and `occurred_at_confidence` was not watched. The guard's column list had been hand-written. It is now derived from the server's reader, so this class reds.

**Reviews.**
- **`rls-privacy-reviewer`: PASS.** It tried cross-tenant moves and inserts, a meal pointed at another tenant's event, a timestamp-overflow oracle, lock blocking, RPC, and temp-table shadowing. Low finding: the "raises nothing" wording; fixed. Pre-existing: CUL-1679.
- **`adversarial-reviewer`: BREAKS → fixed.**
  - The confidence edit above.
  - The photoless third vomit, which the PM ruled in.
  - All four windows were confirmed against the predicate.
  - A dog's TRUE survives its meals.
  - The cat-meal breadth was ruled keep.

**Rulings (the PM, typed in this session).**
- "go" on the plan.
- "yes to 1": incident inserts fire.
- "keep 2": any rated cat meal within the week lowers.

**Found and filed:**
- CUL-1676: photoless incident insert. Built here.
- CUL-1677: profile time zone, species change, and the read-in-flight race.
- CUL-1678: the functionHardening replay models REVOKE FROM PUBLIC wrongly.
- CUL-1679: `meals.event_id` is not bound to the meal's pet (an existence oracle).
- CUL-1680: a photo added through edit-event gets no read.

Time alone and unsynced rows are commented on CUL-1629; only the render can check them.

**Residual.** Two things still make the PR-27f render unsafe without its own checks: an unread photo added through edit-event (CUL-1680), and the clock and unsynced rows (CUL-1629's re-check). 089 also lowers a photographed vomit's neighbours before the server's own re-check, and that can cost a TRUE the server would have kept. That was accepted as the safe side.

## Teach

**D3 — Reading a test: what it proves and what it cannot (L1)**

*In plain words.* A test is a little experiment: set something up, do one thing, check the result. A passing test only tells you something if the result could have come out the other way. If the setup already produced the answer before the "do one thing" step, the test passes every time, whether the code works or not.

*Everyday analogy.* You're checking that a new smoke alarm goes off when you burn toast. But the alarm was already ringing before you started the toaster. "It's ringing" proves nothing about the toast.

*From today's work,* the probe's fix:
```python
vac = [e for e, exp in checks if e != 'ERROR' and exp == 'null' and run(mw(e))[1] != 'true']
if vac: print('VACUOUS', name, vac); fails += 1; continue
```
Before running the owner's write, this asks whether the "leave to wait" is still switched on. The test expects that write to switch it off. Twice today it was already off: the setup itself had logged a meal or a vomit, and the new trigger had fired during the setup. Those tests were green for the wrong reason. This line now fails them instead.

*Check:* a test logs a lethargy and then checks that the "leave to wait" reads off. What one thing would you look at to be sure the lethargy, and not something earlier, is what switched it off?
