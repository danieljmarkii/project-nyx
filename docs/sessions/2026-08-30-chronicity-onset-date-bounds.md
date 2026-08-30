# Chronicity onset — the flag dates the record, not the detector's lookback (CUL-69 / B-700)

**Date:** 2026-08-30

Shipped via #760.

## The defect

The vet report's page-1 chronicity flag printed the engine's `firstOnsetIso` as `(first logged {date})` — an absolute claim about the record. That field is the first onset inside the **detector's own lookback**: `computeChronicityStats` filters onsets to `ms >= now - config.chronicity.windowDays * DAY`, a single global 56 days for every symptom type (`chronicity.perType` overlays the *floors* — `minSpanDays`, `minEpisodes`, `minActiveWeeks`, `ongoingRecencyDays`, `firmSpanDays` — never the lookback). Every count beside it carries the same bound.

The report's default window is the 90-day fallback, and `buildDetectionInput`'s own contract states the containment as a feature: *"90-day fallback ⊃ 56d chronicity window."* **That containment is the defect**, not an incidental edge case — it guarantees a ~34-day blind spot in which the flag's date is wrong for any course predating the lookback. On the cold-read fixture, a cat vomiting since May 20 was dated "first logged Jun 13" while appendix A, one page later, printed May 20.

B-532's left-censor did not catch it because it tested the onset against the **report window** edge — which on the default artifact is ~34 days away by construction — so the floor read "genuinely observed" and stayed silent on exactly the reports whose start really was truncated. Its regression test pinned the guard with `windowDays: 91` on the finding, a value the detector cannot emit, so the real geometry was never exercised.

## What shipped

The flag carries **`firstLoggedIso`** — the earliest in-window entry of that symptom, the same rows appendix A prints — **beside** `firstOnsetIso` rather than replacing it. That is the `TrialFacts.exposureRange`-vs-`range` split: one bounds what the engine counted, the other bounds what the record holds. It is a **required** field, because it describes the very value the flag always states, so silence would be a claim about the record (the CUL-708 rule); a fixture that omits it fails to compile rather than quietly re-inheriting the lookback edge.

The rendered sentence, by geometry:

| Geometry | Renders |
|---|---|
| Lookback covers the record | `Vomiting spans 40 days (first logged May 20): …` — byte-identical to what CUL-687 settled |
| Record reaches back past the counts | `Vomiting spans 51 days: … Vomiting was first logged Apr 10, 2026; these counts begin at May 8, 2026 — appendix A lists this window's entries, including those before then; they are not in the numbers above.` |
| …and the record starts at the window edge | adds `This window opens Apr 3, 2026, so the record cannot show how long the sign predates it.` |

Appendix F gains a gated **"Where the chronicity counts begin"** legend entry, rendered only when a flag actually carries a second window (the B-599 dangling-reference rule), stating in as many words that the earlier entries are *outside the counted window, not judged unrelated* — closing the reassuring inference that was otherwise the only one available.

## The five adversarial rounds

The DoD's adversarial line is mandatory here (a safety flag feeding the vet report). It took **five passes**; four returned FAIL, and in each of the first four the *previous round's fix* was what broke. Recording that sequence because the failure modes generalise.

**Pass 1 — the span extension (HIGH).** The first draft corrected the date and then extended `spanDays` by the gap, so the two numbers would agree. That re-opened **§10 #4** — the "two distant data points" break the engine closes three separate ways (`loggingEligible` over both halves of the onset span, `countDistributionWeeks`' B-188 anti-barbell packing, the minSpan/minEpisodes conjunction). One stale vomit ten months before a real six-week course printed **"spans 335 days · 7 episodes"**: the duration ran toward alarm and was false, while the **density** a vet actually triages on ran toward reassurance — one episode every seven weeks over a record holding weekly vomiting. Cough was the worst case, its 28-day recency floor letting a long-quiet course fire and so maximising the gap.

> **The rule that came out of it, and the one worth carrying forward: a record-anchored DATE is a fact and free to state; a DURATION is an inference the engine guards, and any layer that widens it inherits those guards or must not widen it.**

**Pass 2 — the floor and the disclosure (MEDIUM-HIGH).** With the span reverted, the left-censor still stated the *engine's* span as the clinical floor in a paragraph that had just cited an earlier record anchor — measured a median **32 days short** (max 62) on 159 of 160 dense chronic records, in the reassuring direction. Fixed by splitting on which boundary actually binds. Also: the disclosure named the lookback **length** ("the most recent 56 days of that span"), which can exceed a 43-day span outright and then reads as *"nothing is missing"* — the inverse of the warning; it now names the **date** the counts begin at. And its gate was local-day granular while the lookback cuts at an instant, so three morning episodes sat uncounted and undisclosed.

**Pass 3 — the year (HIGH).** The report renders days as `"Mon D"`. That was unambiguous **by construction** while the only date on this line was the detector's onset, structurally within the lookback of the window end — and repointing it at the record anchor removed the construction, because `since_visit` has no clamp in `resolveScope` and a stale-active diet trial is the B-594 steady state. A 2024 anchor beside a 2026 count start read as two months where the record held 27, and on a plain 90-day fallback **11% of generation days** rendered a reversed pair. On one real record the fix read **26 days more reassuring than the bug it replaced**.

