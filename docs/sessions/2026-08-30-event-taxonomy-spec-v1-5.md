# 2026-08-30 — Event Taxonomy: spec v1.5, five rulings, and a fifth FAIL (CUL-684)

**Mode:** DISCOVERY→BUILD hybrid, docs only. No code, no schema, no build.
**Outcome:** shipped via #767 — `docs/nyx-event-taxonomy-requirements.md` v1.4 → **v1.5**; §9a rewritten against five PM rulings (D20–D24). **The W2 gate is NOT lifted:** the mandatory adversarial pass on the rewrite returned **FAIL — 18 findings, five silent on the sick** — recorded as a new §9b. CUL-684 stays open, `Waiting on PM`. CUL-667's greenlight is not mine to recommend.

## What this session was for

CUL-684 carried 22 open findings against §9a v1.4, four of which were PM/Dr. Chen rulings rather than drafting. The instruction was explicit about sequence — **rule → write → attack → land, not write-then-land** — because three passes had by then each broken the closures the pass before wrote, with the recorded cause being that *a closure written to satisfy a finding acquires load-bearing mechanism nobody then attacks*.

Five briefs were put and the PM ruled the recommended option on all five.

## The rulings (D20–D24)

1. **D20 — rule 0 tightened.** For a **presence-class** finding an evidence-quality guard may set the **wording only, never the tier**. v1.4's "wording and tier" licensed capping fourteen unresolved straining trips at prompt-24–48h for a condition fatal in 24–48h, while the identical cat in an uncovered litter box banded — the lid on the box deciding between a red alert and a shrug. Unresolved evidence now bands at its own floor **N_R** with conditional wording.
2. **D21 — straining with a few drops is an escalating observation at n=1.** `T = 0` becomes 5a's only silence cell.
3. **D22 — `labored_breathing`'s dog arm fires**, with dog wording. Rule 10 read "in a cat" three lines above a bound naming the CHF dog as its target patient.
4. **D23 — a band may name the household**, superseding D18's "the band never pools", and the unattributed datum travels into §10.
5. **D24 — W2 splits** into W2a (`urine_strain` + `labored_breathing`) and W2b (`respiratory_rate`), the seven rule-11 findings deferring with their lane.

## What v1.5 wrote

**The largest closure is a deletion.** 5a's ordered first-match-wins table — the structure F1, F3 and F6 each attacked separately — is gone, replaced by **three independent axes (U / R / T), each contributing at most one finding, composed by rule 15**, the composition rule the contract already had. That makes monotonicity structural rather than asserted and forces the tier ladder to be written down (`band > presence > frequency > observation`, with `presence > frequency` argued clinically: one witnessed unproductive strain outranks twelve productive ones).

Also closed in place, each naming its finding: rule 3 loses scope it should never have had and gains a delivery-side marker write, an acknowledgement baseline and a `tierShown` floor; rule 6's post-edit entry point renders on the detail screen rather than pointing at a card on Home; rule 13 conditions on the **finding** rather than on whether a band rendered, and its CUL-614 completion sentence is never suppressed on any branch; §10 **deletes** its display collapse so the report prints one number; eleven binding fixtures, six new. CUL-738's three approved citation edits folded in.

**One seam caught in-session, before the pass.** The first draft of the acknowledgement boundary said *"acknowledging retires the marker"* — which re-fires immediately, because the old rows are still inside the window, so the next evaluation finds a qualifying cluster with no marker and bands again: CE-8's alarm wallpaper arriving through the closure. Replaced with a fresh-evidence baseline (post-`acknowledgedAt` counts against the floors 5a already defines), which adds no fourth constant. The rejected form is written into the spec **with its reason**, since it is the shape a later session will reach for.

## Code claims verified before use

- `hooks/useSubmitGuard.ts:31` — the latch is a `useRef`, set synchronously before the await. ✓
- `components/log/SheetLogBeat.tsx:88` `commitSymptom()`; `EventTypeSheet.tsx:231` `!visibleRef.current` early return; `SimpleEventConfirm.tsx:105/332/641`. ✓
- **Two miscitations corrected, both inherited:** the gap-shortening **magnitude test is `detection.ts:5508`**, not `:5081` (which is a postprandial config block — and v1.4 had taken a ruling on that citation); the strict-monotone run is **`:5500`**, not `:5502`. The `runLength` = 4 rationale (1/4! ≈ 4.2% by-chance FPR) is verbatim correct at `:2239–2253`.

