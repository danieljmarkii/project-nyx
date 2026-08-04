# Medication history PR 4 — the past-meds block on the vet-visit rundown

**Date:** 2026-08-04 · **shipped via #589** (draft)

## What shipped

**PR 4 of the B-140 (extended) track — the third of the three in-app surfaces reads the shared course derivation.** The vet-visit rundown (A6) answered *"what's she on now?"* (the existing "Current meds" tiles) but not *"what has she been on?"* — the clinician's other opening question. This adds a **"Medications — past 12 months"** block.

1. **`lib/rundown.ts`** — three local-mirror reads (`readAllRegimens` = every status, not just `active`; `readAllDoses` = the whole non-deleted dose history as `AttributableDose[]`; `readMedicationItemNames` = the drug cache), folded into `deriveMedicationCourses` (PR 1), then `buildPastMedications` turns the derived courses into rundown rows. Pure helpers: `medHistoryCutoffMs`/`courseRecencyMs`/`splitPastCourses` (the window split), `formatMedDate`/`formatMedDateRange` (the day-key formatters), `pastMedTileValue`/`pastMedEndDetail`/`pastMedCourseTile`/`earlierCoursesTile` (the copy). New `pastMedications: RundownTile[]` on `Rundown`; `rundownToPlainText` delineates the section under its own heading.
2. **`app/rundown.tsx`** — renders the block as its own labelled `Card` after the main tile card (a card = a section). Regimen courses tap to `/medication/[id]` (where PR 3 will render past-course facts); dose-derived (ad-hoc) courses tap to History.

## The design decisions worth recording

- **The block is a SEPARATE `pastMedications` array + card, not appended to `tiles`.** Keeps the current-meds block (which still reads `readActiveRegimens`, unchanged) fully intact — zero regression risk to the shipped rundown — and gives the past its own heading in both the screen and the plain-text export. The two med reads answer different questions (current-block *display* vs the full *course model*), so the minor double-read of active regimens is deliberate; unifying them would change the current block's ordering (`started_at DESC` → last-dose recency), out of scope for PR 4.
- **Two row shapes, per the mock §04.** An *ended* course leads with its window (`start – end · N days · N doses`) — a defined course a vet places on a timeline. A *no-end* course leads with the dose count (`N doses · span`) — "what was logged", since there is no formal window. The register (`Ended {date}` / `No end recorded`) is the `detail` line, not a pill (the rundown tile model has no pill; the shared `RundownTileRow` renders label→value→detail→chevron).
- **The count is `dosesTowardTarget`, phrased plainly as "N doses" (H4).** The mock's "26 doses logged" wording is loose — `dosesLogged` is therapy *delivered* (given+partial), not raw logged rows — so the copy drops "logged" to stay honest while showing the same number every other surface shows. The rundown deliberately does **not** pair it with `plannedDoses` ("of 28"), which sidesteps the PR-1 coherence caution (an ended course's count can post-date `ended_at` via an authoritative B-153 link, so a count-vs-planned pairing is PR 5's problem, not the rundown's).
- **No empty state for "no past meds".** The section simply doesn't render when a pet has no ended/past courses — an absent history is silence, not a finding, and the current-meds tile already answers "on anything now?". Flagged in the PR for PM review in case a designed empty state is wanted.

## D3 — PROVISIONAL, flagged for PM confirmation

The window is **past 12 months shown by name, earlier courses folded behind a count** ("N earlier courses, over a year ago") — a non-tappable disclosure row. Taken per the CLAUDE.md provisional-decision protocol so the build could proceed; the mock/spec left the window an explicit PM/Dr. Chen call. The rationale: the fold keeps the list speakable for Sam's chronic-med cat while the *profile* "Past medications" section (PR 2) and the *report* table (PR 5) carry the full named lifetime, so nothing is lost — only relocated off the quick-answer surface. The window is a single constant (`RUNDOWN_MED_HISTORY_MONTHS = 12`) feeding the label, the cutoff, and the export, so a PM change moves all three together.