**Pass 4 — the conditional year (HIGH).** Stamping the year only when it differs from the window's was worse than not stamping at all: `firstLoggedIso <= firstOnsetIso` always, so the stamped date is structurally always the *first* of the pair, and in ordinary English a bare date following a year-stamped one **inherits** that year. *"first logged Nov 23, 2025; these counts begin at May 8"* reads as May 8 2025 — six months *before* the anchor. 236 of 236 such pairs on a 90-day fallback. The year is now decided **once for the whole row**, censor date included. Also fixed: the tail *"anything logged before then is in appendix A"* was an unrestricted universal the report cannot honour (appendix A holds in-window rows only, and the default cascade carries no out-of-window disclosure at all) and flatly contradicted the censor sentence at a ~57–64 day window — a vet visit eight weeks ago.

**Pass 5 — PASS.** Could not produce a false, reversed or reassuring chronicity sentence on any record the app can generate. It verified the earlier closures by sweep and mutation rather than inspection: censor/tail coherent across every window length 21–120; the no-year path byte-identical to pre-CUL-69 over 120 fixtures × 5 timezones; `day()` and `fmtDayYear` agreeing on separator, month abbreviation and padding across 12 months × 8 zones; the cross-year guard red on all five mutations including a deleted sentence. Three of its four LOW residuals were closed (year decided per-row not per-date; the switch made **band**-scoped so one page cannot render the same window-open date two ways — the B-532/HR-7 class; the tail restored to end on the exclusion, per B-494's "the band must stand without the legend"). The fourth is pre-existing and filed as CUL-742 rather than folded in.

## Two of my own guards did not discriminate

Both were caught by **mutation**, not by reading — which is exactly what CUL-613/CUL-621 say and why the rule keeps earning its place.

- The cross-year test compared `indexOf` **offsets of two clauses in one sentence**, so it asserted the sentence's word order (trivially true) and shipped an instance of the defect as its expected output. It now parses both rendered dates back out and compares them as dates.
- A year-guard mutation looked valid but was a **type error**, so it never ran and proved nothing until rewritten as a copy change. A mutant that fails to compile is not a mutant.

A third guard initially failed to discriminate for a duller reason — no fixture had a counts-begin date outside the window's year — and got the missing case rather than the benefit of the doubt.

## Decisions

- **Option A over option B** (PM-ruled at the plan gate): anchor to the true first log rather than qualify the lookback-bounded date. B-532's own ruling is that duration is the axis a vet reads this flag for, so withholding a date the report already holds in appendix A is worse than the lie it replaces.
- **Counts are disclosed, never re-derived.** Re-deriving them over the wider span would fork the report off the one statistical source `buildDetectionInput` exists to preserve, and make the flag disagree with the Signal card for the same pet on the same day. Disclosure beside the number is the ratified answer (the C5 logging-density precedent).
- **`chronicityRecordPrecedesCounts` is one predicate**, read by both the row's year switch and appendix F's legend gate — not two copies of the same test (§5.3).
- **A falsified comment was corrected rather than left standing.** "`hasUncountedRecord` entails window > lookback" is false at exactly `windowDays === 56` (up to 14h at UTC+14: the window opens at local midnight while `detectionNowFor` stamps a past-ending custom window at UTC end-of-day). No render harm today, but 56 days is both the ACVIM skin-trial length and the natural "8 weeks" custom pick, and it was load-bearing prose for the next editor.

## Not folded in

- **CUL-730** — the Signal card carries the same false "First logged" claim from the same detector field. `generate-signal` fetches 180 days and counts 56, so it holds **124 days of rows the claim ignores**; measured 123 days short on a dog coughing since January, including the `phoneScript` row its own comment calls *"the script an owner reads ALOUD to their vet"*. Different function, different deploy chain, and the report's fix leans on appendix A — an asset that surface does not have. **It creates a sequencing constraint**, noted on CUL-19: today both surfaces are wrong in the same direction so they agree; after this deploys they disagree for the same pet.
- **CUL-742** — a censored row with no uncounted record can print two bare New-Year-straddling dates on windows ≤61 days (1.27% of such rows). Pre-existing since `340ec41`; the year switch is under-inclusive as a *year* question, but closing it is a widening of a PR that had already been through five rounds.

## Verification

`deno test` **1433/1433**, and green under `Pacific/Kiritimati` (UTC+14), `Pacific/Chatham` (UTC+12:45) and `Pacific/Honolulu` (UTC−10) — the B-514 timezone-honesty band. `jest` **6174/6174** across 282 suites. `tsc --noEmit` clean. CI green on every pushed head.

Deploy ledger re-fingerprinted five times, **status `hold` throughout** — B-494/CUL-19 unchanged, and each entry says explicitly that the re-acknowledgment is not progress toward clearing it.
