# Engines v3 PR-22a: the Signal and Ask dose reads name their FK, fail loudly, and are guarded

**Date:** 2026-09-29

Shipped via #983 (CUL-1099, a Signals v2 issue sequenced as Engines v3 PR-22a).

## What happened

Since migration 023 (June) gave `medication_administrations` a second FK to `events` (`paired_event_id`), the dose pulls in `generate-signal` and `ask` have embedded `medication_administrations(...)` without naming the FK. The live API answered PGRST201 on every call, and `readDosesAsToday` (added by CUL-989 as a stopgap) read that error as "no doses". Both functions have run with zero doses for every pet since June.

- Both pulls now name `medication_administrations_event_id_fkey`. `readDosesAsToday` and `isAmbiguousEmbed` are deleted, so a failed dose read throws like every other pull, and `guards/reportPullPagination.test.ts` lost its one exemption.
- New `guards/medAdminEmbedHint.test.ts` fails the build on an unhinted `events` ↔ `medication_administrations` embed, in either direction, across the repo. It carries fixture tests and a non-vacuity floor (two independent counts that must agree), and was proven by mutation: stripping the hint from `ask`, and turning profile's hint into `events!inner(`, both reddened it. Its first run caught its own gap: the text count also matched an assertion string in a test file, so both counts now exclude test files.

## The adversarial pass decided the shape

The mandatory `adversarial-reviewer` pass returned GATE BEHIND FLAG for the Signal:

- **Vehicle attribution** can suppress a true correlate (a pill pocket that is the allergen) and can add one (pocket exposures leave both arms and clustered dinners fire).
- **Confounder windows** can withdraw the whole vomit lane: an as-needed antiemetic given after each vomit is case-enriched (reverse causation). A daily dose caps Established at Early.
- **The med-on-board line** is new owner-visible output.
- Held: missed and refused doses are not on board, and the chronicity stand-down cannot be moved by doses.

**Ask** only gains record facts, so it ships unflagged.

The house gate is a registered Signal key, and that trips guard (c) in `_shared/engineCorpus/signalPipeline.test.ts`, which the concurrent PR-14d owned. So the Signal reads the pull and hands the pipeline `doseEvents: []` under `SIGNAL_DOSE_LANES_ON = false`. The dose pull also stays out of `incompletePulls` while unread. Signal output is byte-identical to production. CUL-1425 turns the lanes on behind a registered Engines key, gated in the pipeline, and carries the two findings that must be ruled before anyone is allowlisted.

Note for later: the vet report has always read doses with the hint, so the Signal and the report disagree for every medicated pet until CUL-1425 ships.

## Checks

- `tsc --noEmit` clean.
- Full jest passes.
- `deno test supabase/functions/`: 2206 passed.
- `deno check` clean.
- CI green on #983.
