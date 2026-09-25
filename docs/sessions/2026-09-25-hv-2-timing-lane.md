# History v2 step 1, HV-2: the timing lane names its meal, and a refused bowl is not eating

**Date:** 2026-09-25

Shipped via #910 (CUL-1159, fixes CUL-1122). Filed: CUL-1190, CUL-1191, CUL-1192, CUL-1195, CUL-1196. Handoffs posted on CUL-1158 (HV-1) and CUL-1163 (HV-6); a deploy note on CUL-1152.

## The ask

HV-2 of History v2, bundled with CUL-1122, one session and one PR. `lib/mealTiming.ts` is the one predicate for "how long since she last ate": the generate-signal engine (detector ⑤ post-prandial, L1 empty-stomach, the A2 trial rows) and every client timing surface (Home's spine line, the Patterns timing panel, the Signal screen, the trial panel) classify through it. It counted every bowl put down as eating, so a vomit five minutes after a refused dinner read "5 min after eating", ⑤'s eating-too-fast pattern for a cat that last ate fourteen hours earlier. The session also had to make every timing line name the meal it measured from, so History and Home can keep that meal as its own row (HV-6 draws that rule), and to rule "picked at" through the Dr. Chen lens. Plan posted, PM said go.

## What changed

- **The rule** (recorded on CUL-1122): a feeding anchors when food went in. Refused never anchors, whatever the food type; Picked at, Some, Most, All and unrated do; treats keep today's behaviour, and a treat rated Refused does not anchor. The ruling is a `Record` over the rating union in `lib/mealTiming.ts`, so a rating added to the enum cannot compile undecided.
- **`FeedingInput` gains the event `id` and `intakeRating`, both required.** An optional field would let a reader that forgot the column default to "eaten" in silence, which is CUL-1122 again. Every eligible timing carries `feedingId`.
- **`timedEligibleFeedings` returns the eating anchors only**, and the server uses the same list as ⑤'s grazing-guard feeding rate and L1's per-episode base rate, so the chance baseline agrees with the numerator about what eating was.
- **A new untimed reason, `refused_only`**, so the Patterns panel never says "no meal logged" about a record that logged a refused one. The panel lead now says "placed by how long after eating", not "after the last meal".
- **Both feeding reads** (`readFeedingsSince`, `readFeedingRows`) select `e.id` and `m.intake_rating` through one shared column list and mapper; the id is the event id, never the local `meals.id`.
- **`timingsByRow` is exported** with its five parameters and returns `{ text, mealId }`. `SpineEventNode` is unchanged, so nothing under `components/` moved: HV-1's pipeline takes the map.
- **A saved rating bumps `hydrationTick`** (`rateMealIntake`), the move the trial and medication writes already make, so a Refused given after the vomit reaches Home's line (the adversarial pass's must-fix, below).
- The server passes the id and the rating at both feeding sites in `detection.ts`; the lane's header no longer claims the server rewire is pending (CUL-7 did it long ago).

## Decisions

- **Picked at counts as eating** (Dr. Chen lens). The lane's claim is literal: a few bites is food, and not anchoring would print "6h or more after eating" under a row reading *picked at* minutes earlier. It is also the safe direction for the nibble case: dropping it would move a poorly eating cat's vomits into the empty-stomach band. The sets that group Picked with Refused elsewhere answer different questions ("did the pill go down", "is she eating enough"). Not added to the CUL-583 sitting; reversing it is one line.
- **The meal id stays off the node.** Adding it to `SpineEventNode` forced an edit to a `components/` test in HV-1's territory; the spec already routes it through the timings map.
- **No deploy-manifest hold.** The change is meant to go live with `generate-signal`.
- **The PM ruled option A on the adversarial pass's clinical item** (below): merge as built, and file the disclosure and the nausea-signal question for the clinical sitting.

## Verification

- **The before-and-after fixture:** commit 3f4e206b, committed on its own before the lane changed, pins ⑤ and L1 on two records carrying every rating except Refused, captured from the engine as shipped; they pass on every later commit. A seeded differential over 300 records built to fire (204 do, 5,610 feedings rated Picked at) shows ⑤ and L1 identical with every rating erased.
- **The named counterexamples** are tests on the lane, on the spine and on the server: Pixel's refused 10 PM bowl (timed from 8 AM, 845 min, or no line when nothing eaten is in the 24 h window), a staple dinner then a refused snack (190 min from dinner), a picked-at vehicle meal carrying Prednisone (10 min, names the vehicle). Two properties over random records with refusals: every eligible episode is timed from the latest eaten feeding in its lookback, and deleting every refused feeding changes no timing.
- **A real-SQLite test on the production DDL** proves both reads return the event id and the rating, and the C-40 bound.
- **Nine mutations**, each reverted after, each red in the suite that owns it.
- Jest green (after merging `main`: 466 suites, 10,032 passed), `tsc` clean, the touched suites green in Kiritimati, Chatham and Honolulu; Deno 1,840 passed across `supabase/functions/`, `deno check` clean; CI green on every head.

## Reviews

- **`code-reviewer`:** ship-ready. Two nits (a 145-column comment line; "apart from refused ones") and stale "PR 2" wording, fixed in bba6107b. Its note that HV-6 cannot read the id off the node is answered by the spec's pipeline shape.
- **`adversarial-reviewer`: FAIL on two items.**
  1. *Must fix, fixed:* Home's line did not refresh when a bowl was rated Refused after the vomit (the usual order). The card re-read feedings only on today's event ids or `hydrationTick`. Fixed in 7728e994 by bumping the tick in the one rating write path; proven by removing the bump.
  2. *PM ruling:* a cat refusing dinners and vomiting minutes later is now timed from her last eaten meal, so after enough nights L1 says "11 of 11 … 6 or more hours after eating" (verified: median 14.1 h, band 10 PM–2 AM, no intake card), and the trial rows and the report line can say the same. Every sentence is true; none says a refused bowl came first. Before this PR the same records fired ⑤'s false "within 30 min" card. Dr. Chen (the reviewer) asked for a disclosure before merge; Engineering and the Product Owner asked to ship the fix and build the disclosure on its own. The PM ruled A: merge, file the disclosure (CUL-1195) and the nausea-signal question (CUL-1196) for CUL-583.
  - Its DoD line: ⑤ and L1 byte-identical on a record with no refusals (pins + differential, proven by mutating Picked at to false: 6 of 9 red); with 30–60% refused bowls ⑤'s false-fire rate falls and L1 stays at or below 2.2% against its 5% alpha; a refused and an eaten bowl at one instant resolve to the eaten one in both input orders.

## Residuals and follow-ups

- **CUL-1195** (High, clinical): the disclosure for the combined timing claims.
- **CUL-1196** (clinical): whether a vomit minutes after a refused bowl should raise a safety flag.
- **CUL-1190** (High, pre-existing): the food correlation lane counts a refused bowl as an exposure.
- **CUL-1191** (pre-existing): the vet relay says "early-morning" whatever the clock band is.
- **CUL-1192:** an unrated duplicate log beats a Refused, and the report's duplicate rule ignores the rating; sequenced after HV-4's shared rule.
- The intake lane misses a cat whose refusals come and go (evidence on CUL-189).
- An estimated-time meal in the lookback would make the Patterns copy say "no meal logged"; unreachable today (every meal is written witnessed).
- **Deploy:** `generate-signal` inlines the lane, so it redeploys on merge once CUL-1152's first runs are done; until then it goes live with CUL-1152's `all-changed` baseline, which is now not "only versions move" for this function (noted there).
