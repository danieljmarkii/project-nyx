# Vet review skipped, CUL-1432 split, and CUL-1509: a held re-read clears the stale error

**Date:** 2026-10-03
**One thing (re-ask):** G1 L1 — A commit is a saved snapshot · check: pending
**One thing:** T5 L1 — Edge Functions: server code for what the phone must not do · check: pending

Shipped via #1012.

## What happened

A Linear-hygiene session that turned into one build.

**CUL-1312 canceled (PM, 2026-10-02).** The PM chose to skip the paid real-vet review that E-6 (amended) required before Engines v3 Wave 4 goes live. I canceled the issue, removed its 16 related links and the `Waiting on PM` label, and took its gate out of CUL-1407 (retitled), CUL-1436 and CUL-1435. Then, at the PM's word, I dropped option (c) ("a known limit for the vet review") from CUL-1408. The rest of E-6 stands: a change that makes the app speak up less still needs harness proof and PM sign-off. Only the real-vet step is gone.

**CUL-1408 was already built.** The PM ruled (a) and asked to build it. The code showed it shipped on 2026-09-29 in #980: `needsEn7Recheck` in `lib/stoolForm.ts`, called from `StoolAnalysisSection.handleSaveEdits`, the only stool-edit path. A 9/29 dispatch pass had reopened it on the belief that #980 only *found* the gap. I closed it Done and removed its block on CUL-1407. Nothing was built for it. The lesson for the next session: check the code before planning, even when the issue says In Progress.

**CUL-1432 split into eight sub-issues** (CUL-1509 … CUL-1516, one per future PR, CUL-1397). Each item was checked against `main` first; none had shipped. Two notes worth carrying:
- PR-28's floor (`lib/incidentFloor.ts`, #992) now unblocks items 1–3 (CUL-1510).
- Item 6 (CUL-1513) is circular with CUL-1407. The proposed way out is to store the go-live date in the switch's own config row.
- No issue existed for PR-30, so it is CUL-1511.

**CUL-1509 built (this PR).**
- **Server** (`supabase/functions/_shared/incident-analysis.ts`):
  - `StoredAnalysis.errored`, and `error` in the stored-row select.
  - A hold over a row with an error writes `{ error: null }`, only when the run read every photo (`readComplete`, required).
  - A floor-only run never writes the error-only shape (`floorOnly`, required, on `buildFailureWrite`).
- **Client:** both incident sections render `heldCallDisclosureOf(row)` again, with the "From the earlier read" heading. Dark behind `engines_v3_en3`.
- **Production check (read-only):** 0 stamped rows, 0 finished calls carrying an error, the key unseeded. No backfill.

## The adversarial pass

`adversarial-reviewer` (isolated) returned BREAKS, narrowly. The call itself was never lowered, hidden or altered; every finding was about whether the disclosure tells the truth.

- **MEDIUM, fixed.** A floor-only or refloor run that throws wrote the error-only shape over a call. That put "The latest read hit a problem" and "From the earlier read" over a photo read that finished, and no later non-raising floor run cleared it. This PR is what would have made that visible, so it fixed it.
- **LOW-MED, fixed.** A hold over an unreadable replaced photo, or a collapsed partial read, cleared a true line.
- **LOW, filed as CUL-1523.** A sibling Ask A8 run's newer error can be wiped by the hold's clear (the fix is a compare-and-set).
- **INFO, filed as CUL-1524.** Ask A8 relays "ran" after a live read that failed over a call.
- **Kept as is.** A floor raise clears a photo error (the existing shape; the words are louder). The hold moving `updated_at` may re-announce the call (unverified, not calmer).

**Mutation proofs, all red:**
- dropping `error` from the select;
- reverting the hold clear;
- ignoring `readComplete` in the decider, and at the call site;
- ignoring `floorOnly`;
- re-nulling the client wiring.

**Final run:** Jest 13,351 passed / 601 suites, Deno 2,362 passed, `tsc`, lint and `deno check` clean, CI green on `0667c19`.

## Residuals

- CUL-1523 and CUL-1524, above.
- The partial-read-collapse half of `readComplete` is proven at the decider and by reading the call site, not by its own pipeline mutation. The unreadable half has one.
- The lines still go to no owner until CUL-1407 seeds `engines_v3_en3`, which now waits on the rest of CUL-1432 (CUL-1510 … CUL-1516).
