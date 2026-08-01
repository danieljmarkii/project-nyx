# B-514 — TZ-fragile test fixtures, and a CI leg that keeps them honest

**Date:** 2026-08-01

Shipped via **#532** (draft). Test + CI only: no app code, no schema, no Edge Function change, no build-phase movement.

## The problem, restated

CI has only ever run at UTC. Nyx's day boundary is **local midnight** (B-421) — the trial day counter, the medication day math, the restore countdown, the vet-document date, every "today" an owner reads — so a fixture written against a UTC instant asserts *the runner's zone* as much as the behaviour, and passes for the wrong reason.

That is not a hypothetical. B-514 was filed after B-417 PR 6 shipped a genuine timezone inversion that a fully green UTC suite could not see. The suite was silently under-testing the exact axis B-421 exists to defend.

## What was fixed

The backlog row named four suites. **Seven needed fixing** — three more had grown the same fragility in the five days since the row was filed:

| Suite | Broke under |
|---|---|
| `lib/analytics.test.ts` — `getDietTrialProgress` day counts | UTC+12 and east |
| `lib/widgetSnapshot.test.ts` — the trial-day wiring | UTC+12 and east |
| `lib/widgetResolution.test.ts` — `resolveTrialContext` | UTC+12 and east |
| `lib/ask.test.ts` — `formatResetLabel → monthly` | UTC−7 and west |
| `lib/trialAllowedSet.test.ts` — the D5 date-gate | UTC+13/+14 |
| `lib/vetDocumentCapture.test.ts` — EXIF date + `document_date` | UTC+13/+14 |
| `lib/vetDocumentLibrary.test.ts` — the restore countdown | UTC+1 and east |
| `lib/feedingArrangements.test.ts` — `confirmedLabel` | UTC−10 |

One correction to the row while closing it: the `formatResetLabel` failure is in `lib/ask.test.ts`, not `constants/monetizationCopy.test.ts`.

The `trialAllowedSet` one is worth naming, because the fixture's own comment claimed the property it did not have — *"midday UTC, so the instant lands on the same local day in every zone jest might run in"*. Midday UTC is already **the next local day** at UTC+13/+14. The effect was that a mid-trial-added food read as on the trial list *the day before it was added*, which inverts the exact §5/D5 guarantee ("an add never rewrites history") the suite exists to pin. A confident, wrong comment is how these survive review.

## How they were pinned — two idioms, and why not one

The interesting decision was resisting a single blanket rewrite. The right idiom depends on **what the code under test reads**:

1. **Pass an explicit `timeZone` argument** where the helper takes one — `getDietTrialProgress(trial, now, 'UTC')`. This is B-421's own convention and the backlog row's suggestion.
2. **Build the instant from local components** — `new Date(2026, 6, 24, 20, 0)` — where the helper takes no zone. `resolveTrialContext` and `buildWidgetSnapshot` take none **by design**: the publisher runs on the device, whose own zone *is* the owner's midnight, and `widgetSnapshot.ts` says so in a comment. `widgetResolution.test.ts` had already documented this idiom at the top of the file; one test in it had simply broken its own convention.

The rule that generalises: **a local-day question needs a local-day fixture.** Threading a `timeZone` parameter through a production signature *purely so a test can pin it* would have been the wrong trade — it adds an API nobody calls and contradicts a documented decision.

## The one place neither idiom works, and what it exposed

`buildDeletedVetDocumentRow` composes one label out of two readings of the **same field**:

- the date stem, from `formatVetDocumentDate`, which reads the leading `YYYY-MM-DD` **lexically off the stored UTC text**;
- the countdown, from `daysLeftToRestore`, which indexes that value into **local calendar days** via `localDayIndexOf`.

No single instant pins both halves in every zone — local-component fixtures fix the countdown and move the stem, and UTC fixtures do the reverse. So that cluster is pinned a third way, stated in the file: **UTC literals at the same time of day.** Two instants sharing a time-of-day shift by the same offset under any zone, so the local-day *difference* the countdown reads is invariant; and the lexical stem never moves at all. The original fixture failed precisely because it mixed `11:00Z` and `23:00Z` against a `12:00Z` "now".

The underlying seam is a real (cosmetic) production inconsistency — a document deleted near local midnight renders a date the owner's phone disagrees with — filed as **B-640**, `Later`. Deliberately not fixed here: it is a production behaviour call, and B-421 says the fix direction is to index the stem locally, not to loosen the countdown.

## The CI leg

New third job, `App (jest, non-UTC timezones)`, running the full suite at **UTC+14 / UTC+12:45 / UTC−10**.

Four choices worth recording:

- **Jest only, no `tsc`.** A type check cannot depend on the clock; re-running it would buy nothing and cost a minute.
- **One job, not a matrix.** The `main` ruleset lists required checks *by name*. A matrix would put three names in it that all have to be added and kept in step; one job means one name.
- **Every zone runs even after one fails.** The useful output is *which* clocks broke — that is what names the assumption. Verified locally on both paths (green → exit 0; injected failure → all three zones still run, aggregate `::error::`, exit 1).
- **`Pacific/Chatham` is in the list because offset extremes are not a superset.** UTC+14 did *not* catch the vet-document countdown failure; the +12..+13 band did, because that is where two instants an hour apart straddle local midnight. Two of the three zones never observe DST, so the leg's verdict does not drift with the calendar. **Add a zone rather than assuming the ends cover the middle.**

Actions stay SHA-pinned, `permissions: contents: read` is unchanged, and no existing check was weakened.

## Verification

- `tsc --noEmit` clean.
- Full suite green across **15 zones**, UTC−11 → UTC+14: `UTC`, `Pacific/Kiritimati`, `Pacific/Chatham`, `Pacific/Auckland`, `Australia/Lord_Howe`, `Asia/Kathmandu`, `Asia/Kolkata`, `Europe/Berlin`, `America/Sao_Paulo`, `America/Los_Angeles`, `Pacific/Marquesas`, `Pacific/Honolulu`, `Pacific/Midway`, `Etc/GMT-14`, `Etc/GMT+12`.
- 3742/3742 cases, 167 suites — **count unchanged before and after**. Nothing was deleted, skipped, or loosened to get green.
- Each originally-failing case confirmed failing *before* the change under a named zone.

## PM action item

- [ ] Add `App (jest, non-UTC timezones)` to the `main` ruleset's required-checks list. A new job is not a required check until it is named there — until then it reports but does not gate, which is the same gap B-390 closed for the first two jobs.
