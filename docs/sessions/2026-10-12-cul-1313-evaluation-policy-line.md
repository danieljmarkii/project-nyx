# CUL-1313: the policy line on evaluating the engines, and the D18 gates

**Date:** 2026-10-12

**Issues:** CUL-1313 (PR-12 of *App Store 1.2.0 · the first public release*), CUL-1904 (Engines v3). Shipped via the PR this record rides in.

## What happened

D18 (PM, 2026-10-12, via CUL-1825) shrank CUL-1313 from "write an evaluation purpose into 1.2.0's consent" to one policy statement: owners' records are not used to evaluate the engines until a separate opt in exists. The session drafted it, the `rls-privacy-reviewer` tried to prove it false against the code (verdict: holds with wording fixes, all applied), `nyx-voice` passed it, and the PM approved option (a), all four sentences including the support look.

The PM then asked for the changes to land in this session rather than wait, so the PR carries:

- **`docs/legal/privacy-policy.md` §2:** the approved four sentences after the "train AI models" line. The repo copy only; the published page still updates through PR-41 (CUL-200), which has the wording in a comment. The edit sits in a paragraph #1184 (CUL-1769) does not touch, so the PR-01 → PR-04 → PR-40 → PR-41 order on this file is not disturbed.
- **CUL-1904, the gates re-keyed to D18:** `scripts/engine-replay/` (`evaluationSubjects.ts`, `subject.ts`'s refusal, `README.md`, `export.sql`'s comment) and `docs/nyx-care-state-requirements.md` v1.4 (§0.1 row, §6.6, run-order row 36) now say another owner's record opens only through that owner's yes to a separate opt in, never through a policy edit. Migration 075's header comment says the old unlock; it is applied, so it stays, and the spec row records that it is superseded. `export.sql`'s pin drops whole-line comments, so the pin hash is unchanged.

## Review findings worth keeping

- The replay's allowlist is followed, never enforced (`execute_sql` is the service role). The policy says "we do not", which is true; "cannot" would not be.
- The EN-14 follow-up answers are collected on every account and used only on the PM's. Nothing aggregates them.
- Launch counts (CUL-1854) must count activity, never warnings fired or their accuracy; noted on that issue.

## Checks

`jest scripts/engine-replay` 48/48 (the refusal test still pins `PMD-12`, kept in the message), `tsc --noEmit` clean, `npm test -- guards` 1237/1237.
