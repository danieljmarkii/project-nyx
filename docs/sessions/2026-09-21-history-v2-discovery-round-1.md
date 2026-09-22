# History v2 — discovery round 1: the interviews and the mock page

**Date:** 2026-09-21 (ended 2026-09-22 UTC) · **Issue:** CUL-1076 (project *Design v2 — the whole day*) · **Mode:** DISCOVERY · **Shipped via** the draft PR on `claude/design-v2-history-tab-ikxfm4` (number recorded below once assigned)

**PM prompt:** get up to speed on *Design v2 — the whole day*, then "let's focus on the History tab": six observations (the tap-to-expand feels weird; a boring list; include it in the design program; the filters are a work of art, keep them; are we leaning into the AI and is Claude returning more than we show; could notes feed other areas), "interview and follow a similar ideation process as used in the Linear project", end game "a round of mockups and options for the future of this screen(s)", "a solid swing".

## Where Design v2 stood when this started

Steps 1–2 merged (the toggle + the FAB, the chart family, the Signal card + screen, Home on a real day, Patterns' month, the waits); step 3 in flight (D2-6 the flight in review; D2-9 the PM's device pass pending on the dev client); step 4 (GA) unstarted; CUL-1073 (History's UTC day vs the month's local day), CUL-1074 (six D2-5 briefs, Waiting on PM) and CUL-1075 (D2-7b) filed since. History was the one daily-open surface still on the pre-v2 list language.

## The process, as the PM asked

The CUL-1060 shape, applied to one surface: an **inventory** first (the shipped screen and its five doorways; what `event_ai_analysis` stores against what each surface renders — two Explore reads; where every note column is written and read, and the rules that bind them), a **record pull** (Nyx's 1,091 events over 130 days as counts, times and types; the fortnight Sep 4–21 in Central; per-window per-type counts for the filter sheets — note text never read), then **six isolated persona interviews** (the owners; Dr. Chen; Data Scientist + Data Visualization Designer; Motion Designer + Mobile IA; Trust & Safety + Product Owner; Dir. of Engineering + QA), each with only the inventory brief, the code and the specs, each returning a job statement, keep/change/kill, the AI and notes answers, a sketch, vetoes, a lean and one falsification. Then the page.

**Every lean was go-with-conditions, and the six converged on one shape:** days at local midnight in the spine's language; one door per row (Edit and Remove on the record; the expand state, the long-press and any swipe gone); a day header that counts kinds only, on closed days only (page by whole local day on a keyset); the unlogged day drawn as a row and a week away as one line; compaction stricter than Home's; the two pills kept verbatim and the sheets extended (months, since the trial, since the last visit, All symptoms, a count on every row and on a non-default pill, a third pill only as a fact lens, never a lens over a read's verdict); the read on a row as one word only, never observations, sentence, thumbnail, flag text or confidence; notes as a glyph and a local search, never counted or summarised, never into the Signal.

**They split on four things, surfaced under the Conflict Protocol and drawn side by side:** the calm verdict word on a list (the owners: on every read; Dr. Chen: the rose only under a symptom lens, the standing line once; recommended the reconciliation by scale); the note's first line on the row (Jordan vs Sam + T&S; recommended the glyph); the order inside a day (Motion: down = later; IA: newest first; drawn chronological, asked); where it ships (PO: its own flag and project after CUL-1073, off the step-3 device pass; Eng: behind `design_v2`; recommended the PO's). Plus T&S's gate: the verdict column sequences after the App Store photo-analysis consent gate (CUL-552).

## What shipped

`docs/culprit-history-v2-mockups.html` — published as the round-1 artifact (https://claude.ai/artifact/RNvdtUG6FX5utWmzGqBNa6; later rounds republish over it): §00 the as-built frame drawn from the code with what each read named; §01 the job and the eight agreements; §02 the proposal on the real fortnight (the wait, the read arriving on a row, a compact node opening in place, the route to the record and back, the Vomit lens since the trial started with the lens count, the lensed gaps and the standing line); §03 one row of every kind and the read's five states; §04 the four decisions, each option drawn (the calm word; the note; the order; the week strip and the standing-facts strip as options, not the proposal); §05 the filters kept and extended (the three sheets with the record's counts, search, the doorway contract table); §06 the AI field × surface table; §07 the notes truth table and the disclosure cue; §08 the six reads and the four conflicts; §09 the five-column check on every number History speaks and the nine §0 rules a build would carry; §10 four questions and five briefs (R1-1 … R1-5); §11 what a go would file (PR 0–5 with sizes and gates, absorbed and sequenced issues, the Tier-2 edits, the fixtures).

Every frame draws from one fixture (the record's fortnight) through one renderer, so the options are the same days under different rules rather than hand-drawn variants. Every demo was driven in headless Chromium over CDP (`scratchpad/verify.mjs`, the round 2–4 harness rebuilt over the repo's `ws` since puppeteer is not installed), pressed twice, a computed style sampled mid-transition and settled: 58 probes, zero page errors, no horizontal scroll at 1180 or 400.

## What broke, and the lesson

**A lens changed a row's fact.** The one look at the render caught what the harness could not: under the Vomit lens the Sep 21 vomit read "6 h or more after eating" where the All-types frame said "5 min", because the day's meals were filtered out before the timing line was computed and the rule fell through to the previous day's last meal. The fix computes every row's facts over the whole day and filters only what is displayed; the harness gained the probe. It is the C-35 lesson in miniature — a predicate inherits its caller's window — and it is written into the page's §09 rules for the build (a lens is a lens over rows, never over the facts a row is computed from). Four smaller catches from the same look: a day header wrapping its date (the date never wraps; the count line does), a pill label clipping (the IA's ladder — pills never ellipsize, they take their own row), the search view drawing "nothing logged" over days that merely had no match, a bare card walking the empty days above it. Two harness "failures" were probe bugs (the wrong node, the wrong element), fixed before the page changed.

## Out-of-scope, filed

- **CUL-1078** — History's offset pagination drops a row after every Remove and can skip a same-minute pair across a page seam (no id tiebreak). A shipped defect the Engineering read found; absorbed by History v2's PR 1 if that goes.
- **CUL-1079** — Promote a note into a record (Jordan's "Mom gave him cheese"): a capture idea, not History's.

## Persona sign-off

Designer ✓ (the seven principles; 1, 3, 5 on the frames; the voice pass on every string) — Data Scientist ✓ (every number named with its population; the closed-day rule; the lens-over-facts rule) — Dr. Chen ✓ (the read as one word; the dismissed worth-a-call falsification carried as a build condition) — Jordan + Sam ✓ — Motion + IA ✓ (three motions, the fold economics at 390pt) — T&S + PO ✓ (no photo on a list; the consent-gate sequencing; the doorway contract) — Dir. of Eng + QA ✓ (the plan in §11). Adversarial review: N/A for a mock page; the clinical rules it draws under are the shipped ones. Tests: N/A — a design page; the browser harness is the verification.

## PM actions

All on CUL-1076 (`Waiting on PM`): react to the frames; rule R1-1 (the shape), R1-2 (the calm word), R1-3 (the note), R1-4 (where it ships), R1-5 (the read vs the consent gate); answer Q1–Q4 (the order inside a day; the week strip; the standing-facts strip; search over the look's note).
