# Signal on Home, lighter: a row per finding, titles that name the claim

**Date:** 2026-09-26 · **Issue:** CUL-1270 · **Mode:** BUILD · **Branch:** `claude/festive-babbage-xr9oai` · **Shipped via #927** (draft, design_v2 only)

**PM prompt:** "Build CUL-1270 (D1 B, D2 a) under design_v2. Read the issue and the mock §01–§02 first, then post a plan before coding." Plan posted on the issue. The PM said "go, recommended on all three" to the three build calls:
- (i) the frequency thumbnail is drawn from the finding's own counts;
- (ii) asks on Home on safety rows only;
- (iii) "Show it in full on Home" on the screen.

## What shipped (#927)

- **`lib/signalHomeLine.ts`**
  - Each Home row's eyebrow, headline, count and ask, composed from the finding's structured fields and never from `cached.text`.
  - The headline is `signalTitle`, so the row and the screen share one name.
  - The ask is the server's own vet clause, verbatim.
- **`lib/signalTitle.ts` (D2)** names the claim:
  - "Vomiting in 5 of the last 8 weeks", "Vomiting soon after meals", "Vomiting after chicken, an early pattern", "Possible foreign material in a vomit photo".
  - The frequency comparison stays count-free ("Vomiting, week over week"), because its lead card prints the bars' own line under the title.
- **`components/designV2/signal/SignalRow.tsx`**, a door per finding.
  - Safety rows are words: no chart, and the ask is in ink, open or folded. A folded safety row keeps its date.
  - Insight rows carry a thumbnail drawn from the finding: the dot lane, or the shipped Shape C pair.
- **`SignalZoneFoot.tsx`**: "not a diagnosis" is said once, beside "All patterns ›".
- **Retired:** "Open ›" (`SignalOpenLink` deleted), and `InsightCard`'s design_v2-only `onOpen` (the shipped card is back to its pre-D2-3 body).
- **`SignalScreen`**:
  - Timing findings lead with the lanes.
  - A folded card's screen offers "Show it in full on Home", since the folded row now opens the screen.
- **Tier-2:** S1 of `nyx-signal-home-requirements.md` gains "plain means words, not length" (v1.4, PM-approved with D1).

## The parity guard

`lib/signalHomeLine.test.ts` imports `generate-signal/phrasing.ts` directly (it imports types only, so jest loads it) and renders the server sentence for about 450 engine-shaped findings. Three checks:
- a multiset check: every number on the row appears in the sentence, no more often than the sentence says it;
- the ask is a verbatim substring of the sentence;
- a distinct-value role table.

Proven by mutation, each going red:
- a wrong field;
- a paraphrased ask;
- a local-time onset month;
- a worsening current/prior swap;
- a reflection swap;
- intake `<= 1` changed to `<= 2`;
- chronicity `round` changed to `ceil`.

## Reviews

- **pm-feature-review:** safety rows SHIP-SHAPED. It found seven lines a real owner would misread; all fixed:
  - the trial row lost B-775's "a longer stretch" and never named vomiting;
  - "last 7 days" sat over "last week";
  - "matched days";
  - the timing story had no noun;
  - the refusal had no time anchor;
  - the soft asks had no verb;
  - a folded safety row had no date.
- **adversarial-reviewer:** FAIL, then HOLD on re-attack.
  - Fixed: the correlation row claimed `matchedPairs` as "days seen after chicken" (it is the days compared). Parity was role-blind. The timing story was out of the sweep, with counts on neither the sentence nor the screen. The pair was a new receipt shape.
  - Routed to CUL-1217 (comment posted): titles carrying the engine's rolling counts over calendar bars, and timing screens opening on locally computed lanes.
  - DoD line: *Biostatistician: tried an established correlation (20 pairs, 14 case-exposed) → Home said "on 20 days", fixed; a worsening prior→current swap survived set-parity, fixed with a multiset + role table and re-run red; safety lead, folded chronicity, red flag in every fold state → ask and date always on Home, no chart on a safety row ✓.*
- **code-reviewer:** ship-ready. Its three cleanups were applied.
- **nyx-voice:** run on every new string; the timing story's line was tightened.

## Linear

- Plan, go-ahead and claim are on CUL-1270.
- CUL-1217 has the pre-existing count mismatches D2 surfaced.
- Filed **CUL-1285** (Waiting on PM): does the fold still earn its place under D1 = B? It carries the proposed fold-spec Tier-2 edit.

## Next

- The device pass on #927.
- The PM rules CUL-1285.
- GC-4 (CUL-1225 / CUL-1179) decides CUL-1217's "one count", which the chronicity title now makes more visible.
