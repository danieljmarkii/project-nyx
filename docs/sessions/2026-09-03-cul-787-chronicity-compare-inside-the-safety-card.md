# Signal v1.1-b — the counted 4-week compare inside the chronicity card (CUL-787)

**Date:** 2026-09-03

Shipped via **#797** (draft). Mode: **BUILD** (plan-gated; the plan and one decision brief were posted on the issue and the PM ruled before code). Branch `claude/session-xheutx`. Parent track: **Home v1 — The Signal fold** (CUL-695), of which this is v1.1-b (fold spec §0 DF-9(b), §8).

## What this was

Nyx went from 12 vomiting episodes to 2 across two four-week stretches and Home could not say it. The 2026-08-29 discovery's F2 had proposed a second calm card under the red one; Dr. Chen's fold-session interview ruled that out — `detectReflections` returns `[]` whenever any symptom is chronic (the §4.4 valve), and a separate calm card would reopen it — and asked instead for the two counts to live *inside* the safety card's evidence and phone script, with one sentence saying why the ask still stands. This session built that.

## What shipped

**Engine — `supabase/functions/generate-signal/`**, additive payload only:
- `ChronicityCompare` + a pure `computeChronicityCompare(input, symptomType, config)` in `detection.ts`: two now-anchored 28-day halves of ⑦'s 56-day lookback (the prior half anchored on the whole `windowDays`, so an odd window still partitions), per half the collapsed episode count (the same `toEpisodeOnsets` collapse, collapse first then window, so the halves partition `episodeCount` exactly — C-4) and the logged days via `loggingDaysInWindow` reading the ③/④ comparison-gate cell **plus the finding's own sign** (a new optional `alsoCounts` on that helper; byte-identical for every pre-taxonomy type). `comparable` reuses the SR-4 rule and constant.
- Attached post-detection: `medContext.ts#decorateFinding` gained a fifth parameter; `index.ts` computes the compare per chronicity finding inside the decorate map, like `photoComposition`. No detector, floor, ranking, valve or template change — `detectChronicity`'s output is byte-identical (test-pinned), the reflection lane stays muted while chronicity fires (test-pinned on the easing course), and `templateChronicity` composes the same sentence.

**Client**, expand + phone script only; nothing on the face or in the sentence (§3.5); an old cache renders the pre-v1.1-b card byte-identically:
- `lib/signal.ts` mirrors the optional `compare`.
- `lib/signalCopy.ts`: `chronicityCompareRows` (Shape C, both counts always printed — S2, both rows in the symptom hue; a true zero muted), `chronicityCompareDensityLine` (disclosure form; the withheld form on a **falling** thinner-logged pair only), `CHRONICITY_WHY_IT_STANDS` (falling pairs only), `chronicityComparePhoneScriptFact` (one two-sided row, each denominator spoken), and the `phoneScript` chronicity branch gaining that row between "How often" and "Most recent".
- `components/home/InsightCard.tsx#ExpandedReceipts`: the `Counted honestly` box above the phone-script box; one new `whyItStands` style in primary ink.
- `lib/signalFold.test.ts` (the fold PR 1 having merged mid-session): a pin that a `compare` arriving or moving never re-opens a fold — `MATERIAL_FIELDS` is an allowlist, so this held by construction; now it cannot regress.

**Spec (Tier-2, PM-approved in the go-ahead):** `docs/nyx-signal-home-requirements.md` → v1.3: the §3.2 chronicity row carries the expand contract; §3.5's "week-pair framing on chronicity" narrowed to the face and sentence; §9 gains the four strings.

**Deploy ledger:** `generate-signal` re-fingerprinted twice (`pending`, deploy owed after merge — the client half is a no-op until it lands); `generate-report` re-fingerprinted only because it inlines `detection.ts`, its CUL-19 hold unchanged.

## Decisions

- **The why-it-stands clause takes option (a)** (PM, 2026-09-03). Dr. Chen's verbatim line, *"…a course that eases before a cause is found…"*, contains "cause", which `CAUSAL_RE` rejects on every chronicity string — the very vocabulary the clause exists to avoid. Shipped: *"Fewer lately doesn't change the ask — a course that eases before it's been looked into hasn't been explained, and your vet will want the whole run."* Re-entered the voice pass (C-28); Dr. Chen re-signs at review.
- **The halves are now-anchored halves of the lookback**, not halves of the onset span: the issue's "Recent 4 weeks / The 4 before" is a fixed window, a span-half would be a variable one, and the standing card's own denominator is the 8-week lookback.
- **The density gate reads the comparison-gate cell, not ⑦'s full-coverage span-halves helper**: this gate decides whether a falling pair may be read at face value, and comparability gates belong to that cell (the R3 re-ruling). The adversarial pass then found the cell excludes the finding's own sign for cough — fixed by adding it, which is the generalisation the `countsTowardComparisonGate` doctrine already states.
- **The clause renders on a falling pair only.** Flat and rising: the sentence and the ask already carry it. 12 → 11 over-fires harmlessly (it only restates the ask).
- **`compare` is not a fold material-change field** (posted on CUL-784; pinned in the fold test).

