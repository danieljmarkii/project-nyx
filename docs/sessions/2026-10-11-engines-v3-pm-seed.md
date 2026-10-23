# Engines v3 on for the PM's account: the en3 seed and the rest of the keys

**Date:** 2026-10-11
**One thing:** S2 L2 — A migration is two records of one change: the row in the database and the file in the repo, and applying SQL by hand writes only the first · check: pending

Shipped via #1193 (CUL-1407).

## What happened

- **Readiness check first.** At session start the `engines_v3_en3` row was absent, CUL-1739 was Done, CUL-1432 was held open only by CUL-1741's leftover parent link, and the runbook's installed build (1.1.0 (35), July) did not carry PR-30a (#1147), the installed-build floor named on the issue. The verdict was "not ready" (posted to the issue). The PM then installed a new 1.2.0 build cut from main after #1147.
- **Migration 101** seeds `engines_v3_en3` in 098's shape: `enabled: false`, the PM's uid resolved by email at apply time, and `live_since` = the UTC date at apply. That date is never earlier than a US local date, and a late day only hides lines briefly, because a tiered read never carries "Read under the earlier rule" (`lib/ruleSeam.ts`, `isTieredRow`). It was applied through the Supabase MCP on the PM's typed `apply 101`, verified as `false | 1 | true | 2026-10-11`, and the advisors showed nothing new. The live functions predate the CUL-552 consent hold and carry PR-26, PR-30q and PR-30a.
- **Migration 102** puts the PM's uid on en4, en8, en9 and en11 (seeded) and appends it to en5's allowlist. It raises unless every key names the PM after the write. The session's permission check blocked the commit, so the PM ran the block in the SQL Editor. Verified read-only: all eight keys name the PM, and Nyx's Signal re-ran at 22:26 UTC stamped with every key. The file was committed afterwards so the repo matches the database.

## Decisions

- **PM, 2026-10-11:** all five remaining keys go on for the PM's account. That waives three validation gates for this one account: en8 (the PMD-9 re-run), en9 (PR-16's 5% line) and en5 (the E-6 harness proof, and EN-8 live with it). The team recommended en4 and en11 only, because en9 and en5 make the app warn less. The PM ruled all five, accepting that rollback is a one-line delete and that a stored `call_now` keeps its words over a flag-off write (CUL-1516).
- `live_since` stamped at apply time, in UTC, erring late.

## Residuals

- `enabled` stays false on every key but en0. No other account and not the demo account changed.
- en5, en8 and en9's validation gates are still open for every other account.
- Two Linear cleanups still wait on the PM: unparent CUL-1741 so CUL-1432 can close, and swap CUL-1433 → CUL-1482 in PR-41's After cell.
- The supabase migration ledger records 101 (applied through the MCP) but not 102 (applied in the SQL Editor).