## The adversarial pass: FAIL, and the split in the result is the finding

**18 findings, five silent on the sick.** Recorded as §9b(i); the six deferred rule-11 findings become §9b(ii). Every code claim in the pass was re-verified here at file:line before being accepted — and **no line number in this pass was wrong**, unlike the last.

**The deletion held. The additions and the seams between them did not.**

- **Held:** 5a's monotonicity under row addition (genuinely structural) · `T = 0` as the only silence cell · the window-reset deletion, run against a partially-obstructed cat passing drops · rule 1's three sheet exits against the shipped host · marker identity by intersection against all four churn triggers · **D17's batch-recall premise, traced through the shipped host** — `SimpleEventConfirm` unmounts between flows so `useSubmitGuard`'s ref is fresh each time, and three confirm passes really do write three rows.
- **Failed:** four of the five silence defects are in mechanism v1.5 *added* (the acknowledgement baseline, rule 6's new host, D23's pooled band, §10.3c) or in a **seam between two of its closures** — including **two directly contradictory sentences about the same marker** (rule 1 says it never gates the Signal card; rule 3 says it governs the card's arrival), which is precisely the "consistency fix" rule 1 warns a later session might make, shipped inside the same version.

**Three findings are worth carrying past this track.**

**(1) A closure can fail by fixing the wrong half of a defect (F-B).** 5a's table was deleted to close "new evidence reads as a downgrade" — but the table supplied the *arbitration*, and the actual cause was the **partition**. U, P and R partition T, so answering a chip moves mass between axes without changing T: the covered-box cat at four unresolved trips is at `band`, and the owner who then watches him strain and produce nothing and answers *"no pee came out"* drops the cluster to `presence`. **F6 survived the deletion of the structure it was filed against**, and *D21's stated property "P never subtracts" is false as written* — P only ever grows by resolving a trip out of R.

**(2) A guard written to catch exactly one defect can be unable to fail (F-I).** Fixture 9's property test — "the composed tier is non-decreasing in each of U, R and T" — is a max of monotone step functions, which is monotone by construction. No implementation of 5a's table can fail it, and randomising `(U, R, T)` independently never generates the chip-answer transition at all. The CUL-613 lesson, inside the fixture set whose own preamble states it.

**(3) An unverified architectural premise is its own class (F-C).** §9a asserts the durable Signal card *"already ships"* as the backstop for **four** fallbacks. It does not: `readSignalCache` reads the `ai_signals` table over the network (`lib/signal.ts:560`), `lib/signal.ts:588` says in the file that detection recomputes *"IN SUPABASE (not local SQLite)"*, and `regenerateSignal` (`:593`) invokes the Edge Function. So the durable half of the contract is unavailable in **exactly the offline condition §9a cites to justify putting detection on the client**. Not a seam — a premise nobody checked, invalidating four rules at once.

**And the scope lesson, which the discipline alone does not supply.** v1.5 followed rule → write → attack → land exactly, and preferred deletion throughout, and still returned 18 findings — because it wrote **fifteen closures at once** and four of the five silence defects landed in the seams between them. §9a now says a v1.6 pass takes §9b's five rulings first and closes **one seam at a time, re-attacking after each**, rather than rewriting the section as a block again.

## Not fixed here, deliberately

No closures were written for the 18. That is the discipline this issue exists to keep and the PM's own ruling on brief 1 is the endorsed precedent. Four things changed after the verdict: §9b was written, and the header, §9a's preamble, D24 and §13 were corrected so nothing in the spec claims W2a is clear.

## Persona / review

`adversarial-reviewer` — **FAIL**, verdict and counterexamples in §9b(i), on the PR and on CUL-684. Five findings need a PM/Dr. Chen ruling: **F-C** (where the durable card lives, the largest), **F-F** (is 5a's `frequency` finding presence-class or rate-class, and may a pooled finding change class), **F-H** (the two-count definition for a mixed household), **F-J** (may an acknowledged cluster's re-arrival be damped to the card across days), plus **F14** and **F17** in the W2b half.

## Not done here

W2 build work (gated, and out of scope by instruction). The 2026-08-27 review's other routed items stay on their own issues: CUL-676's three engine briefs, CUL-677's T&S gate on the §11 swap, and the recommendation to move §9a from prose to an executable decision table + property tests — which F-I makes a stronger recommendation than it was, since prose is what let a non-falsifiable property ship as a binding fixture.

— Session 2026-08-30, branch `claude/event-taxonomy-v1-5-findings-kv7myz`.
