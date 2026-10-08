# Engines v3 PR-27c: the "may wait" column on a per-incident read

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched by `/dispatch` (Engines v3), CUL-1627, the first of three PRs under the PM's ruling A on CUL-1611 (the server decides whether a call-today read may say "first thing tomorrow"). Plan posted on the issue, PM go typed in session. Shipped via #1103 as a draft, left for the PM: it holds migration 087, which waits on the PM's typed `apply 087`.

## What shipped

- `supabase/migrations/087_incident_may_wait.sql`: `event_ai_analysis.may_wait BOOLEAN`, nullable, no default, no backfill. Only `TRUE` grants leave to wait. `FALSE` (checked and refused) and `NULL` (no fact written, which covers every existing row) both keep the louder line. Readers gate on `tier = 'call_today' AND may_wait IS TRUE`.
- The column joins the server-only freeze. `freeze_event_ai_analysis_stamps()` is 086's body verbatim plus one line, so RLS alone can no longer let an owner set `TRUE` on their own row.
- `guards/incidentReadFreeze.test.ts` registers `may_wait`. Proven by mutation: with the body line deleted, the guard went red (`the last freeze body refuses a client change to may_wait`). Restored, it went green.

## Decisions

- **A boolean, not the line's class.** The words stay in the client's tier map; the server stores only the fact it decided.
- **No CHECK pairing it with `tier`.** A re-read escalating to call_now over a stale `TRUE` would fail with 23514 and lose the escalation write (079's reasoning, C-38). The backstop is readers' two-column gate. The writer contract, that every write of `tier` also writes `may_wait`, is posted on CUL-1628 (PR-27e).

## Reviews

- `rls-privacy-reviewer`: **PASS**. It tried client INSERT, upsert and PATCH of `may_wait = TRUE`, and the DEFINER refresh path (085/086) driven by a client meal edit. INSERT is revoked (074), UPDATE is frozen (087 §2), and no DEFINER writer names the column. The rollback order (body first, then `DROP COLUMN`, one transaction) is correct.
- Adversarial (clinical): N/A. No logic decides anything here; the predicate is PR-27e's, which carries `Gate: clinical`.

## Residual

Whether `may_wait` ever becomes `TRUE` rests entirely on PR-27e's service-role writer, which needs its own review.
