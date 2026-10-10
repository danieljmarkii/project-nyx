# Engines v3 PR-30s: the refused-meal strings, and the refused-then-vomited intake card

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1143 (CUL-1725). A `/dispatch` child, plan-gated; the PM's go was typed in the session as "go, A".

## What shipped

**I4 (ruling sheet §2.7).** The three card surfaces that print the refused-bowl count (the timing card face, the Patterns trial panel, the trial card) end on "That's worth mentioning to your vet." as a sentence of its own, one constant (`REFUSAL_VET_TAIL`). The trial card's middot no longer splits its claim: "Of those 6 hours or more after eating, these followed a refused meal: K in the trial · J before it." The server L1 clause and the Home row already passed and did not move.

**I5, option A, dark behind `engines_v3_en5`.** A cat whose last bowl before a witnessed vomit was rated Refused 0 to 30 minutes earlier, on at least 2 episodes over 2 of the owner's days within 14 days, spanning 14 hours or more, gets the cat intake card (`intake_decline`, trigger `refused_then_vomited`) when ② is quiet, or the same facts as a line on ②'s lead card when ② fires. `lib/mealTiming.ts` gained `minutesAfterLastRefusal` (the timing lane's own evidence bars), detection gained the step and `safetyRankOf`, the pipeline and the fingerprint share `signalDetectionConfig`, and every client switch on the intake trigger names the new one. The key is a SIGNAL key (stand-downs across its flip are withheld).

## What broke and how

The isolated adversarial pass failed the first build:
- **D1:** an intake card went to the model, and `validatePhrasing` screens intake for reassurance and "picky" only, so "because she refused" and "a sign of nausea" passed. Fixed by making any card that carries the facts template-only, with `validatePhrasing` refusing every model sentence there.
- **D2:** `SAFETY_TYPE_ORDER` ranks intake above burden for ②'s 48-hour liver window, so an I5-only card took the lead from a "call your vet today" burden card. Fixed by `safetyRankOf`, which places I5 below burden and weight and above chronicity, mirrored in the cross-pet banner.
- **D3:** one night across local midnight met the two-day floor, and a UTC fallback split an American evening in two. Fixed by a span of 14 hours (20 in the first fix; the re-review showed 20 silenced a late-dinner refuser), and by I5 staying silent without a valid zone (⑥'s rule).
- **D5:** the "since" date printed the UTC day. Fixed by carrying `firstLocalDay`.
- **D7:** the Home row read the facts unguarded. Fixed by reading them through the guarded accessor.

Every new guard was proven by mutation. The re-review of the fixes **passed**: no I5-bearing card reaches the model on any path (main, care state, summary, carried, offline), the "call today" card keeps the lead in every pairing including across pets, and the local date prints. Its one residual, the late-dinner refuser the 20-hour span silenced, moved the span to 14.

## Residuals

- **D4 is a flip condition, not code:** a build from before #1143 titles the I5 card "Eating less than usual". The key may not flip for an account still on such a build, on top of "ships only with EN-8".
- **D6 goes to the real-vet list:** an eaten bowl minutes before the refusal still counts. It sits there beside the provisional window, floor, species, span and rank.
- On Home's design v2 row, a ② card carrying the line shows only its terse row; the line reaches the owner on the Signal screen and in the phone script.
- Voice pass: "vomits" became "episodes", and "you saw happen" became "Only vomiting you saw is counted, each time measured from a meal you marked Refused."
