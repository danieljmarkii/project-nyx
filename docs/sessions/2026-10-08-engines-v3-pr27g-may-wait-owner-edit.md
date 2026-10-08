# Engines v3 PR-27g: an owner edit takes back the leave to wait (migration 088)

**Date:** 2026-10-08
**One thing:** T4 L1 — RLS: the database refuses rows that are not yours, so code running as the owner can only reach the owner's rows · check: pending

Dispatched build of CUL-1668, shipped via #1115. The PM typed `apply 088` twice: the second time was for the revised file, after the adversarial fixes. 088 was applied to production at 2026-10-08 ~14:45Z, after a byte-for-byte MATCH of the live freeze body against 087's.

**What shipped.**
- The freeze (`freeze_event_ai_analysis_stamps`) now covers `ai_raw_payload` and `visual_flags` (the PM's ruling A).
- It opens one lower-only client transition on `may_wait`: TRUE → NULL.
- A new INVOKER function, `take_back_may_wait_on_owner_edit()`, on a BEFORE and an AFTER trigger, lowers a TRUE when a client UPDATE moves `edited_at` or any unfrozen column the server predicate reads. It lowers on the row and on every TRUE of the same pet within ±72 h (`FLOOR_READ_HOURS`, mirrored).
- "Same pet" is either row's analysis or event pet. When the edited event can't be read, it lowers every TRUE on the pet (fail closed).

**Proof.**
- `guards/incidentReadFreeze.test.ts` pins every rule. One of them is derived from the predicate's source: every column `incidentMayWait.ts` reads is frozen or in the edit set.
- 18 migration mutants and 1 predicate mutant all go red.
- A scratch Postgres 16 probe ran 16 cases. It showed both gaps on 087 alone, and closed on 088.

**Reviews.**
- `rls-privacy-reviewer`: PASS on every cross-tenant and forgery attack.
- `adversarial-reviewer`: FAIL on the first draft. A moved neighbour on the other pet was missed (CUL-882's direction 2), and four unfrozen verdict columns fired nothing. Both were fixed in commit e16f9d8 and re-proven.

**Found and filed.**
- CUL-1671 (high, Waiting on PM): changes on the events side leave a TRUE with no re-decide path. These are lethargy logged later, a cat meal rating, and re-dating or moving an event. `runRefloor` has no caller. Its decision brief recommends a lower-only server trigger in 088's shape, blocking PR-27f.
- CUL-1672 (low): a client can clear `edited_at` on its own read.

**Residual.** The PR-27f render stays unsafe until CUL-1671 is ruled and built. 088 closes the analysis-row half only.

## Teach

**T4 — RLS: the database refuses rows that are not yours (L1)**

*In plain words.* Row Level Security is a rule written into the database itself: "a person may only see or change rows for pets they own." It is checked on every read and every write, whoever asks. So a buggy app, or a hand-crafted request, still can't reach another owner's rows. The database says no before any app code gets a vote.

*Everyday analogy.* A hotel key card. The front desk (the app) might be confused about which room you're in. The door lock (RLS) still only opens for your card.

*From today's diff,* `supabase/migrations/088_may_wait_owner_edit.sql`:
```sql
  UPDATE public.event_ai_analysis a
     SET may_wait = NULL
   WHERE a.may_wait IS TRUE
```
This sweep has no "only this owner's rows" clause about users at all, and it doesn't need one. The function runs *as the owner who made the edit* (INVOKER), so RLS silently narrows "every TRUE" to "every TRUE you own." That is why the privacy reviewer's attack, owner A trying to lower owner B's read, matched 0 rows. The other choice, a DEFINER function running with the database's own master rights, would have skipped RLS. Then the code would have had to prove the scoping by hand.

*Check:* if we had made this function SECURITY DEFINER instead, what single thing would have stopped owner A's edit from lowering owner B's readings?
