# Signal/Home uplift SR-5 (B-721) — client consumption of SR-4's payload

**Date:** 2026-08-09 · **Branch:** `claude/sr5-signal-home-client-8oacta` · **PR:** shipped via #621 (draft)

The client half of SR-4. `generate-signal` already attaches the additive payload (med-on-board facts + `density`); SR-5 renders the §9 copy around it, all dark behind `signal_design_v2` and byte-identical flag-off. Zero server changes. Folds in **B-733** (the three SR-5 copy flags from SR-4's adversarial pass).

Spec: `docs/nyx-signal-home-requirements.md` §5.4 (med line), §3.3 (density), §3.4 (trial adjacency), §9 (verbatim copy), §7 (FR-FLAG). Design authority: `docs/culprit-signal-home-mockups.html` (round 2.1, frame CC-1).

## What shipped

**The one deferred `lib/signal.ts` type change (SR-1 note).** Added the client mirrors `MedOnBoardContext` (`{ drugLabel, doseCount }`) + `ReflectionDensity` (`{ comparable, currentLoggingDays, priorLoggingDays }`), and the optional `medContext?` on correlation + both timing findings and `density?` on the reflection finding. Optional on purpose — the same 24h-TTL cache tolerance as the slice-6 protein cluster: a row written by the pre-SR-4 deployment carries neither field, and every consumer renders byte-identically when they're absent (which is also the flag-off contract).

**The med-on-board context line (§5.4).** A quiet slate-toned line under the sentence/receipt on correlation + timing cards: `During an active {drug} course — {n} doses logged.` (`medContextLine`, `lib/signalCopy.ts`). Three B-733 items handled here:
- **Pluralised** — `1 dose logged` / `3 doses logged` (the §9 copy hardcodes plural; a course can hold exactly one administered dose).
- **Composed-line guardrail screen** — the drug label is owner free-text carried VERBATIM (a name is data, not generated copy; screening it server-side would corrupt "Baytril 2.5%"), so the *composed* line is run through a client mirror of `hasBannedSignalVocabulary` (GLYPH_RE + PERCENT_RE, §3.5). A `%` in the drug name trips the percent screen → the whole line is **dropped** (null), never shipped with a `%` on a Signal card. Fail-quiet: the med context is non-essential decoration on a benign (insight-lane) card, so its silence never reassures and never inverts a safety finding.
- Degenerate cached facts (blank label / non-positive count) also drop the line rather than render a gap.
- Folded into the card's `accessibilityLabel` (flag-on) so VoiceOver hears the same card-face context a sighted owner reads (the strip/line Views are decorative, swallowed by the Pressable's explicit label).

**The reflection density expanded copy (§3.3).** In the falling reflection's expanded state, inside a `Counted honestly` box (the round-2.1 mock's title):
- **comparable** → the §9-verbatim disclosure line `Counted from days you logged: {a} this week, {b} last.` — the logged-day counts that back the comparison the sentence still carries.
- **NOT comparable** → the **reworded** withheld line (B-733 / Dr. Chen call — see below).

**Card-face coherence (the SR-5 catch).** SR-4 withholds "down from N" from the reflection *sentence* when density isn't comparable, but the client *sample line* still carried the same week-pair ("2 episodes this week, 5 last week") — so the card face re-asserted the exact comparison the sentence dropped and the expand explains it can't trust. SR-5 gates the sample line too (flag-on): a density-withheld falling reflection shows only "2 episodes this week". Client-derived + flag-gated exactly like SR-3's `worseningNewSampleLine`; flag-off keeps the shipped week-pair (byte-identical).

**The mid-trial adjacency (§3.4).** The §9-verbatim `A quieter week partway through a diet trial isn't the trial's verdict — the full run is what makes it readable.` appends to a FALLING reflection's expand while a trial is running. `isTrialRunning` (the one predicate, `lib/dietTrial`) is computed in Home from the trial input it already loads — **no second read** — and threaded Home → `SignalZone` → `LiveStack` → `InsightCard`. Weakening-only + expand-only; a flat reflection gets neither density nor adjacency.

## The B-733 density-withheld reword (Dr. Chen call — §9 Tier-2 edit flagged)

