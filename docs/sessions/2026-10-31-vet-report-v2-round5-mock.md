# Vet report v2 PR-04: round 5, the build-ready mock

**Date:** 2026-10-31
**One thing:** none — dispatched session, not this round's teach row

Dispatched DISCOVERY row VR2-4 ([CUL-2285](https://linear.app/projectnyx/issue/CUL-2285)). A mock, a fixture manifest and a CSS fix; no app or Edge Function code. Shipped via #1369. Merged on the PM's `/wrap and merge`, with the two QUIET design residuals left blocking their own build rows.

## What shipped

- **Round 5 at the top of `docs/culprit-vet-report-v3-mockups.html`**, under the build-ready contract (CUL-1894): the `mock-round` meta, `mockups/theme.css` beside it, `data-kit` on every element, tokens for every value. Drawn from the fixtures' numbers by a generator, so each figure traces to its record:
  - sheet 1 on Nyx's live record (five-flag band with the dated photo, R-10's "left out" variant, vomiting leading with coughing and sneezing on one count scale, five intervention spans, confounder line, record and gap lines, colophon; 201 cuttable words against ruling B's ~200);
  - Cooper's R-11 flagged lead chart; Juniper's 4-day thin record (ruling T); Olive's zero-sign window; Bean's free-fed line; Mira with the AI lead on, failed and declined;
  - the flow b1 to e2 redrawn from the reflow (BRK-1); the state set (building, failed, offline, AI pending, declined and failed, no entries, new account, two pets, 320 pt, AX5, VoiceOver order);
  - a browser-driven motion demo of spec §14 with a Reduce Motion toggle, beats read from `components/motion/` constants.
- **Harness fix (MFU-1):** `.flowx .sheet` resets the print rule's `aspect-ratio`, `overflow` and `container-type`; round 4's bottom sheets stop clipping.
- **Left the page:** round 4's flow (§07), its frame captions, §10, and §11's open briefs (the R-8 switch among them). Round 4's Cooper and Mira sheets, §05, §06, §08 and §09 stay as the drawn reference.
- **`docs/vet-report-v3-discovery/fixtures/canonical-fixtures.json`:** 13 named fixtures for the mock and every v2 test; each unbuilt one names the row that builds it (VR2-9, 12, 13).
- Artifact republished to the same URL (owner-only).

## Reviews

Two `vet-report-cold-read` passes on the rendered sheets. Pass 1 (NOT READY) caught drawing errors, all fixed: a burden line whose date range contradicted "3 days in a row"; episodes vs entries unexplained; a Sep 22 photo stamped in UTC (6:30) instead of Chicago (1:30 am); Cooper's confounder line missing the four off-list chicken feedings; Olive's date axis offset by the label column; Olive's "Slept more" beside an activity word v1 never lists on page 1; a record-edge distance off by one. Pass 2 (the last allowed): Nyx and Juniper CLINIC-READY with every count and axis reconciled; Cooper's top holds; Olive NOT READY (a duplicated absence sentence, fixed; a senior cat's soft changes listed flatly under "no symptoms", stopgap drawn and filed as CUL-2323).

## Filed

- [CUL-2320](https://linear.app/projectnyx/issue/CUL-2320) (QUIET, dark, Waiting on PM): a five-flag band pushes the phone chart to the fold and splits it from its confounder line; spec §6.2's "above the fold" cannot hold. Blocks the reflow and exam-room rows.
- [CUL-2323](https://linear.app/projectnyx/issue/CUL-2323) (QUIET, dark, Waiting on PM): a zero-sign window reads calm while Noticed concerns and unfinished meals build. Blocks the sheet 1 renderer and the predicates.
- [CUL-2321](https://linear.app/projectnyx/issue/CUL-2321), [CUL-2322](https://linear.app/projectnyx/issue/CUL-2322): parked (the AI label's source wording; how "N days before this report" counts).

**Learning:** draw from the fixture's own numbers and convert its UTC timestamps in the pet's zone before a cold read sees them; the first pass caught a photo stamped 6:30 that happened at 1:30 am.