## The adversarial pass (isolated `adversarial-reviewer`) — FAIL on the first cut, all fixed in this PR

Attempts and outcomes:
- **Partition:** Nyx 12→2; exact-boundary onsets at now−28d / now−56d; a 40-minute bout straddling the half boundary; events at `now`, future-dated, unparseable — held. **Odd `windowDays` (55) → 27 ≠ 28** — a latent break (unreachable at `DEFAULT_CONFIG`; `windowDays` is off the floor allowlist), fixed by anchoring the prior half on the whole lookback and pinned with a 60-course × 5-window property test.
- **The cough card (live, HIGH):** cough is in the ⑦ lane but not in the comparison-gate cell the denominator read. A firing cat cough card printed *"the 4 before: 8 · logged on 0 and 0 of those days"* — a receipt denying the logs its own numerator came from — and, through the prior-half-dark escape hatch, minted `comparable: true` on a 10→2 fall where attention had actually collapsed: the reassurance direction on a `firm` safety card. Fixed (own sign added to the denominator); both fixtures pinned.
- **The withheld line on a rising pair (live, MEDIUM-HIGH):** 8 vs 6 over 10 vs 28 logged days rendered *"so a lower count there can be fewer logs"*. Fixed: falling-only, per §3.3; rising-thin and flat-thin fixtures screened.
- **The phone-script row read aloud (copy):** *"logged on 27 and 28 of those days"* parsed as two dates beside "First logged: July", with no antecedent and no spoken denominator. Fixed: *"logged on 27 of the recent 28 days, and 28 of the 28 before"*.
- **Held:** the 0.7 gate at 20/28 logged days with a trailing 8-day dark run (comparable; bounded by both counts printing, the ask never moving, the clause on every falling pair); the 25-day-old record's printed `0` (denominator-backed, rising-only); the clause gate; nothing from `compare` reaching the face label, the server sentence, `generate-report` or the fold fingerprint; every string against glyph / percent / reassurance / dismissive / causal and the fold veto list; old-cache byte-identity.

**Residuals, each homed:** **CUL-793** (`Waiting on PM`) — the gate borrows the 7-day 0.7 ratio for 28-day halves and needs its own named constant plus a Dr. Chen ruling on the trailing-dark-run case; the same issue records why "eases" survives the never-reassure bar (its concessive framing). **CUL-792** — the whole expanded region (script, receipts, caveats) is unannounced to VoiceOver, pre-existing and enlarged here. Inherited: "Counted from days you logged" means days-with-any-log (the reflection lane's wording). Shape-C bars encode magnitude; both rows wearing the same hue is the ratified mitigation.

## What broke and how it was fixed

- **CI red on the first push, twice, on the old head:** `main` had taken the fold PR 1 (#796) between my branch point and the push, and its new control row made `getByRole('button')` ambiguous. Merged `main` (clean), switched the four new card tests to the fold PR's `insight-face` test ID. No shared-file conflict despite both PRs touching `lib/signalCopy.ts` and `InsightCard.tsx`.
- **A boundary fixture of my own was wrong**: an "outside" event one hour before an exact-boundary onset merged with it under the 3-hour collapse, exactly as ⑦ would; the fixture now places it four hours out and the straddle case is its own test.
- Deno is not on the cloud box; installed the CI-pinned 2.9.4 via npm to run the engine suite locally.

## Verification

`tsc` clean · jest 306 suites / 6,564 tests / 6 snapshots on the merged tree (a final run on the fixed head was in flight at wrap) · Deno 563 · all 11 guards including the re-fingerprinted ledger · the two touched client suites under UTC+14 and UTC−10 · `code-reviewer` ship-ready with no findings · `adversarial-reviewer` FAIL → fixed as above.

## Persona sign-off

Designer ✓ (expand-only, S1 face untouched, the box reuses the shipped `Counted honestly` register, the clause in primary ink because it carries the ask; the reworded clause and the spoken-denominator row re-entered the voice pass) — Dr. Chen ⚠ (the ask and both counts never move with `compare`; the clause is his, reworded under option (a) — re-signs at review; the 0.7 ruling is his on CUL-793) — Biostatistician ✓ (the falsification set above; the partition is property-tested) — Jordan ✓ / Sam ✓ (the counts they asked for, inside the card they already read, with the denominators beside them) — Data Scientist ✓ (one predicate for the halves shared with ⑦'s collapse; the compare never re-opens a fold) — Dir. of Eng ✓ (additive payload on the existing decorate seam, no new deps, old-cache tolerant, ledger honest, no engine hold in the way) — QA ✓ (the AC list on the PR) — T&S N/A (no data-boundary change) — PO ✓ (CUL-792 / CUL-793 filed; CUL-784 told about `compare`).
