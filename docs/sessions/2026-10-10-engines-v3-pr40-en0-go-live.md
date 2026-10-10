# Engines v3 PR-40 — EN-0 goes live for every account

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1144 (CUL-1726). Dispatched by `/dispatch`, BUILD mode, on `claude/engines-v3-pr40-10092356`. Plan-gated. The plan was posted on CUL-1726 and the PM typed `apply 096` in session.

## What shipped

- **Migration 096** (`096_engines_v3_en0_go_live.sql`) sets `enabled: true` on `engines_v3_en0`.
  - It is a `jsonb_set` on the one key, so the live allowlist (the PM's uid) is untouched and never enters git, per 075's rule.
  - It raises unless exactly one object row changed. The flag fails closed, so a silent no-op would be a go-live that never happened.
- **Applied 2026-10-10 11:34Z** through the Supabase MCP.
  - Pre-flight read `enabled: false` with the PM's uid alone.
  - Read back `enabled: true`, allowlist intact.
  - Advisors showed only pre-existing findings, none on `app_config`.
- **No code change.** analyze-vomit already resolves the key per owner on every request, with no cache.

## The proof, re-run on main

`incidentReplay.deno.ts` over the PM's Nyx, export run unchanged (Deno 2.9.4, CI's pin):

- **EN-0 lost escalations: 0 over 46 reads.** EN-0 adds a flag on 3, the same 3 as PR-13a.
- **Fidelity: shipped-rule mismatches 1 as committed.** Bisected:
  - The same export over PR-13a's merge commit `4daa7c1` gives the same 1, so the code did not drift.
  - No meal or event in the window was created, deleted or edited after 9/29.
  - Cause: the replay times a read by `updated_at`, and 085/086's backfill (10/07 16:41Z) moved it on 6 pre-EN-0 rows. The shipped rule was therefore replayed 11 days after the vomit, where its read-time windows no longer hold the evidence.
  - With those 6 rows read at `created_at` (a scratch copy, never committed): mismatches 0, EN-0 lost 0, EN-0 adds 3.
  - Filed as CUL-1730 (Wave 7).
- Deno suites `en0Union`, `analyze-vomit/` and `engineFlags`: 118 passed.

## Falsification attempts

- **Has main drifted since PR-13a so EN-0 now drops a warning?** Replay on current main: 0 lost over 46. Held.
- **Does the one fidelity mismatch hide an engine change?** Same count on the PR-13a commit, no record change in the window, and the mismatch is gone once the read times are right. Held: it is the tool, not the engine.
- **Could flipping the key cost an owner a stand-down?** en0 is not in `SIGNAL_ENGINE_KEYS`, so `standDownMintAllowed` never compares it. Held.
- **Does any other surface act on en0?** No client code keys on it. EN-7's stool intake arm reads it but acts only with `engines_v3_en3`, which is unseeded and off. Held.

## What owners newly see (new vomit reads only)

1. A cat's intake warning states the record instead of "hasn't eaten a full meal recently".
2. A photo finding leads when visual and context flags both fire.
3. Windows are anchored on the vomit, which can add a worth_a_call and never removes one.
4. Reads carry the stamp `engine_flags: ["engines_v3_en0"]`.

Stored reads keep their words; CUL-1406 owns those.

## Residuals

- CUL-1730: the replay's read-time rule. Until it lands, every replay reports the 1 false mismatch over these rows.
- Rollback is one `jsonb_set` back to `false`. Reads written while on keep their words and stamp.
