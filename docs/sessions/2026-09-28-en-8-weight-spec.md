# Engines v3 PR-18a — the weight lane's spec and frames (EN-8)

**Date:** 2026-09-28

Engines v3, Wave 2, Lane F, PR-18a (CUL-1135). Discovery: a spec and a frames page, no code, no migration. Shipped via the session's draft PR (number in the PR itself; see CUL-1135's outcome comment).

## What shipped

- **`docs/nyx-weight-lane-requirements.md` v1.0.** One pure predicate (`weightStory`) behind every weight sentence; sources from the entry path (log weigh-in = home scale, "How did it go?" = clinic, profile = estimate that never joins the history); the anchor ladder (highest confirmed reading in a 12-month window, else the earliest); one noise band shared with the safety line so the two can never render together; a row kept until the owner answers and never lowered by a reading or by time; MFU-8's four registries; the report question; the no-scale version; what EN-8 does on Nyx, per rule, written in advance; the ruling-sheet items; the PR-18 / 19 / 37 plan.
- **`docs/culprit-engines-v3-weight-mockups.html`**, round 1, published at https://claude.ai/artifact/TagYzKd662BBDPFaaSZehL. Its own current-proposal page, so PR-20's round 3 can republish the Engines v3 Home URL without a collision. Frames F1 to F12; W4, W5 and W3 drawn side by side with their alternatives.

## What the inventory found (the facts the spec rests on)

- Five weight surfaces use five anchors today: Patterns and Profile from the first of the latest 12 readings, Ask and the report from the first in the window, Get ready a min-max range, and nothing on the Signal.
- One owner surface already prints a percentage: design_v2 Patterns (`chartCopy.ts:225`). The report prints one too, which is fine: it is vet-facing and in kg.
- No vet-visit screen takes a weight. "Vet visit = clinic" needs a new optional row on "How did it go?" (W7).
- The weigh-in pre-fills the last snapshot; saved unchanged it is a copy stored as a new reading, and under PMD-9 it would confirm itself. The spec replaces it with a hint.
- Nyx's live record (read-only, scoped by pet and owner): one weigh-in, 3.73 kg on Sep 16, logged through the log 48 minutes after the visit was saved; June's 4.4 kg is in no table (the overwrite predates 072); born 2023-09-01.

## Decisions surfaced (W1 to W7, all open for the PM)

W1 estimates stay out of the history · W2 legacy readings = home scale · W3 the report gets sources and one change line, no finding · W4 Patterns loses its percentage · W5 a plain Home row for a drop on one reading · W6 planned loss only from a vet plan · W7 an optional weight row on "How did it go?". Recommendations in the spec §0 and the page §07.

## Written in advance

On Nyx today the lane says nothing. With June re-entered as a home reading: D7 as written (the louder rule, live until PMD-9 is ruled under E-6 amended) and the noise-scaled variant raise the firm row; PMD-9 stays silent for good, because a single June reading can never be confirmed. It fires under PMD-9 only if June was truly a clinic weight. Nothing is tuned on her record.

## Follow-ups

- The PM: rule W1 to W7; say where June's 4.4 kg was weighed, if known.
- CUL-583 gets the §9 items (confirmation, noise-scaled confirmation, window, juvenile, planned-loss rate, rank, species other).
- PR-18 waits on W1 and W2.