## Clinical-guardrails + nyx-voice

- **H1 (the load-bearing rule): an ending renders only from an owner action.** `pastMedEndDetail` says `Ended {date}` **only** for `end.kind === 'ended'` (which the derivation constructs only from `status ∈ {completed, stopped}`); everything else is `No end recorded` — never "completed"/"ongoing"/a wellness word. A history view that promoted silence into an ending would fabricate a clinical fact (the B-422 stale-active lesson). Test-asserted, incl. a negative regex against `complete|ongoing|active|fine|well`.
- **Never-reassure (clinical-guardrails Pattern 8 — the invariant is a test).** The `buildRundown` reassurance scan now iterates `[...tiles, ...pastMedications]`, so the block's copy is held to the same no-reassurance / no-`!` bar as the rest of the rundown.
- **nyx-voice:** no exclamation, specific (dates + counts), plain language ("Ended", "No end recorded", "N doses", "N days").

## Verification

`tsc --noEmit` clean · **full jest 4339/4339** (197 suites; +27 new rundown cases covering the helpers, the split, the copy, and an end-to-end `buildRundown` past-meds case) · green under the non-UTC CI zones **UTC+14 / +12:45 / −10** and **UTC−11** (B-514). **Offline verified by construction:** every input is a `getDb()` local read, the derivation is pure, no Supabase/network on the path; the screen's existing error posture (no silent failure, no fabricated empty) covers a read failure.

## Code review — fix-before-merge, addressed

`code-reviewer` on the diff returned one **fix-before-merge BUG** + two cleanups, all fixed in a follow-up commit:

- **BUG (B-441 trap):** `courseRecencyMs` ran `Date.parse()` on the bare `'YYYY-MM-DD'` end/start fields (→ **UTC** midnight) but compared them against the **local**-wall-clock `medHistoryCutoffMs`, so a course within a day of the 12-month boundary folded a cycle early for owners **behind UTC** — the reviewer reproduced it under `Pacific/Pago_Pago` (UTC−11). The reviewer's tell: `formatMedDate` two functions down already did it right. Fixed — the DATE tiers now bucket to local midnight via `dayKeyToLocalDate` (`Date.parse` kept only for the real `lastDoseIso` instant). The old test "passed" only because both sides used the same UTC-midnight basis; the assertion is now zone-honest (local midnight) and green under UTC−11.
- **CLEANUP (B-616):** `formatMedDate` was a near-fork of `lib/utils.formatCalendarDate`; it now delegates to it (and `formatMedDateRange`'s endpoints route through it too), so there is one answer to "what a bare calendar day looks like".
- **NIT:** a cross-**year** range now carries both years ("Dec 30, 2025 – Jan 2, 2026") so it can't read as one year or a span running backwards.
- Acknowledged non-blocking: the `setMonth(-12)` Feb-29 leap-day overflow (a 1-day cutoff shift only when the device "today" is literally Feb 29) — left as-is; D3's window is provisional and the effect is a boundary course shown-vs-folded, never a safety-tier miss.

The reviewer confirmed H1 (type-enforced — "Ended" only reachable via `end.kind==='ended'`), H4 (single `dosesLogged` predicate), the offline path (all reads via `getDb()`, SQL columns verified against the live local schema), and the split (every non-active regimen course is `ended` by the 3-value status enum, so no course falls through unclassified and none is duplicated).

## Residuals / next

- **D3 awaits PM confirmation** (the one open call this PR raises).
- **B-688** (per-med History lens) remains the future exactness for a dose-derived course's tap — v1 lands on History's Medication *type* lens, an acceptable landing.
- PRs 2/3 (profile Past-medications section / detail past-course facts) remain unblocked and parallel-safe. PR 5 (report lifetime table) stays D2-gated and rides the B-494 `generate-report` redeploy.