§9 verbatim: *"You also logged on fewer days this week, so we can't tell yet whether there was less to log."*

The problem (SR-4 adversarial residual 1): the gate measures **days-with-any-log**, not symptom-specific coverage — a week of meals-only logging keeps the day count up while symptom logging lapses. "whether there was less to log" reads as if the gate could adjudicate whether the quiet is real, which over-claims what the measure can see.

Shipped reword:

> **You also logged on fewer days this week, so we're not comparing it with last week — fewer logged days can look like fewer episodes on their own.**

It keeps §9's opening, grounds the uncertainty in the actual measure (LOGGED DAYS, not "less to log"), and declines the comparison rather than promising a later verdict ("yet"). Never reassures (withholds the reassuring read); fail-toward-escalation. **This deviates from §9's verbatim string → flagged as a §9 Tier-2 edit for PM approval** (the box title `Counted honestly` is likewise a §9 addition from the mock).

## nyx-voice — every new/changed string reviewed ✓

Med line (bare fact, no verdict/reassurance, P2/P4/P6) · disclosure (§9 verbatim, second-person) · withheld line (withholds rather than reassures — P6 fail-toward-escalation) · trial adjacency ("isn't the trial's verdict" = anti-reassurance) · "Counted honestly" label · withheld sample line. All calm, plain, no exclamation.

## Architecture notes

- **No prop-drill / no duplicate load.** `trialRunning` originates in Home (which already calls `useDietTrial`), so `SignalZone` gains one boolean prop and threads it beside `designV2` (same path). `SignalZone` did NOT grow its own `useDietTrial` (that would be a second `loadDietTrialFacts` on every Home render).
- **Slate that clears AA.** The med line uses `colorEventMedicationInk` (#3D5875, the readable slate TEXT ink), not the `~3:1` glyph tint `colorEventMedication` — matching the SR-3 chrome team override where the mock's colour failed AA.
- **FR-FLAG-2 everywhere.** Every render path is gated on `designV2`; the expanded density box is inside the already-flag-gated `ExpandedReceipts`; the sample-line swap, med line, and a11y append are all `designV2 &&`. Snapshot-pinned flag-off (correlation-with-medContext + reflection-with-density both proven byte-identical).

## Tests

Full suite **212 suites / 4761 tests / 9 snapshots green**; `tsc --noEmit` clean. New coverage: `lib/signalCopy.test.ts` (med line pluralisation + `%`-drop + null paths + guardrail-clean; the withheld-line Dr. Chen bar — never reassures, grounds itself in "logged days", not "less to log"; `reflectionExpandedExtras` across comparable/not-comparable/flat/trial combinations; §9-verbatim pins) and `components/home/InsightCard.test.tsx` (flag-on rendering + a11y fold + the FACE-drops-the-pair coherence + FR-FLAG-2 byte-identical for findings carrying the new payload). `TrialStrip.test.tsx`'s `<SignalZone>` layout-anchor updated (the element is no longer self-closing).

No `supabase/functions/` changes → the Deno suite is untouched.

## Not in scope (registered)

- **SR-6** — the copy/safety pass, S10 assignment audit, `pm-feature-review` re-run, flag-on on-device QA, GA rec.
- v2 (own future spec) — prior-set memory for timing-`New` + the `Now established` transition.
- The comparable-case sample line still double-states the pair (sentence + sample); the mock's "Logging steady, 6 of 7 days" density sample line is a bigger redesign, out of SR-5 scope and left to SR-6 / the S10 audit.

## adversarial / clinical posture

SR-5 touches no detection/threshold/ranking logic (that was SR-4, adversarial-PASS already) — it is client copy over an already-computed payload, so no fresh `adversarial-reviewer` gate (§8 lists it mandatory at SR-4, not SR-5). The clinically load-bearing decision here is the withheld-line reword, held to `clinical-guardrails` (never reassures on absence; fail-toward-escalation) and nyx-voice. `code-reviewer` run on the diff.

## Flagged for PM (Tier-2 §9 edits — approval required before writing the doc)

1. §9 "Density withheld (expanded)" row → the reworded string above (B-733 / Dr. Chen).
2. §9 copy table → add the density box header **"Counted honestly"** (currently only the mock carries it).
